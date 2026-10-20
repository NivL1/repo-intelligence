import { apiFetch } from './client';
import type { SymbolSummary } from './types';

export function listSymbols(repoId: string): Promise<SymbolSummary[]> {
  return apiFetch<SymbolSummary[]>(`/repositories/${repoId}/symbols`);
}
