import { apiFetch } from './client';
import type { Repository } from './types';

export function listRepositories(): Promise<Repository[]> {
  return apiFetch<Repository[]>('/repositories');
}

export function getRepository(id: string): Promise<Repository> {
  return apiFetch<Repository>(`/repositories/${id}`);
}

export function createRepository(source: string): Promise<Repository> {
  return apiFetch<Repository>('/repositories', { method: 'POST', body: { source } });
}

export function indexRepository(id: string): Promise<unknown> {
  return apiFetch(`/repositories/${id}/index`, { method: 'POST' });
}

export function deleteRepository(id: string): Promise<void> {
  return apiFetch<void>(`/repositories/${id}`, { method: 'DELETE' });
}

/**
 * The one-click "Add & Index" flow the dashboard's whole pitch rests on:
 * register, then immediately kick off indexing, so pasting a URL is the
 * only thing the user has to do. index() runs fire-and-forget from the
 * caller's perspective — the repo list's polling picks up the resulting
 * status change, so this function doesn't wait for indexing to finish.
 */
export async function addAndIndexRepository(source: string): Promise<Repository> {
  const repository = await createRepository(source);
  await indexRepository(repository.id);
  return repository;
}
