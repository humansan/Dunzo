import { createAuthClient } from '@neondatabase/neon-js/auth';
import { BetterAuthReactAdapter } from '@neondatabase/neon-js/auth/react/adapters';

// We point the client at a same-origin path (`/api/neon-auth`) that the backend
// reverse-proxies to Neon Auth, so the session cookie is first-party. Without
// this, iOS/Safari drops the third-party cookie and login silently fails. See the
// proxy in server/app.ts. Resolve a relative value against the current origin,
// since the Better Auth client needs an absolute base URL in the browser.
const configuredUrl = import.meta.env.VITE_NEON_AUTH_URL;
const authUrl = /^https?:\/\//.test(configuredUrl)
  ? configuredUrl
  : new URL(configuredUrl, window.location.origin).toString();

// The React adapter is required for `authClient.useSession()` to work; without
// it createAuthClient returns a vanilla client with no React hooks.
export const authClient = createAuthClient(authUrl, {
  adapter: BetterAuthReactAdapter(),
});

// ── The session check, made survivable ───────────────────────────────────────
//
// Every route guard and every API call needs to know whether there is a session,
// and each one used to await a bare `getSession()`. That call reaches Neon Auth,
// which reads its session table from the same Neon Postgres this app uses - so
// when the compute has auto-suspended (scale-to-zero after a few idle minutes),
// the first request back can 500 with a connection timeout while the compute
// wakes. A single unlucky call would then throw an AuthError out of the guard and
// blank the app behind "Couldn't load your data", even though the user was signed
// in the whole time and a reload one second later worked.
//
// So the answer is three-valued, not two. "No session" and "can't tell right now"
// are different facts and only the first is a reason to send someone to /login:
//
//   active      → there is a session
//   none        → there is definitively no session (redirect to /login)
//   unavailable → the auth service didn't answer (proceed; see below)
//
// `unavailable` is safe to proceed on because nothing downstream trusts it: API
// calls carry no token and come back 401, and `useSession()` keeps resolving in
// the background - so a genuinely signed-out user still lands on /login via
// AppShell's redirect-out effect, one beat later, instead of on an error screen.
const RETRY_DELAYS_MS = [250, 750];

// A 401/403 IS the answer ("no session"), not a failure to get one, so it must
// never be retried or reported as unavailable - that would put a signed-out user
// through three pointless round trips and then past the guard.
const DEFINITIVE_STATUSES = new Set([401, 403]);
const statusOf = (e: unknown): number | undefined => {
  const any = e as { status?: unknown; statusCode?: unknown; response?: { status?: unknown } };
  const raw = any?.status ?? any?.statusCode ?? any?.response?.status;
  return typeof raw === 'number' ? raw : undefined;
};

export interface SessionCheck {
  // The session payload when there is one, else null.
  data: unknown;
  // True when the auth service could not be reached or errored - the caller must
  // not read `data === null` as "signed out".
  unavailable: boolean;
}

export async function fetchSession(): Promise<SessionCheck> {
  let lastError: unknown;
  for (let attempt = 0; ; attempt++) {
    try {
      // Adapters differ about whether a failure rejects or comes back on `error`;
      // normalize both into the catch below.
      const res = (await authClient.getSession()) as { data?: unknown; error?: unknown };
      if (res?.error) throw res.error;
      return { data: res?.data ?? null, unavailable: false };
    } catch (err) {
      const status = statusOf(err);
      if (status !== undefined && DEFINITIVE_STATUSES.has(status)) {
        return { data: null, unavailable: false };
      }
      lastError = err;
      if (attempt >= RETRY_DELAYS_MS.length) break;
      await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
    }
  }
  // Warn rather than throw: every caller has a defined behaviour for this, and
  // the one thing none of them should do is take the app down.
  console.warn('[auth] session check unavailable after retries:', lastError);
  return { data: null, unavailable: true };
}
