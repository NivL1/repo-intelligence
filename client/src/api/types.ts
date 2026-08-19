export type RepositoryStatus = 'pending' | 'cloning' | 'indexing' | 'ready' | 'failed';

export interface Repository {
  id: string;
  name: string;
  source: string;
  status: RepositoryStatus;
  indexedCommit: string | null;
  indexedAt: string | null;
  error: string | null;
  createdAt: string;
}

export interface TokenResponse {
  accessToken: string;
  refreshToken: string;
}

/** True while indexing is in flight — the list view polls only these rows. */
export function isInProgress(status: RepositoryStatus): boolean {
  return status === 'pending' || status === 'cloning' || status === 'indexing';
}

// --- impact ---

export type SymbolKind = 'class' | 'interface' | 'function' | 'method';

export interface SymbolSummary {
  id: string;
  name: string;
  qualifiedName: string;
  kind: SymbolKind;
  filePath: string;
  startLine: number;
  endLine: number;
}

export interface ImpactCaller {
  symbol: SymbolSummary;
  depth: number;
}

export interface ImpactResult {
  symbol: SymbolSummary;
  callers: ImpactCaller[];
  affectedModules: string[];
  relatedTests: string[];
}

/** Shape of a 409 ApiError's `body` when a symbol name matches more than one thing. */
export interface AmbiguousSymbolBody {
  message: string;
  candidates: {
    id: string;
    qualifiedName: string;
    kind: SymbolKind;
    filePath: string;
    startLine: number;
  }[];
}

// --- map ---

export type MapScope = 'module' | 'symbol';

export interface MapResult {
  mermaid: string;
  scope: MapScope;
  module: string | null;
  nodeCount: number;
  edgeCount: number;
}

// --- ask ---

export interface AskSource {
  n: number;
  filePath: string;
  startLine: number;
  endLine: number;
  qualifiedName: string | null;
}

export interface AskResult {
  answer: string;
  sources: AskSource[];
}
