import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { sql } from 'drizzle-orm';
import { db } from './db';
import { requireAuth } from './auth';
import { asyncHandler, errorMiddleware } from './http';
import { todosRouter } from './routes/todos';
import { workspacesRouter } from './routes/workspaces';
import { trackersRouter } from './routes/trackers';
import { settingsRouter } from './routes/settings';

// The configured Express app, with no `listen` - so it can be used both by the
// local dev server (server/index.ts) and as a Vercel Function (api/index.ts).
const app = express();

// ── Neon Auth reverse proxy (BFF) ────────────────────────────────────────────
// Neon Auth (Better Auth) keeps the session in a cookie set on *its* domain. When
// the browser talks to that domain directly it's a third-party cookie, which iOS
// WebKit (Safari + every iOS browser) drops - so login silently bounces back to
// the sign-in screen. Proxying auth through our own origin makes that cookie
// first-party, which every browser keeps. This is the same shape Neon ships for
// Next.js (`@neondatabase/auth/next` proxies). The client points at
// `/api/neon-auth`; JWT verification (server/auth.ts) is unchanged.
//
// Mounted BEFORE express.json() so the raw request body streams through untouched.
// Express strips the `/api/neon-auth` mount prefix; http-proxy's default
// prependPath re-adds the target's `/neondb/auth` path, so no pathRewrite needed.
const neonAuthUrl = process.env.NEON_AUTH_URL;
if (!neonAuthUrl) {
  throw new Error('NEON_AUTH_URL is not set (used as the Neon Auth proxy target)');
}
const isProd = process.env.NODE_ENV === 'production';
app.use(
  '/api/neon-auth',
  createProxyMiddleware({
    target: neonAuthUrl,
    changeOrigin: true, // rewrite Host to Neon's vhost; keeps the browser Origin header intact
    // Strip the `Domain=…neon.tech` attribute so Set-Cookie binds to our origin
    // (a cross-domain Domain would be rejected by the browser). Host-only = first-party.
    cookieDomainRewrite: '',
    on: {
      proxyRes: (proxyRes) => {
        // Over http://localhost a `Secure` cookie is browser-dependent; drop Secure
        // and pin SameSite=Lax in dev so sessions persist locally. Untouched in prod
        // (HTTPS), where Neon's own Secure/SameSite values are correct first-party.
        if (isProd) return;
        const setCookie = proxyRes.headers['set-cookie'];
        if (Array.isArray(setCookie)) {
          proxyRes.headers['set-cookie'] = setCookie.map((c) =>
            c
              .replace(/;\s*Secure/gi, '')
              .replace(/;\s*SameSite=None/gi, '; SameSite=Lax')
          );
        }
      },
    },
  })
);

app.use(express.json({ limit: '5mb' }));

// CORS. On Vercel the frontend and API share one origin (requests are relative
// /api → same function host), so this is a no-op there; it stays useful for the
// local Vite proxy and any direct cross-origin call.
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', process.env.APP_URL || '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PATCH,PUT,DELETE,OPTIONS');
  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
});

// Liveness check (no auth).
app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

// Proof endpoint: returns the authenticated user's id.
app.get('/api/me', requireAuth, (req, res) => {
  res.json({ userId: req.userId });
});

// Public: does an account already exist for this email? Used by the email-first
// signup step to steer existing users to log in instead of creating a duplicate.
// Reads Neon Auth's (Better Auth) `neon_auth."user"` table - `user` is a reserved
// word so it must be quoted. Fail-open: if the table/query is unavailable, report
// `exists: false` so signup is never wrongly blocked (Better Auth still rejects a
// true duplicate at signUp time).
app.get(
  '/api/auth/email-exists',
  asyncHandler(async (req, res) => {
    const email = String(req.query.email ?? '').trim().toLowerCase();
    if (!email) {
      res.json({ exists: false });
      return;
    }
    try {
      const result: any = await db.execute(
        sql`select 1 from neon_auth."user" where lower(email) = ${email} limit 1`
      );
      const rows = result?.rows ?? result ?? [];
      res.json({ exists: Array.isArray(rows) ? rows.length > 0 : Boolean(rows) });
    } catch (err) {
      console.warn('[api] email-exists check failed:', err);
      res.json({ exists: false });
    }
  })
);

// Data API - all scoped by the authenticated user_id.
app.use('/api/todos', requireAuth, todosRouter);
app.use('/api/workspaces', requireAuth, workspacesRouter);
app.use('/api/trackers', requireAuth, trackersRouter);
app.use('/api/settings', requireAuth, settingsRouter);

// Final error handler (must be last).
app.use(errorMiddleware);

export default app;
