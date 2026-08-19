import { apiFetch } from './client';
import type { AskResult } from './types';

export function ask(repoId: string, question: string): Promise<AskResult> {
  return apiFetch<AskResult>(`/repositories/${repoId}/ask`, {
    method: 'POST',
    body: { question },
  });
}
