import type { TokenResponse } from './types';

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

const ACCESS_TOKEN_KEY = 'ri.accessToken';
const REFRESH_TOKEN_KEY = 'ri.refreshToken';

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/**
 * Thrown when a request fails auth and the refresh attempt also fails (or
 * there was no refresh token to try). Distinct from ApiError so callers —
 * in practice just AuthContext — can tell "the session is gone, send the
 * user to /login" apart from an ordinary 4xx/5xx from a valid session.
 */
export class SessionExpiredError extends Error {}

/**
 * Tokens live in localStorage, not memory-only state: a demo tool that
 * logs you out on every page refresh would be actively annoying to use.
 * The tradeoff (XSS could exfiltrate a token) is accepted here — this
 * isn't a production auth system, and the backend's short access-token
 * TTL plus the refresh flow below is the mitigation that exists.
 */
export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function setTokens(tokens: TokenResponse): void {
  localStorage.setItem(ACCESS_TOKEN_KEY, tokens.accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken);
}

export function clearTokens(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  /** Skip the Authorization header — only /auth/login and /auth/register need this. */
  anonymous?: boolean;
}

/**
 * Every authenticated call goes through here so the access-token refresh
 * on a 401 is handled once, centrally, instead of duplicated at every call
 * site. `isRetry` prevents an infinite loop if the refreshed token is
 * itself rejected (refresh token revoked, clock skew, etc.) — one retry,
 * then give up and treat the session as gone.
 */
export async function apiFetch<T>(
  path: string,
  options: RequestOptions = {},
  isRetry = false,
): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (!options.anonymous) {
    const token = getAccessToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  if (response.status === 401 && !options.anonymous && !isRetry) {
    const refreshed = await tryRefresh();
    if (refreshed) return apiFetch<T>(path, options, true);
    clearTokens();
    throw new SessionExpiredError('session expired, please log in again');
  }

  if (response.status === 204) return undefined as T;

  const body = await safeJson(response);
  if (!response.ok) {
    const message = (body as { message?: string | string[] } | null)?.message;
    throw new ApiError(
      response.status,
      Array.isArray(message) ? message.join(', ') : (message ?? response.statusText),
    );
  }

  return body as T;
}

async function tryRefresh(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;

  const response = await fetch(`${BASE_URL}/auth/refresh`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${refreshToken}` },
  });
  if (!response.ok) return false;

  setTokens((await response.json()) as TokenResponse);
  return true;
}

async function safeJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
