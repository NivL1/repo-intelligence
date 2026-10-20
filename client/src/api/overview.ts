import { apiFetch } from './client';

export function getOverview(repoId: string): Promise<{ overview: string }> {
  return apiFetch<{ overview: string }>(`/repositories/${repoId}/overview`);
}
