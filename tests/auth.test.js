/**
 * OAuth Flow — comprehensive test suite (TDD: written before implementation)
 *
 * Covers: signup · login · token refresh (with rotation) · logout · /me guard
 *         and all the corresponding error / edge cases.
 *
 * Each describe block creates its own isolated Fastify instance + InMemoryUserStore
 * so tests cannot bleed into one another.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import authRoutes from '../src/auth/routes.js';
import { InMemoryUserStore } from '../src/auth/store.js';

// ─── helpers ──────────────────────────────────────────────────────────────────

/** Build a fresh Fastify app with auth routes registered. */
function buildApp() {
  const store = new InMemoryUserStore({ saltRounds: 1 }); // fast hashing in tests
  const app = Fastify({ logger: false });

  // Mirror the same JSON body parser used in index.js
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
    if (!body) return done(null, {});
    try {
      done(null, JSON.parse(body));
    } catch (err) {
      err.statusCode = 400;
      done(err, undefined);
    }
  });

  app.register(authRoutes, { prefix: '/auth', store });
  return { app, store };
}

/** Inject a JSON request and return the raw reply object. */
async function inject(app, method, url, body, extraHeaders = {}) {
  return app.inject({
    method,
    url,
    payload: body !== undefined && body !== null ? JSON.stringify(body) : undefined,
    headers: {
      'Content-Type': 'application/json',
      ...extraHeaders,
    },
  });
}

/** Parse the reply body as JSON. */
function json(reply) {
  return JSON.parse(reply.body);
}

// ─── signup ───────────────────────────────────────────────────────────────────

describe('POST /auth/signup', () => {
  let app;
  beforeEach(async () => {
    ({ app } = buildApp());
    await app.ready();
  });
  afterEach(() => app.close());

  it('returns 201 with access_token, refresh_token, and user object', async () => {
    const res = await inject(app, 'POST', '/auth/signup', {
      email: 'alice@example.com',
      password: 'Passw0rd!',
    });
    expect(res.statusCode).toBe(201);
    const body = json(res);
    expect(body).toHaveProperty('access_token');
    expect(body).toHaveProperty('refresh_token');
    expect(body).toHaveProperty('token_type', 'Bearer');
    expect(body).toHaveProperty('expires_in');
    expect(body.user).toMatchObject({ email: 'alice@example.com' });
    expect(body.user).toHaveProperty('id');
  });

  it('does not expose password or password_hash in the response', async () => {
    const res = await inject(app, 'POST', '/auth/signup', {
      email: 'safe@example.com',
      password: 'Passw0rd!',
    });
    const body = json(res);
    expect(body.user).not.toHaveProperty('password');
    expect(body.user).not.toHaveProperty('passwordHash');
    expect(body.user).not.toHaveProperty('password_hash');
  });

  it('returns 409 when the email is already registered', async () => {
    await inject(app, 'POST', '/auth/signup', { email: 'dup@example.com', password: 'Passw0rd!' });
    const res = await inject(app, 'POST', '/auth/signup', { email: 'dup@example.com', password: 'Other1234!' });
    expect(res.statusCode).toBe(409);
    expect(json(res)).toHaveProperty('error');
  });

  it('is case-insensitive for email (treats FOO@BAR.COM as foo@bar.com)', async () => {
    await inject(app, 'POST', '/auth/signup', { email: 'Case@Example.COM', password: 'Passw0rd!' });
    const res = await inject(app, 'POST', '/auth/signup', { email: 'case@example.com', password: 'Passw0rd!' });
    expect(res.statusCode).toBe(409);
  });

  it('returns 400 when email is missing', async () => {
    const res = await inject(app, 'POST', '/auth/signup', { password: 'Passw0rd!' });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when password is missing', async () => {
    const res = await inject(app, 'POST', '/auth/signup', { email: 'x@example.com' });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 for an invalid email format', async () => {
    const res = await inject(app, 'POST', '/auth/signup', { email: 'not-an-email', password: 'Passw0rd!' });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when password is shorter than 8 characters', async () => {
    const res = await inject(app, 'POST', '/auth/signup', { email: 'short@example.com', password: 'abc' });
    expect(res.statusCode).toBe(400);
    expect(json(res).error).toMatch(/password/i);
  });

  it('returns 400 for an empty body', async () => {
    const res = await inject(app, 'POST', '/auth/signup', {});
    expect(res.statusCode).toBe(400);
  });

  it('access_token is a valid three-part JWT string', async () => {
    const res = await inject(app, 'POST', '/auth/signup', {
      email: 'jwt@example.com',
      password: 'Passw0rd!',
    });
    const { access_token } = json(res);
    expect(access_token.split('.')).toHaveLength(3);
  });
});

