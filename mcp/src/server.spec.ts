import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { ApiClient, Repository, SymbolSummary } from './api-client';
import { createServer } from './server';

const STARTER: Repository = {
  id: 'a7a88489-b279-4d3b-876c-83d60cca5e58',
  name: 'NivL1/nestjs-ai-starter',
  source: 'https://github.com/NivL1/nestjs-ai-starter',
  status: 'ready',
  indexedCommit: '7822fa7d09e76827ac95a8881e5d305848ccf8ee',
  indexedAt: '2026-08-19T22:17:39.880Z',
  error: null,
};

const PENDING: Repository = {
  ...STARTER,
  id: '4bce804c-321c-4220-bb66-898401663363',
  name: 'NivL1/repo-intelligence',
  status: 'indexing',
  indexedCommit: null,
};

const LOGIN: SymbolSummary = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'login',
  qualifiedName: 'AuthService.login',
  kind: 'method',
  filePath: 'src/auth/auth.service.ts',
  startLine: 40,
  endLine: 52,
};

const CONTROLLER_LOGIN: SymbolSummary = {
  ...LOGIN,
  id: '22222222-2222-4222-8222-222222222222',
  qualifiedName: 'AuthController.login',
  filePath: 'src/auth/auth.controller.ts',
  startLine: 20,
};

type Route = (url: URL, init: RequestInit) => { status?: number; body: unknown };

/** A fetch stand-in that routes by "METHOD /path" and records every call. */
function fakeFetch(routes: Record<string, Route>) {
  const calls: { method: string; url: URL; init: RequestInit }[] = [];
  const impl = (async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = new URL(String(input));
    const method = init.method ?? 'GET';
    calls.push({ method, url, init });
    const route = routes[`${method} ${url.pathname}`];
    const { status = 200, body } = route
      ? route(url, init)
      : { status: 404, body: { message: 'Not Found' } };
    return new Response(JSON.stringify(body), { status });
  }) as typeof fetch;
  return { impl, calls };
}

const base = `/repositories/${STARTER.id}`;

async function connect(routes: Record<string, Route>, token?: string) {
  const fetch = fakeFetch({
    'GET /repositories': () => ({ body: [STARTER, PENDING] }),
    ...routes,
  });
  const api = new ApiClient({ baseUrl: 'https://ri.example/', token, fetch: fetch.impl });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await createServer(api).connect(serverTransport);
  const client = new Client({ name: 'test', version: '0.0.0' });
  await client.connect(clientTransport);

  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const result = (await client.callTool({ name, arguments: args })) as CallToolResult;
    const text = result.content.map((c) => (c.type === 'text' ? c.text : '')).join('');
    return { text, isError: result.isError ?? false };
  };
  return { client, call, calls: fetch.calls };
}

