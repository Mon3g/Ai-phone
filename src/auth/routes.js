import { generateTokenPair, verifyAccessToken, verifyRefreshToken } from './tokens.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 8;

/**
 * Fastify plugin that registers five auth routes under the caller's prefix:
 *
 *   POST /signup  — create account, return token pair
 *   POST /login   — authenticate, return token pair
 *   POST /refresh — exchange refresh token for new pair (with rotation)
 *   POST /logout  — revoke refresh token
 *   GET  /me      — return authenticated user info
 *
 * Options:
 *   opts.store  — user/token store instance (required)
 */
export default async function authRoutes(fastify, opts) {
  const { store } = opts;
  if (!store) throw new Error('authRoutes requires an opts.store');

  // ── POST /signup ──────────────────────────────────────────────────────────
  fastify.post('/signup', async (request, reply) => {
    const { email, password } = request.body || {};

    if (!email || !password) {
      return reply.code(400).send({ error: 'email and password are required' });
    }
    if (!EMAIL_RE.test(email)) {
      return reply.code(400).send({ error: 'invalid email address' });
    }
    if (password.length < MIN_PASSWORD) {
      return reply
        .code(400)
        .send({ error: `password must be at least ${MIN_PASSWORD} characters` });
    }

    try {
      const user = await store.createUser({ email, password });
      const tokens = await generateTokenPair(user.id, user.email, store);
      return reply.code(201).send({ user, ...tokens });
    } catch (err) {
      if (err.code === 'EMAIL_EXISTS') {
        return reply.code(409).send({ error: 'email already registered' });
      }
      throw err;
    }
  });

  // ── POST /login ───────────────────────────────────────────────────────────
  fastify.post('/login', async (request, reply) => {
    const { email, password } = request.body || {};

    if (!email || !password) {
      return reply.code(400).send({ error: 'email and password are required' });
    }

    const user = await store.verifyPassword(email, password);
    if (!user) {
      // Deliberately generic — does not reveal whether email exists
      return reply.code(401).send({ error: 'invalid credentials' });
    }

    const tokens = await generateTokenPair(user.id, user.email, store);
    return reply.code(200).send({ user, ...tokens });
  });

  // ── POST /refresh ─────────────────────────────────────────────────────────
  fastify.post('/refresh', async (request, reply) => {
    const { refresh_token } = request.body || {};

    if (!refresh_token) {
      return reply.code(400).send({ error: 'refresh_token is required' });
    }

    let payload;
    try {
      payload = verifyRefreshToken(refresh_token);
    } catch (err) {
      const msg =
        err.name === 'TokenExpiredError' ? 'refresh token expired' : 'invalid refresh token';
      return reply.code(401).send({ error: msg });
    }

    const { jti, sub, email } = payload;

    if (!(await store.isRefreshTokenValid(jti))) {
      return reply.code(401).send({ error: 'refresh token has been revoked' });
    }

    // Rotation: invalidate the old token before issuing a new pair
    await store.revokeRefreshToken(jti);
    const tokens = await generateTokenPair(sub, email, store);
    return reply.code(200).send(tokens);
  });

  // ── POST /logout ──────────────────────────────────────────────────────────
  fastify.post('/logout', async (request, reply) => {
    const { refresh_token } = request.body || {};

    if (!refresh_token) {
      return reply.code(400).send({ error: 'refresh_token is required' });
    }

    try {
      const payload = verifyRefreshToken(refresh_token);
      await store.revokeRefreshToken(payload.jti);
    } catch {
      // Invalid or already-expired token — nothing to revoke; still succeed
    }

    return reply.code(200).send({ message: 'logged out' });
  });

  // ── GET /me ───────────────────────────────────────────────────────────────
  fastify.get('/me', async (request, reply) => {
    const authHeader = request.headers.authorization || '';

    if (!authHeader.startsWith('Bearer ')) {
      return reply.code(401).send({ error: 'missing or malformed authorization header' });
    }

    const token = authHeader.slice(7); // strip "Bearer "
    try {
      const payload = verifyAccessToken(token);
      return reply.code(200).send({ user: { id: payload.sub, email: payload.email } });
    } catch (err) {
      const msg =
        err.name === 'TokenExpiredError' ? 'access token expired' : 'invalid access token';
      return reply.code(401).send({ error: msg });
    }
  });
}