// ─── login ────────────────────────────────────────────────────────────────────

describe('POST /auth/login', () => {
  let app;
  beforeEach(async () => {
    ({ app } = buildApp());
    await app.ready();
    // Pre-register a user
    await inject(app, 'POST', '/auth/signup', { email: 'user@example.com', password: 'MySecret99!' });
  });
  afterEach(() => app.close());

  it('returns 200 with tokens for valid credentials', async () => {
    const res = await inject(app, 'POST', '/auth/login', { email: 'user@example.com', password: 'MySecret99!' });
    expect(res.statusCode).toBe(200);
    const body = json(res);
    expect(body).toHaveProperty('access_token');
    expect(body).toHaveProperty('refresh_token');
    expect(body).toHaveProperty('token_type', 'Bearer');
    expect(body.user).toMatchObject({ email: 'user@example.com' });
  });

  it('returns a different access_token on each login (unique iat/exp)', async () => {
    const r1 = await inject(app, 'POST', '/auth/login', { email: 'user@example.com', password: 'MySecret99!' });
    const r2 = await inject(app, 'POST', '/auth/login', { email: 'user@example.com', password: 'MySecret99!' });
    expect(json(r1).access_token).not.toBe(json(r2).access_token);
  });

  it('returns 401 for a wrong password', async () => {
    const res = await inject(app, 'POST', '/auth/login', { email: 'user@example.com', password: 'WrongPass!' });
    expect(res.statusCode).toBe(401);
  });

  it('returns 401 for a non-existent email', async () => {
    const res = await inject(app, 'POST', '/auth/login', { email: 'ghost@example.com', password: 'MySecret99!' });
    expect(res.statusCode).toBe(401);
  });

  it('does not leak whether an email exists (same error for wrong email vs wrong password)', async () => {
    const wrongEmail = await inject(app, 'POST', '/auth/login', {
      email: 'nobody@example.com',
      password: 'whatever',
    });
    const wrongPass = await inject(app, 'POST', '/auth/login', {
      email: 'user@example.com',
      password: 'wrongpassword',
    });
    expect(wrongEmail.statusCode).toBe(401);
    expect(wrongPass.statusCode).toBe(401);
    expect(json(wrongEmail).error).toBe(json(wrongPass).error);
  });

  it('returns 400 when email is missing', async () => {
    const res = await inject(app, 'POST', '/auth/login', { password: 'MySecret99!' });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when password is missing', async () => {
    const res = await inject(app, 'POST', '/auth/login', { email: 'user@example.com' });
    expect(res.statusCode).toBe(400);
  });

  it('is case-insensitive for email', async () => {
    const res = await inject(app, 'POST', '/auth/login', {
      email: 'USER@EXAMPLE.COM',
      password: 'MySecret99!',
    });
    expect(res.statusCode).toBe(200);
  });
});

// ─── token refresh ────────────────────────────────────────────────────────────

