// mobile/src/features/wishlist/__tests__/useIncomingShare.test.ts
import { renderHook } from '@testing-library/react-native';
import { useShareIntentContext } from 'expo-share-intent';
import { useShareStore } from '@/stores/shareStore';
import { useIncomingShare } from '../useIncomingShare';

jest.mock('expo-share-intent', () => ({ useShareIntentContext: jest.fn() }));
const ctx = useShareIntentContext as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  useShareStore.setState({ pending: null });
});

test('공유가 들어오면 글(없으면 링크)을 기억하고 비운다', async () => {
  const reset = jest.fn();
  ctx.mockReturnValue({ hasShareIntent: true, shareIntent: { text: '[네이버 지도]\n스타벅스\nhttps://naver.me/a', webUrl: 'https://naver.me/a' }, resetShareIntent: reset });
  await renderHook(() => useIncomingShare());
  expect(useShareStore.getState().pending).toBe('[네이버 지도]\n스타벅스\nhttps://naver.me/a');
  expect(reset).toHaveBeenCalled();
});

test('글이 없으면 링크, 아무것도 없으면 그대로', async () => {
  ctx.mockReturnValue({ hasShareIntent: true, shareIntent: { text: null, webUrl: 'https://kko.to/x' }, resetShareIntent: jest.fn() });
  const a = await renderHook(() => useIncomingShare());
  expect(useShareStore.getState().pending).toBe('https://kko.to/x');
  await a.unmount();
  useShareStore.setState({ pending: null });
  ctx.mockReturnValue({ hasShareIntent: false, shareIntent: {}, resetShareIntent: jest.fn() });
  await renderHook(() => useIncomingShare());
  expect(useShareStore.getState().pending).toBeNull();
});
