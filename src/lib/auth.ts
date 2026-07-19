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
