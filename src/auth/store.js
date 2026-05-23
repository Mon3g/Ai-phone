// Stub — no real storage yet. Methods are no-ops / return nulls.
export class InMemoryUserStore {
  async createUser() { return null; }
  async verifyPassword() { return null; }
  async storeRefreshToken() {}
  async isRefreshTokenValid() { return false; }
  async revokeRefreshToken() {}
}

export const defaultStore = new InMemoryUserStore();
