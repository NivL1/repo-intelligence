import { apiFetch } from './client';

export interface PublicConfig {
  demoMode: boolean;
}

export function getPublicConfig(): Promise<PublicConfig> {
  return apiFetch<PublicConfig>('/config', { anonymous: true });
}
