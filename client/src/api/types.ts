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
