import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';

// Use distinct secrets for access and refresh so a refresh token cannot be
// submitted to a resource endpoint and vice-versa.
const ACCESS_SECRET =
  process.env.JWT_ACCESS_SECRET || 'dev-access-secret-change-in-production';
const REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret-change-in-production';

const ACCESS_TTL = process.env.JWT_ACCESS_TTL || '15m';
const REFRESH_TTL = process.env.JWT_REFRESH_TTL || '7d';

export function signAccessToken(payload) {
  // jti makes every access token unique even when issued within the same second
  return jwt.sign({ ...payload, jti: crypto.randomUUID() }, ACCESS_SECRET, {
    expiresIn: ACCESS_TTL,
  });
}

export function verifyAccessToken(token) {
  return jwt.verify(token, ACCESS_SECRET);
}

export function signRefreshToken(payload) {
  return jwt.sign(payload, REFRESH_SECRET, { expiresIn: REFRESH_TTL });
}

export function verifyRefreshToken(token) {
  return jwt.verify(token, REFRESH_SECRET);
}

/**
 * Issue a new access + refresh token pair and persist the refresh token's jti
 * in the store so it can be validated or revoked later.
 *
 * The refresh token uses a unique `jti` (JWT ID) embedded in its payload.
 * Token rotation: callers must revoke the old jti before calling this again.
 */
export async function generateTokenPair(userId, email, store) {
  const jti = crypto.randomUUID();
  const base = { sub: userId, email };

  const accessToken = signAccessToken(base);
  const refreshToken = signRefreshToken({ ...base, jti });

  await store.storeRefreshToken(jti);

  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    token_type: 'Bearer',
    expires_in: 900, // seconds — matches ACCESS_TTL of 15 min
  };
}
