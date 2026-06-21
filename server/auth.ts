import * as jose from 'jose';
import type { NextFunction, Request, Response } from 'express';

// Neon Auth (Better Auth) issues JWTs signed with the project's keys. We verify
// incoming Bearer tokens against the project's JWKS endpoint. Only tokens signed
// by this project's keys pass — that is the core security guarantee.
const authBaseUrl = process.env.NEON_AUTH_URL;
if (!authBaseUrl) {
  throw new Error('NEON_AUTH_URL is not set (server-side, used for JWKS verification)');
}

const JWKS = jose.createRemoteJWKSet(
  new URL(`${authBaseUrl.replace(/\/$/, '')}/.well-known/jwks.json`)
);

// Neon Auth sets both `iss` and `aud` to the auth server's origin (confirmed from
// a live token). Both are derived from NEON_AUTH_URL so they track per env; each
// can be overridden if Neon's claim shape ever diverges.
const expectedIssuer = process.env.NEON_AUTH_ISSUER || new URL(authBaseUrl).origin;
const expectedAudience = process.env.NEON_AUTH_AUDIENCE || expectedIssuer;

/** Verify a token and return its decoded claims, or null. */
export async function verifyToken(token: string): Promise<jose.JWTPayload | null> {
  try {
    const { payload } = await jose.jwtVerify(token, JWKS, {
      issuer: expectedIssuer,
      audience: expectedAudience,
    });
    return typeof payload.sub === 'string' ? payload : null;
  } catch {
    return null;
  }
}

/** Express middleware: require a valid Neon Auth session; sets req.userId. */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.header('authorization');
  const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
  if (!token) {
    res.status(401).json({ error: 'Missing bearer token' });
    return;
  }
  const payload = await verifyToken(token);
  if (!payload) {
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }
  req.userId = payload.sub;
  req.authClaims = payload;
  next();
}