describe('repo-intelligence MCP server', () => {
  it('exposes the read-only tools, all annotated as read-only', async () => {
    const { client } = await connect({});
    const { tools } = await client.listTools();

    expect(tools.map((t) => t.name).sort()).toEqual(
      ['ask', 'find_symbols', 'get_overview', 'impact', 'list_repositories', 'map'].sort(),
    );
    for (const tool of tools) expect(tool.annotations?.readOnlyHint).toBe(true);
  });

  it('lists repositories with their status', async () => {
    const { call } = await connect({});
    const { text } = await call('list_repositories');

    expect(text).toContain('NivL1/nestjs-ai-starter');
    expect(text).toContain('ready, commit 7822fa7');
    expect(text).toContain('NivL1/repo-intelligence');
    expect(text).toContain('indexing');
  });

  describe('repository resolution', () => {
    const routes = { [`GET ${base}/map`]: () => ({ body: mapBody() }) };

    it.each([
      STARTER.id,
      'NivL1/nestjs-ai-starter',
      'nestjs-ai-starter',
      'NIVL1/NESTJS-AI-STARTER',
    ])('resolves %s', async (repository) => {
      const { call } = await connect(routes);
      const { isError } = await call('map', { repository });
      expect(isError).toBe(false);
    });

    it('names the available repositories when nothing matches', async () => {
      const { call } = await connect(routes);
      const { text, isError } = await call('map', { repository: 'nope' });

      expect(isError).toBe(true);
      expect(text).toContain('Available: NivL1/nestjs-ai-starter, NivL1/repo-intelligence');
    });

    it('refuses a repository that is not ready, without querying it', async () => {
      const { call, calls } = await connect({});
      const { text, isError } = await call('map', { repository: 'repo-intelligence' });

      expect(isError).toBe(true);
      expect(text).toContain('not ready to query (status: indexing)');
      expect(calls.map((c) => c.url.pathname)).toEqual(['/repositories']);
    });
  });

  describe('impact', () => {
    it('passes the query through and groups callers by depth', async () => {
      const { call, calls } = await connect({
        [`GET ${base}/impact`]: () => ({
          body: {
            symbol: LOGIN,
            callers: [
              { symbol: CONTROLLER_LOGIN, depth: 1 },
              { symbol: { ...LOGIN, qualifiedName: 'AppModule.bootstrap' }, depth: 2 },
            ],
            affectedModules: ['auth'],
            relatedTests: ['src/auth/auth.service.spec.ts'],
          },
        }),
      });

      const { text, isError } = await call('impact', {
        repository: 'nestjs-ai-starter',
        symbol: 'AuthService.login',
        depth: 2,
      });

      expect(isError).toBe(false);
      const impactCall = calls.find((c) => c.url.pathname.endsWith('/impact'))!;
      expect(impactCall.url.searchParams.get('symbol')).toBe('AuthService.login');
      expect(impactCall.url.searchParams.get('depth')).toBe('2');
      expect(text).toMatch(/Direct callers:\n- AuthController\.login/);
      expect(text).toMatch(/Depth 2:\n- AppModule\.bootstrap/);
      expect(text).toContain('Affected modules: auth');
      expect(text).toContain('src/auth/auth.service.spec.ts');
    });

    it('requires symbol or symbolId', async () => {
      const { call } = await connect({});
      const { text, isError } = await call('impact', { repository: 'nestjs-ai-starter' });

      expect(isError).toBe(true);
      expect(text).toBe('Provide either symbol or symbolId.');
    });

    it('lists candidates with ids when the name is ambiguous', async () => {
      const { call } = await connect({
        [`GET ${base}/impact`]: () => ({
          status: 409,
          body: {
            message: '"login" matches 2 symbols — retry with symbolId to disambiguate',
            candidates: [LOGIN, CONTROLLER_LOGIN],
          },
        }),
      });

      const { text } = await call('impact', { repository: 'nestjs-ai-starter', symbol: 'login' });

      expect(text).toContain('retry with symbolId');
      expect(text).toContain(
        `AuthService.login [method] src/auth/auth.service.ts:40 (id ${LOGIN.id})`,
      );
      expect(text).toContain(`(id ${CONTROLLER_LOGIN.id})`);
    });

    it('suggests qualified names when a bare method name is not found', async () => {
      const { call } = await connect({
        [`GET ${base}/impact`]: () => ({
          status: 404,
          body: { message: 'no symbol named "login"' },
        }),
        [`GET ${base}/symbols`]: () => ({ body: [LOGIN, CONTROLLER_LOGIN] }),
      });

      const { text, isError } = await call('impact', {
        repository: 'nestjs-ai-starter',
        symbol: 'login',
      });

      expect(isError).toBe(true);
      expect(text).toContain('Did you mean one of these?');
      expect(text).toContain('AuthService.login');
      expect(text).toContain('AuthController.login');
    });
  });

  it('find_symbols filters by substring and kind, and reports truncation', async () => {
    const iface: SymbolSummary = { ...LOGIN, qualifiedName: 'AuthTokens', kind: 'interface' };
    const { call } = await connect({
      [`GET ${base}/symbols`]: () => ({ body: [LOGIN, CONTROLLER_LOGIN, iface] }),
    });

    const methods = await call('find_symbols', {
      repository: 'nestjs-ai-starter',
      query: 'auth',
      kind: 'method',
      limit: 1,
    });
    expect(methods.text).toContain('2 matching symbol(s)');
    expect(methods.text).toContain('AuthService.login');
    expect(methods.text).not.toContain('AuthTokens');
    expect(methods.text).toContain('1 more not shown');
  });

  it('map returns the diagram in a mermaid fence', async () => {
    const { call, calls } = await connect({
      [`GET ${base}/map`]: () => ({ body: mapBody('auth') }),
    });

    const { text } = await call('map', { repository: 'nestjs-ai-starter', module: 'auth' });

    expect(calls.at(-1)!.url.searchParams.get('module')).toBe('auth');
    expect(text).toContain('module "auth" (2 nodes, 1 edges)');
    expect(text).toContain('```mermaid\nflowchart LR');
  });

  it('ask posts the question and lists cited sources', async () => {
    const { call, calls } = await connect({
      [`POST ${base}/ask`]: () => ({
        body: {
          answer: 'Login checks the password hash [1].',
          sources: [{ n: 1, ...LOGIN }],
        },
      }),
    });

    const { text } = await call('ask', {
      repository: 'nestjs-ai-starter',
      question: 'How does login work?',
    });

    const askCall = calls.at(-1)!;
    expect(askCall.method).toBe('POST');
    expect(JSON.parse(String(askCall.init.body))).toEqual({ question: 'How does login work?' });
    expect(text).toContain('Login checks the password hash [1].');
    expect(text).toContain('[1] src/auth/auth.service.ts:40-52 (AuthService.login)');
  });

  it('sends the bearer token when configured', async () => {
    const { call, calls } = await connect({}, 'secret-token');
    await call('list_repositories');

    expect(new Headers(calls[0].init.headers).get('authorization')).toBe('Bearer secret-token');
  });

  it.each([
    [401, 'REPO_INTELLIGENCE_TOKEN'],
    [429, 'Rate limited'],
    [500, 'repo-intelligence API error (500)'],
  ])('turns HTTP %i into a readable tool error', async (status, expected) => {
    const { call } = await connect({
      'GET /repositories': () => ({ status, body: { message: 'nope' } }),
    });
    const { text, isError } = await call('list_repositories');

    expect(isError).toBe(true);
    expect(text).toContain(expected);
  });
});

function mapBody(module: string | null = null) {
  return {
    mermaid: 'flowchart LR\n  n0["auth"]\n  n1["users"]\n  n0 --> n1',
    scope: module ? 'symbol' : 'module',
    module,
    nodeCount: 2,
    edgeCount: 1,
  };
}
