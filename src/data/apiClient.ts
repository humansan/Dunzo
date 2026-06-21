import { authClient } from '../auth';

// Single seam for all backend calls. Pulls a fresh session token from Neon Auth
// and attaches it as a Bearer token. Phase 3/4 data functions build on this.

async function getToken(): Promise<string | undefined> {
  const { data } = await authClient.getSession();
  // Token location varies by adapter shape; check both.
  return (data as any)?.session?.token ?? (data as any)?.token;
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function apiFetch<T = unknown>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = await getToken();
  const headers = new Headers(options.headers);
  if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const res = await fetch(`/api${path}`, { ...options, headers });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new ApiError(res.status, body || res.statusText);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}
