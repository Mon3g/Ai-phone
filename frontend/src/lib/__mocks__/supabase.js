import { vi } from 'vitest';

const mockUser = { id: 'user-123' };

const mockConfig = {
  id: 'config-1',
  name: 'Default Configuration',
  system_message: 'You are a helpful AI.',
  voice: 'alloy',
  temperature: 0.8,
  initial_greeting: 'Hello!',
  enable_greeting: true,
  is_active: true,
  user_id: 'user-123',
};

let activeConfig = { ...mockConfig };

const from = vi.fn(() => ({
  select: vi.fn(() => ({
    eq: vi.fn(() => ({
      eq: vi.fn(() => ({
        maybeSingle: vi.fn().mockImplementation(() => {
          if (activeConfig && activeConfig.is_active) {
            return Promise.resolve({ data: activeConfig, error: null });
          }
          return Promise.resolve({ data: null, error: null });
        }),
      })),
    })),
  })),
  update: vi.fn((newConfig) => ({
    eq: vi.fn(() => {
      activeConfig = { ...activeConfig, ...newConfig };
      return Promise.resolve({ data: [activeConfig], error: null });
    }),
  })),
  insert: vi.fn((newConfig) => ({
    select: vi.fn(() => {
        const newRecord = { ...newConfig[0], id: 'config-2' };
        activeConfig = newRecord;
        return Promise.resolve({ data: [newRecord], error: null });
    }),
  })),
}));

const auth = {
  getUser: vi.fn(() => Promise.resolve({ data: { user: mockUser } })),
};

export const supabase = {
  from,
  auth,
};