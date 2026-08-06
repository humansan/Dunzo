import { fetchSession } from '@/lib/auth';

// Single seam for all backend calls. Attaches the Neon Auth session token as a
// Bearer token; every data function builds on this.

// ── Token cache ──────────────────────────────────────────────────────────────
//
// This used to call `getSession()` on EVERY request, which meant a cold app load
// fired five session lookups in a burst - one in the route guard, then one per
// parallel prefetch in the loader - against a service whose database may have
// auto-suspended. Five chances for one of them to lose the race with the
// compute waking up, and any single loss took down the load.
//
// The token is a JWT, so it says when it stops being usable; cache it until then
// and one boot needs one lookup. Two guards keep the cache honest:
//
//   • `inflight` - concurrent callers share one request rather than starting a
//     stampede of identical ones (the loader's four prefetches arrive together).
//   • a 401 retry in apiFetch - the cache is a guess about the future, so when
//     the server disagrees the entry is dropped and the call is retried once
//     with a fresh token. That also covers a token revoked before it expired.
//
// Cleared outright on any session transition (see clearTokenCache's callers), so
// a token can never outlive the account it belongs to.
let cached: { token: string | undefined; expiresAt: number } | null = null;
let inflight: Promise<string | undefined> | null = null;

// Used when the token carries no readable expiry. Short, because it is a guess.
const FALLBACK_TTL_MS = 60_000;
// Retire the token before the server does, so a request in flight can't cross the
// boundary and come back 401 on a clock skew of a few seconds.
const EXPIRY_SKEW_MS = 60_000;

// The JWT's `exp`, in ms, minus the skew. Falls back to a short TTL for anything
// this can't read - an opaque token, a malformed one, a missing claim - since the
// 401 retry is what actually guarantees correctness here.
function expiresAtOf(token: string | undefined): number {
  const fallback = Date.now() + FALLBACK_TTL_MS;
  if (!token) return fallback;
  try {
    const payload = token.split('.')[1];
    if (!payload) return fallback;
    const b64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    const bytes = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
    const claims = JSON.parse(new TextDecoder().decode(bytes)) as { exp?: unknown };
    if (typeof claims.exp !== 'number') return fallback;
    return claims.exp * 1000 - EXPIRY_SKEW_MS;
  } catch {
    return fallback;
  }
}

// Drop the cached token. Called on every session transition (sign-in, sign-out,
// a token swap from another tab) so a request can never carry the previous
// account's identity - the same reason the query cache is cleared there.
export function clearTokenCache(): void {
  cached = null;
  inflight = null;
}

async function getToken(): Promise<string | undefined> {
  if (cached && Date.now() < cached.expiresAt) return cached.token;
  if (inflight) return inflight;
  inflight = (async () => {
    // The resilient check: a transient 5xx from the auth service is retried
    // rather than propagated, and an unavailable service yields no token instead
    // of an exception - the request then 401s and is retried below, by which
    // time the compute it was waiting on is awake.
    const { data, unavailable } = await fetchSession();
    const token =
      (data as { session?: { token?: string }; token?: string })?.session?.token ??
      (data as { token?: string })?.token;
    // Don't cache a miss caused by the service being down: the next call should
    // ask again rather than sit on "no token" for a minute.
    if (!unavailable) cached = { token, expiresAt: expiresAtOf(token) };
    return token;
  })().finally(() => {
    inflight = null;
  });
  return inflight;
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
  const send = async (token: string | undefined) => {
    const headers = new Headers(options.headers);
    if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    if (token) headers.set('Authorization', `Bearer ${token}`);
    return fetch(`/api${path}`, { ...options, headers });
  };

  let res = await send(await getToken());
  // The server is the authority on whether a token is still good. Re-send once
  // with a fresh one - this is what makes the cache above safe, and what recovers
  // the request that went out tokenless while the auth service was waking up.
  // Exactly once: a second 401 is a real answer, not a stale token. (Safe to
  // repeat because every body here is a string, not a consumed stream.)
  if (res.status === 401) {
    clearTokenCache();
    res = await send(await getToken());
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new ApiError(res.status, body || res.statusText);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}