describe('POST /auth/refresh', () => {
  let app, refreshToken, accessToken;
  beforeEach(async () => {
    ({ app } = buildApp());
    await app.ready();
    const res = await inject(app, 'POST', '/auth/signup', {
      email: 'refresh@example.com',
      password: 'RefreshMe1!',
    });
    ({ refresh_token: refreshToken, access_token: accessToken } = json(res));
  });
  afterEach(() => app.close());

  it('returns 200 with a new access_token and refresh_token', async () => {
    const res = await inject(app, 'POST', '/auth/refresh', { refresh_token: refreshToken });
    expect(res.statusCode).toBe(200);
    const body = json(res);
    expect(body).toHaveProperty('access_token');
    expect(body).toHaveProperty('refresh_token');
    expect(body.access_token).not.toBe(accessToken);
  });

  it('rotates the refresh token — old one is invalid after first use', async () => {
    await inject(app, 'POST', '/auth/refresh', { refresh_token: refreshToken });
    // Attempt to reuse the now-rotated token
    const res = await inject(app, 'POST', '/auth/refresh', { refresh_token: refreshToken });
    expect(res.statusCode).toBe(401);
  });

  it('newly issued refresh token works for the next refresh', async () => {
    const r1 = await inject(app, 'POST', '/auth/refresh', { refresh_token: refreshToken });
    const newRefreshToken = json(r1).refresh_token;
    const r2 = await inject(app, 'POST', '/auth/refresh', { refresh_token: newRefreshToken });
    expect(r2.statusCode).toBe(200);
  });

  it('returns 401 for a garbage token string', async () => {
    const res = await inject(app, 'POST', '/auth/refresh', { refresh_token: 'garbage.token.value' });
    expect(res.statusCode).toBe(401);
  });

  it('returns 401 for a token signed with a different secret (forgery attempt)', async () => {
    const jwt = (await import('jsonwebtoken')).default;
    const forged = jwt.sign(
      { sub: 'hacker', email: 'evil@example.com', jti: 'fake-jti' },
      'wrong-secret',
      { expiresIn: '7d' }
    );
    const res = await inject(app, 'POST', '/auth/refresh', { refresh_token: forged });
    expect(res.statusCode).toBe(401);
  });

  it('returns 401 for an already-expired refresh token', async () => {
    const jwt = (await import('jsonwebtoken')).default;
    // Sign a token that expired 1 second ago
    const expired = jwt.sign(
      { sub: 'user-id', email: 'x@example.com', jti: 'some-jti' },
      process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret-change-in-production',
      { expiresIn: -1 }
    );
    const res = await inject(app, 'POST', '/auth/refresh', { refresh_token: expired });
    expect(res.statusCode).toBe(401);
  });

  it('returns 401 for a revoked token (after logout)', async () => {
    await inject(app, 'POST', '/auth/logout', { refresh_token: refreshToken });
    const res = await inject(app, 'POST', '/auth/refresh', { refresh_token: refreshToken });
    expect(res.statusCode).toBe(401);
  });

  it('returns 401 when attempting to use an access_token as a refresh_token', async () => {
    const res = await inject(app, 'POST', '/auth/refresh', { refresh_token: accessToken });
    expect(res.statusCode).toBe(401);
  });

  it('returns 400 when refresh_token field is absent', async () => {
    const res = await inject(app, 'POST', '/auth/refresh', {});
    expect(res.statusCode).toBe(400);
  });
});

// ─── logout ───────────────────────────────────────────────────────────────────

