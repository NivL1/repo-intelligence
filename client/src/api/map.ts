import { apiFetch } from './client';
import type { MapResult } from './types';

export function getMap(repoId: string, module?: string): Promise<MapResult> {
  const query = module ? `?module=${encodeURIComponent(module)}` : '';
  return apiFetch<MapResult>(`/repositories/${repoId}/map${query}`);
}
