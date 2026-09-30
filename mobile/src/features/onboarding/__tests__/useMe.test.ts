// mobile/src/features/onboarding/__tests__/useMe.test.ts
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useMeStore } from '@/stores/meStore';
import { myOnboarding } from '../onboardingApi';
import { useMe } from '../useMe';

jest.mock('../onboardingApi', () => ({ myOnboarding: jest.fn() }));
const me = { onboarded: true, nickname: '나비집사', catName: '나비', catColor: 'mackerel', homeDong: null, hasHideout: true };

beforeEach(() => {
  jest.clearAllMocks();
  useMeStore.setState({ me: null });
});

test('로그인하면 불러와서 스토어에', async () => {
  (myOnboarding as jest.Mock).mockResolvedValue(me);
  const { result } = await renderHook(() => useMe('u1'));
  await waitFor(() => expect(result.current.status).toBe('ready'));
  expect(useMeStore.getState().me).toEqual(me);
});

test('로그아웃이면 비운다', async () => {
  useMeStore.setState({ me: me as never });
  const { result } = await renderHook(() => useMe(null));
  expect(result.current.status).toBe('idle');
  expect(useMeStore.getState().me).toBeNull();
});

test('실패 → error, retry로 다시', async () => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  (myOnboarding as jest.Mock).mockRejectedValueOnce(new Error('net')).mockResolvedValueOnce(me);
  const { result } = await renderHook(() => useMe('u1'));
  await waitFor(() => expect(result.current.status).toBe('error'));
  await act(async () => result.current.retry());
  await waitFor(() => expect(result.current.status).toBe('ready'));
});
