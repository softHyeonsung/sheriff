// Jest doesn't load `.env.local` (that's an Expo/Metro-only mechanism), so the
// EXPO_PUBLIC_* vars the module reads at import time must be set here first,
// before `require('../supabase')` runs.
process.env.EXPO_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321';
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

describe('supabase client', () => {
  test('환경변수가 있으면 클라이언트가 생성된다', () => {
    const { supabase } = require('../supabase');
    expect(supabase).toBeDefined();
    expect(typeof supabase.auth.setSession).toBe('function');
  });
});
