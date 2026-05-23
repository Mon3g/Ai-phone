import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';

// Low cost factor in test environments so the suite runs fast.
const DEFAULT_SALT_ROUNDS = process.env.NODE_ENV === 'test' ? 1 : 10;

/**
 * In-memory user + refresh-token store.
 *
 * Fulfils the interface expected by src/auth/routes.js.  For production,
 * swap this out for a SupabaseUserStore that reads/writes the `personas` and
 * `refresh_tokens` tables (see the DB migration).
 */
export class InMemoryUserStore {
  constructor({ saltRounds = DEFAULT_SALT_ROUNDS } = {}) {
    this.saltRounds = saltRounds;
    this._users = new Map();   // email (lowercase) → user record
    this._jtis = new Set();    // active refresh token JTI values
  }

  /**
   * Create a new user.  Throws with err.code === 'EMAIL_EXISTS' if the email
   * is already registered (case-insensitive).
   * Returns { id, email } without any sensitive fields.
   */
  async createUser({ email, password }) {
    const key = email.toLowerCase();
    if (this._users.has(key)) {
      const err = new Error('Email already registered');
      err.code = 'EMAIL_EXISTS';
      throw err;
    }
    const passwordHash = await bcrypt.hash(password, this.saltRounds);
    const user = {
      id: crypto.randomUUID(),
      email: key,
      passwordHash,
      createdAt: new Date().toISOString(),
    };
    this._users.set(key, user);
    return { id: user.id, email: user.email };
  }

  /**
   * Verify email + password.
   * Returns { id, email } on success, null otherwise.
   * Always runs the hash comparison even when the user does not exist to avoid
   * timing-based email enumeration.
   */
  async verifyPassword(email, password) {
    const user = this._users.get(email.toLowerCase());
    if (!user) {
      // Dummy comparison so this branch takes roughly the same time
      await bcrypt.compare(password, '$2a$01$aaaaaaaaaaaaaaaaaaaaaa.aaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
      return null;
    }
    const ok = await bcrypt.compare(password, user.passwordHash);
    return ok ? { id: user.id, email: user.email } : null;
  }

  /** Mark a refresh token JTI as valid (called when issuing a new token). */
  async storeRefreshToken(jti) {
    this._jtis.add(jti);
  }

  /** Return true only if this JTI was issued and has not been revoked. */
  async isRefreshTokenValid(jti) {
    return this._jtis.has(jti);
  }

  /** Invalidate a refresh token JTI (logout or rotation). */
  async revokeRefreshToken(jti) {
    this._jtis.delete(jti);
  }
}

export const defaultStore = new InMemoryUserStore();
