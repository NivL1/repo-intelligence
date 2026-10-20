import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { ApiClient, ApiError, Repository, SymbolSummary } from './api-client';

// Mirrors the server's own bounds (src/impact/dto/impact-query.dto.ts) so a
// bad depth is rejected by the schema the assistant sees, not by a 400 later.
const MAX_IMPACT_DEPTH = 10;
const MAX_SYMBOL_RESULTS = 200;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const repositoryParam = z
  .string()
  .min(1)
  .describe(
    'Repository name as listed by list_repositories (e.g. "NivL1/nestjs-ai-starter", or just ' +
      '"nestjs-ai-starter" when unambiguous), or its id.',
  );

/** Thrown for problems the assistant can fix by changing its call — surfaced as a tool error. */
class ToolInputError extends Error {}

export function registerTools(server: McpServer, api: ApiClient): void {
  server.registerTool(
    'list_repositories',
    {
      title: 'List repositories',
      description:
        'List the repositories this repo-intelligence server has indexed, with their status. ' +
        'Only repositories with status "ready" can be queried by the other tools.',
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    () =>
      run(async () => {
        const repositories = await api.listRepositories();
        if (repositories.length === 0) return 'No repositories are registered on this server.';
        return repositories.map(formatRepository).join('\n');
      }),
  );

  server.registerTool(
    'get_overview',
    {
      title: 'Repository overview',
      description:
        'A short summary of what a repository does and its key features. LLM-generated, but ' +
        'grounded in the extracted module/class/interface structure rather than raw source. ' +
        'A good first call on an unfamiliar repository.',
      inputSchema: { repository: repositoryParam },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    ({ repository }) =>
      run(async () => {
        const repo = await resolveRepository(api, repository);
        const { overview } = await api.getOverview(repo.id);
        return `${header(repo)}\n\n${overview}`;
      }),
  );

  server.registerTool(
    'find_symbols',
    {
      title: 'Find symbols',
      description:
        'Search the classes, interfaces, functions and methods extracted from a repository by ' +
        'the TypeScript compiler. Use this to find the exact qualified name (e.g. ' +
        '"SearchService.search") or id that impact needs. Matches are case-insensitive ' +
        'substrings of the qualified name or file path.',
      inputSchema: {
        repository: repositoryParam,
        query: z
          .string()
          .optional()
          .describe('Substring to match against qualified name or file path. Omit to list all.'),
        kind: z.enum(['class', 'interface', 'function', 'method']).optional(),
        limit: z.number().int().min(1).max(MAX_SYMBOL_RESULTS).default(50),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    ({ repository, query, kind, limit }) =>
      run(async () => {
        const repo = await resolveRepository(api, repository);
        const needle = query?.toLowerCase();
        const matches = (await api.listSymbols(repo.id)).filter(
          (s) =>
            (!kind || s.kind === kind) &&
            (!needle ||
              s.qualifiedName.toLowerCase().includes(needle) ||
              s.filePath.toLowerCase().includes(needle)),
        );
        if (matches.length === 0) return `${header(repo)}\n\nNo matching symbols.`;

        const shown = matches.slice(0, limit);
        const more =
          matches.length > shown.length
            ? `\n\n${matches.length - shown.length} more not shown — narrow the query or raise limit.`
            : '';
        return `${header(repo)}\n\n${matches.length} matching symbol(s):\n${shown.map(formatSymbol).join('\n')}${more}`;
      }),
  );

  server.registerTool(
    'impact',
    {
      title: 'Impact analysis',
      description:
        'What breaks if a symbol changes: walks the call graph backwards to find its direct ' +
        'and transitive callers, the modules they live in, and spec files that likely cover ' +
        'them. Deterministic — pure graph traversal over the TypeScript compiler’s symbol ' +
        'graph, no LLM — so the answer is exact for the indexed commit. Call before editing a ' +
        'function or method to know what else to check.',
      inputSchema: {
        repository: repositoryParam,
        symbol: z
          .string()
          .optional()
          .describe(
            'Qualified name, e.g. "AuthService.login" for a method or "toVectorLiteral" for a ' +
              'top-level function. Use find_symbols if unsure of the exact name.',
          ),
        symbolId: z
          .string()
          .optional()
          .describe('Exact symbol id from find_symbols — use when a name is ambiguous.'),
        depth: z
          .number()
          .int()
          .min(1)
          .max(MAX_IMPACT_DEPTH)
          .default(3)
          .describe('How many hops of callers to walk.'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    ({ repository, symbol, symbolId, depth }) =>
      run(async () => {
        if (!symbol && !symbolId) throw new ToolInputError('Provide either symbol or symbolId.');
        const repo = await resolveRepository(api, repository);
        try {
          const result = await api.getImpact(repo.id, { symbol, symbolId, depth });
          return formatImpact(
            repo,
            result.symbol,
            result.callers,
            result.affectedModules,
            result.relatedTests,
            depth,
          );
        } catch (error) {
          if (error instanceof ApiError && error.status === 409) return formatAmbiguous(error);
          if (error instanceof ApiError && error.status === 404 && symbol) {
            throw new ToolInputError(await notFoundHint(api, repo.id, symbol));
          }
          throw error;
        }
      }),
  );

  server.registerTool(
    'map',
    {
      title: 'Architecture map',
      description:
        'A Mermaid flowchart of the repository’s architecture, built from the symbol graph. ' +
        'By default shows modules (top-level directories under src/) and how strongly they ' +
        'are coupled; pass module to zoom into one module’s individual symbols and their ' +
        'direct neighbours. Deterministic — no LLM.',
      inputSchema: {
        repository: repositoryParam,
        module: z
          .string()
          .optional()
          .describe('Module to zoom into, e.g. "auth". Omit for the whole-repo view.'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    ({ repository, module }) =>
      run(async () => {
        const repo = await resolveRepository(api, repository);
        const result = await api.getMap(repo.id, { module });
        const scope = result.module ? `module "${result.module}"` : 'whole repository, by module';
        return (
          `${header(repo)}\n\nArchitecture map — ${scope} ` +
          `(${result.nodeCount} nodes, ${result.edgeCount} edges):\n\n` +
          '```mermaid\n' +
          result.mermaid +
          '\n```'
        );
      }),
  );

  server.registerTool(
    'ask',
    {
      title: 'Ask about the code',
      description:
        'Answer a conceptual question about a repository ("how does auth work?") with ' +
        'citations. Hybrid retrieval — vector similarity, exact symbol-name matches, and one ' +
        'hop of call-graph expansion — feeds an LLM that answers only from the retrieved ' +
        'excerpts and cites each claim as [n]. Unlike impact and map this involves an LLM, ' +
        'so treat answers as a well-sourced starting point and check the cited lines. ' +
        'Rate-limited on public deployments.',
      inputSchema: {
        repository: repositoryParam,
        question: z.string().min(1).max(2000),
      },
      annotations: { readOnlyHint: true, idempotentHint: false, openWorldHint: false },
    },
    ({ repository, question }) =>
      run(async () => {
        const repo = await resolveRepository(api, repository);
        const { answer, sources } = await api.ask(repo.id, question);
        const cited = sources
          .map(
            (s) =>
              `[${s.n}] ${s.filePath}:${s.startLine}-${s.endLine}` +
              (s.qualifiedName ? ` (${s.qualifiedName})` : ''),
          )
          .join('\n');
        return `${header(repo)}\n\n${answer}\n\nSources:\n${cited || '(none)'}`;
      }),
  );
}

/**
 * Accepts an id, a full name ("owner/repo"), or a bare repo name when it's
 * unambiguous, so an assistant can use whatever the user called it.
 */
export async function resolveRepository(api: ApiClient, input: string): Promise<Repository> {
  const repositories = await api.listRepositories();
  const wanted = input.trim().toLowerCase();

  let matches = repositories.filter(
    (r) => (UUID.test(wanted) && r.id.toLowerCase() === wanted) || r.name.toLowerCase() === wanted,
  );
  if (matches.length === 0) {
    matches = repositories.filter((r) => r.name.toLowerCase().split('/').pop() === wanted);
  }

  const available = repositories.map((r) => r.name).join(', ') || '(none)';
  if (matches.length === 0) {
    throw new ToolInputError(`No repository matches "${input}". Available: ${available}.`);
  }
  if (matches.length > 1) {
    throw new ToolInputError(
      `"${input}" matches more than one repository (${matches.map((r) => r.name).join(', ')}) — use the full name.`,
    );
  }

  const [repo] = matches;
  if (repo.status !== 'ready') {
    const reason = repo.status === 'failed' && repo.error ? `: ${repo.error}` : '';
    throw new ToolInputError(
      `Repository "${repo.name}" is not ready to query (status: ${repo.status}${reason}).`,
    );
  }
  return repo;
}

/** Turns every failure into a tool error the assistant can read, rather than a protocol error. */
async function run(fn: () => Promise<string>): Promise<CallToolResult> {
  try {
    return { content: [{ type: 'text', text: await fn() }] };
  } catch (error) {
    return { isError: true, content: [{ type: 'text', text: describeError(error) }] };
  }
}

function describeError(error: unknown): string {
  if (error instanceof ToolInputError) return error.message;
  if (error instanceof ApiError) {
    switch (error.status) {
      case 401:
        return (
          'The repo-intelligence server requires authentication. Set REPO_INTELLIGENCE_TOKEN ' +
          'to a JWT access token (from POST /auth/login) in this MCP server’s environment.'
        );
      case 429:
        return 'Rate limited by the repo-intelligence server — wait a few minutes before retrying.';
      default:
        return `repo-intelligence API error (${error.status}): ${error.message}`;
    }
  }
  if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
    return 'The repo-intelligence server did not respond in time.';
  }
  return `Could not reach the repo-intelligence server: ${error instanceof Error ? error.message : String(error)}`;
}

async function notFoundHint(api: ApiClient, repositoryId: string, symbol: string): Promise<string> {
  // The API looks up by exact qualified name only. The most common miss is
  // a bare method name ("login" instead of "AuthService.login"), so offer
  // the qualified names that end with what was asked for.
  const wanted = symbol.toLowerCase();
  const suggestions = (await api.listSymbols(repositoryId))
    .filter(
      (s) =>
        s.name.toLowerCase() === wanted || s.qualifiedName.toLowerCase().endsWith(`.${wanted}`),
    )
    .slice(0, 10);
  const base = `No symbol with qualified name "${symbol}".`;
  if (suggestions.length === 0) return `${base} Use find_symbols to search for it.`;
  return `${base} Did you mean one of these?\n${suggestions.map(formatSymbol).join('\n')}`;
}

function header(repo: Repository): string {
  const commit = repo.indexedCommit ? ` @ ${repo.indexedCommit.slice(0, 7)}` : '';
  return `Repository: ${repo.name}${commit}`;
}

function formatRepository(repo: Repository): string {
  const commit = repo.indexedCommit ? `, commit ${repo.indexedCommit.slice(0, 7)}` : '';
  const error = repo.status === 'failed' && repo.error ? ` — ${repo.error}` : '';
  return `- ${repo.name} (id ${repo.id}): ${repo.status}${commit}${error}`;
}

function formatSymbol(symbol: SymbolSummary): string {
  return `- ${symbol.qualifiedName} [${symbol.kind}] ${symbol.filePath}:${symbol.startLine} (id ${symbol.id})`;
}

function formatImpact(
  repo: Repository,
  symbol: SymbolSummary,
  callers: { symbol: SymbolSummary; depth: number }[],
  affectedModules: string[],
  relatedTests: string[],
  depth: number,
): string {
  const lines = [
    header(repo),
    '',
    `Impact of changing ${symbol.qualifiedName} (${symbol.filePath}:${symbol.startLine}), walking up to ${depth} hop(s) of callers:`,
  ];

  if (callers.length === 0) {
    lines.push('', 'No callers found in the call graph.');
  } else {
    const byDepth = new Map<number, SymbolSummary[]>();
    for (const caller of callers) {
      byDepth.set(caller.depth, [...(byDepth.get(caller.depth) ?? []), caller.symbol]);
    }
    for (const d of [...byDepth.keys()].sort((a, b) => a - b)) {
      const label = d === 1 ? 'Direct callers' : `Depth ${d}`;
      lines.push('', `${label}:`);
      for (const s of byDepth.get(d)!)
        lines.push(`- ${s.qualifiedName} (${s.filePath}:${s.startLine})`);
    }
  }

  lines.push(
    '',
    `Affected modules: ${affectedModules.length ? affectedModules.join(', ') : '(none)'}`,
  );
  lines.push(
    `Related tests (by filename convention, not coverage data): ${relatedTests.length ? relatedTests.join(', ') : '(none found)'}`,
  );
  return lines.join('\n');
}

function formatAmbiguous(error: ApiError): string {
  const candidates = Array.isArray(error.body?.candidates)
    ? (error.body.candidates as Pick<
        SymbolSummary,
        'id' | 'qualifiedName' | 'kind' | 'filePath' | 'startLine'
      >[])
    : [];
  return (
    `${error.message}\n` +
    candidates
      .map((c) => `- ${c.qualifiedName} [${c.kind}] ${c.filePath}:${c.startLine} (id ${c.id})`)
      .join('\n')
  );
}
