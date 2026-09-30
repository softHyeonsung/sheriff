// mobile/src/features/wishlist/__tests__/useWishes.test.ts
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { resyncArrival } from '@/features/arrival/register';
import { readMapCache, saveWishes } from '@/features/map/mapCache';
import { addWish, myWishes, removeWish } from '../wishlistApi';
import { useWishes } from '../useWishes';

jest.mock('expo-router', () => ({ useFocusEffect: (cb: () => void) => require('react').useEffect(cb, [cb]) }));
jest.mock('@/features/arrival/register', () => ({ resyncArrival: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../wishlistApi', () => ({ myWishes: jest.fn(), addWish: jest.fn(), removeWish: jest.fn() }));
jest.mock('@/features/map/mapCache', () => ({ readMapCache: jest.fn(), saveWishes: jest.fn().mockResolvedValue(undefined) }));

const wish = { placeId: '123', name: '찜한 카페', roadAddress: null, lat: 37.5, lng: 126.94, achievedAt: null };
const place = { ...wish, distanceM: 10 };

beforeEach(() => {
  jest.clearAllMocks();
  (readMapCache as jest.Mock).mockResolvedValue({ hideouts: [], thresholds: null, fog: null, wishes: [wish] });
});

test('불러와서 저장본에 쓴다', async () => {
  (myWishes as jest.Mock).mockResolvedValue([wish]);
  const { result } = await renderHook(() => useWishes());
  await waitFor(() => expect(result.current.status).toBe('ready'));
  expect(result.current.wishes).toEqual([wish]);
  expect(saveWishes).toHaveBeenCalledWith([wish]);
  await waitFor(() => expect(resyncArrival).toHaveBeenCalled()); // 찜이 바뀌면 도착 알림 감시도
});

test('연결이 끊기면 저장본', async () => {
  (myWishes as jest.Mock).mockRejectedValue({ message: 'TypeError: Network request failed' });
  const { result } = await renderHook(() => useWishes());
  await waitFor(() => expect(result.current.status).toBe('offline'));
  expect(result.current.wishes).toEqual([wish]);
});

test('추가·해제 뒤 다시 불러온다', async () => {
  (myWishes as jest.Mock).mockResolvedValue([]);
  (addWish as jest.Mock).mockResolvedValue(undefined);
  (removeWish as jest.Mock).mockResolvedValue(undefined);
  const { result } = await renderHook(() => useWishes());
  await waitFor(() => expect(result.current.status).toBe('ready'));
  await act(async () => result.current.add(place));
  expect(addWish).toHaveBeenCalledWith(place);
  await act(async () => result.current.remove('123'));
  expect(removeWish).toHaveBeenCalledWith('123');
  expect(myWishes).toHaveBeenCalledTimes(3);
});
