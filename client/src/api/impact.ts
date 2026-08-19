import { apiFetch } from './client';
import type { ImpactResult } from './types';

export interface ImpactQuery {
  /** Either a qualified name (ambiguous if it matches >1 symbol) or an exact symbolId — never both. */
  symbol?: string;
  symbolId?: string;
  depth?: number;
}

export function getImpact(repoId: string, query: ImpactQuery): Promise<ImpactResult> {
  const params = new URLSearchParams();
  if (query.symbol) params.set('symbol', query.symbol);
  if (query.symbolId) params.set('symbolId', query.symbolId);
  if (query.depth) params.set('depth', String(query.depth));
  return apiFetch<ImpactResult>(`/repositories/${repoId}/impact?${params.toString()}`);
}
