// Stub — no real token logic yet.
export function signAccessToken() { return ''; }
export function verifyAccessToken() {
  const err = new Error('not implemented');
  err.name = 'JsonWebTokenError';
  throw err;
}
export function signRefreshToken() { return ''; }
export function verifyRefreshToken() {
  const err = new Error('not implemented');
  err.name = 'JsonWebTokenError';
  throw err;
}
export async function generateTokenPair() { return {}; }
