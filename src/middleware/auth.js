import { Router } from 'express';

/**
 * Lightweight request-logging + CORS middleware factory.
 *
 * Production deployments should authenticate requests with a Supabase
 * JWT (verify against the JWKS endpoint) and add rate limits per user.
 * This is left as a no-op stub so the dev server is easy to stand up.
 */
export function buildAuthMiddleware() {
  return (_req, _res, next) => next();
}
