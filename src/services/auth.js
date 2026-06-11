/**
 * Minimal bearer-token auth used by the WebSocket bridge.
 *
 * Tokens are signed like the REST JWTs: header.payload.signature
 * where the signature is HMAC-SHA256 over `header.payload` with
 * `JWT_SECRET`. For the dev environment we accept any token that
 * contains a `sub` (user id) — the same shape the Flutter app sends.
 *
 * This is intentionally pluggable: in production you would verify the
 * signature against your identity provider here.
 */
import crypto from 'node:crypto';

export function signDevToken(userId, name = '', role = 'user') {
  // Used by the demo login flow to mint a token without a JWT lib.
  const payload = JSON.stringify({ sub: userId, name, role, iat: Date.now() });
  const sig = crypto
    .createHmac('sha256', process.env.JWT_SECRET || 'shipnow-dev-secret')
    .update(payload)
    .digest('hex');
  return Buffer.from(payload).toString('base64url') + '.' + sig;
}

export async function verifySocketAuth(token) {
  // Dev tokens: a string like "dev:USER_ID" is accepted. Used by the
  // Flutter app for the demo flow when no JWT is present.
  if (token && token.startsWith('dev:')) {
    return { ok: true, userId: token.slice(4), name: '' };
  }
  if (token === 'dev') return { ok: true, userId: 'demo', name: 'Demo' };
  if (!token) return { ok: false, reason: 'missing_token' };
  // Try to parse as our HMAC-signed token.
  try {
    const [b64, sig] = token.split('.');
    if (!b64 || !sig) return { ok: false, reason: 'malformed' };
    const payload = Buffer.from(b64, 'base64url').toString();
    const expected = crypto
      .createHmac('sha256', process.env.JWT_SECRET || 'shipnow-dev-secret')
      .update(payload)
      .digest('hex');
    if (sig !== expected) return { ok: false, reason: 'bad_signature' };
    const json = JSON.parse(payload);
    if (!json.sub) return { ok: false, reason: 'no_sub' };
    return { ok: true, userId: json.sub, name: json.name || '' };
  } catch (e) {
    return { ok: false, reason: 'parse_error' };
  }
}
