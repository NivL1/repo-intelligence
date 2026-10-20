/**
 * A thin, typed client for repo-intelligence's HTTP API.
 *
 * Deliberately goes through HTTP rather than importing the Nest services
 * directly: every guard the API already enforces — JWT auth, demo-mode
 * read-only access, the per-IP throttle on `ask` — applies to MCP callers
 * for free, and this package needs none of the server's dependencies
 * (Postgres, Redis, ONNX) to run.
 */

export interface Repository {
  id: string;
  name: string;
  source: string;
  status: 'pending' | 'cloning' | 'indexing' | 'ready' | 'failed';
  indexedCommit: string | null;
  indexedAt: string | null;
  error: string | null;
}

export interface SymbolSummary {
  id: string;
  name: string;
  qualifiedName: string;
  kind: 'class' | 'interface' | 'function' | 'method';
  filePath: string;
  startLine: number;
  endLine: number;
}

export interface ImpactResult {
  symbol: SymbolSummary;
  callers: { symbol: SymbolSummary; depth: number }[];
  affectedModules: string[];
  relatedTests: string[];
}

export interface MapResult {
  mermaid: string;
  scope: 'module' | 'symbol';
  module: string | null;
  nodeCount: number;
  edgeCount: number;
}

export interface AskResult {
  answer: string;
  sources: {
    n: number;
    filePath: string;
    startLine: number;
    endLine: number;
    qualifiedName: string | null;
  }[];
}

/** A non-2xx response, with the API's own JSON error body when it sent one. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: Record<string, unknown> | null,
  ) {
    const detail = body && typeof body.message === 'string' ? body.message : `HTTP ${status}`;
    super(detail);
    this.name = 'ApiError';
  }
}

export interface ApiClientOptions {
  baseUrl: string;
  /** JWT access token. Optional: a demoMode deployment serves every read route without one. */
  token?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

export class ApiClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(private readonly options: ApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.fetchImpl = options.fetch ?? fetch;
    // `ask` is an LLM round-trip on top of retrieval; a cold demo machine
    // can also take a while to wake. 60s is generous without hanging an
    // assistant forever on a dead server.
    this.timeoutMs = options.timeoutMs ?? 60_000;
  }

  listRepositories(): Promise<Repository[]> {
    return this.request('GET', '/repositories');
  }

  getOverview(repositoryId: string): Promise<{ overview: string }> {
    return this.request('GET', `/repositories/${repositoryId}/overview`);
  }

  listSymbols(repositoryId: string): Promise<SymbolSummary[]> {
    return this.request('GET', `/repositories/${repositoryId}/symbols`);
  }

  getImpact(
    repositoryId: string,
    query: { symbol?: string; symbolId?: string; depth?: number },
  ): Promise<ImpactResult> {
    return this.request('GET', `/repositories/${repositoryId}/impact${toQueryString(query)}`);
  }

  getMap(repositoryId: string, query: { module?: string }): Promise<MapResult> {
    return this.request('GET', `/repositories/${repositoryId}/map${toQueryString(query)}`);
  }

  ask(repositoryId: string, question: string): Promise<AskResult> {
    return this.request('POST', `/repositories/${repositoryId}/ask`, { question });
  }

  private async request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = { accept: 'application/json' };
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (this.options.token) headers.authorization = `Bearer ${this.options.token}`;

    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    if (!response.ok) {
      throw new ApiError(response.status, await readJson(response));
    }
    return (await response.json()) as T;
  }
}

function toQueryString(query: Record<string, string | number | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) params.set(key, String(value));
  }
  const encoded = params.toString();
  return encoded ? `?${encoded}` : '';
}

async function readJson(response: Response): Promise<Record<string, unknown> | null> {
  try {
    const parsed: unknown = await response.json();
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