describe('POST /auth/logout', () => {
  let app, refreshToken;
  beforeEach(async () => {
    ({ app } = buildApp());
    await app.ready();
    const res = await inject(app, 'POST', '/auth/signup', {
      email: 'logout@example.com',
      password: 'LogMeOut1!',
    });
    ({ refresh_token: refreshToken } = json(res));
  });
  afterEach(() => app.close());

  it('returns 200 on successful logout', async () => {
    const res = await inject(app, 'POST', '/auth/logout', { refresh_token: refreshToken });
    expect(res.statusCode).toBe(200);
  });

  it('revokes the refresh token so subsequent refresh calls return 401', async () => {
    await inject(app, 'POST', '/auth/logout', { refresh_token: refreshToken });
    const res = await inject(app, 'POST', '/auth/refresh', { refresh_token: refreshToken });
    expect(res.statusCode).toBe(401);
  });

  it('is idempotent — logging out twice still returns 200', async () => {
    await inject(app, 'POST', '/auth/logout', { refresh_token: refreshToken });
    const res = await inject(app, 'POST', '/auth/logout', { refresh_token: refreshToken });
    expect(res.statusCode).toBe(200);
  });

  it('returns 200 even for a completely invalid token (does not expose internal state)', async () => {
    const res = await inject(app, 'POST', '/auth/logout', { refresh_token: 'totally-invalid' });
    expect(res.statusCode).toBe(200);
  });

  it('returns 400 when refresh_token field is absent', async () => {
    const res = await inject(app, 'POST', '/auth/logout', {});
    expect(res.statusCode).toBe(400);
  });
});

// ─── GET /auth/me (access-token guard) ────────────────────────────────────────

describe('GET /auth/me', () => {
  let app, accessToken;
  beforeEach(async () => {
    ({ app } = buildApp());
    await app.ready();
    const res = await inject(app, 'POST', '/auth/signup', {
      email: 'me@example.com',
      password: 'WhoAmI123!',
    });
    ({ access_token: accessToken } = json(res));
  });
  afterEach(() => app.close());

  it('returns 200 with user id and email for a valid access token', async () => {
    const res = await inject(app, 'GET', '/auth/me', null, {
      Authorization: `Bearer ${accessToken}`,
    });
    expect(res.statusCode).toBe(200);
    const body = json(res);
    expect(body.user).toMatchObject({ email: 'me@example.com' });
    expect(body.user).toHaveProperty('id');
  });

  it('returns 401 when Authorization header is absent', async () => {
    const res = await inject(app, 'GET', '/auth/me', null);
    expect(res.statusCode).toBe(401);
  });

  it('returns 401 when Authorization header lacks the Bearer prefix', async () => {
    const res = await inject(app, 'GET', '/auth/me', null, { Authorization: accessToken });
    expect(res.statusCode).toBe(401);
  });

  it('returns 401 for a malformed token', async () => {
    const res = await inject(app, 'GET', '/auth/me', null, { Authorization: 'Bearer bad.token' });
    expect(res.statusCode).toBe(401);
  });

  it('returns 401 for a token signed with a wrong secret', async () => {
    const jwt = (await import('jsonwebtoken')).default;
    const forged = jwt.sign({ sub: 'hacker', email: 'evil@example.com' }, 'wrong-secret', {
      expiresIn: '15m',
    });
    const res = await inject(app, 'GET', '/auth/me', null, { Authorization: `Bearer ${forged}` });
    expect(res.statusCode).toBe(401);
  });

  it('returns 401 for an already-expired access token', async () => {
    const jwt = (await import('jsonwebtoken')).default;
    const expired = jwt.sign(
      { sub: 'user-id', email: 'x@example.com' },
      process.env.JWT_ACCESS_SECRET || 'dev-access-secret-change-in-production',
      { expiresIn: -1 }
    );
    const res = await inject(app, 'GET', '/auth/me', null, { Authorization: `Bearer ${expired}` });
    expect(res.statusCode).toBe(401);
    expect(json(res).error).toMatch(/expired/i);
  });

  it('returns 401 when a refresh_token is used as an access_token', async () => {
    const signupRes = await inject(app, 'POST', '/auth/signup', {
      email: 'crosstoken@example.com',
      password: 'Passw0rd!',
    });
    const { refresh_token } = json(signupRes);
    const res = await inject(app, 'GET', '/auth/me', null, { Authorization: `Bearer ${refresh_token}` });
    expect(res.statusCode).toBe(401);
  });
});
