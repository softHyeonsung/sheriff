// mobile/src/features/wishlist/__tests__/wishlistApi.test.ts
import { supabase } from '@/services/supabase';
import { addWish, myWishes, parseShared, removeWish, searchPlaces } from '../wishlistApi';

jest.mock('@/services/supabase', () => ({ supabase: { rpc: jest.fn(), functions: { invoke: jest.fn() } } }));
const rpc = supabase.rpc as jest.Mock;
const invoke = supabase.functions.invoke as jest.Mock;
const place = { placeId: '123', name: '찜한 카페', roadAddress: '서울 1', lat: 37.5, lng: 126.94, distanceM: 10 };

beforeEach(() => jest.clearAllMocks());

test('검색·공유 해석은 Edge Function, 위치가 있으면 같이', async () => {
  invoke.mockResolvedValueOnce({ data: { places: [place] }, error: null });
  expect(await searchPlaces('카페', { lat: 37.5, lng: 127 })).toEqual([place]);
  expect(invoke).toHaveBeenCalledWith('search-place', { body: { query: '카페', lat: 37.5, lng: 127 }, timeout: 10000 });
  invoke.mockResolvedValueOnce({ data: { places: [], query: '스타벅스' }, error: null });
  expect(await parseShared('https://naver.me/x', null)).toEqual({ places: [], query: '스타벅스' });
  expect(invoke).toHaveBeenLastCalledWith('parse-shared', { body: { text: 'https://naver.me/x' }, timeout: 15000 });
  invoke.mockResolvedValueOnce({ data: null, error: new Error('502') });
  await expect(searchPlaces('카페', null)).rejects.toThrow('502');
});

test('찜 추가·해제·목록은 RPC', async () => {
  rpc.mockResolvedValue({ data: null, error: null });
  await addWish(place);
  expect(rpc).toHaveBeenCalledWith('add_wish', { p_place_id: '123', p_name: '찜한 카페', p_road_address: '서울 1', p_lat: 37.5, p_lng: 126.94 });
  await removeWish('123');
  expect(rpc).toHaveBeenCalledWith('remove_wish', { p_place_id: '123' });
  rpc.mockResolvedValueOnce({
    data: [{ place_id: '123', name: '찜한 카페', road_address: null, lat: 37.5, lng: 126.94, achieved_at: null, created_at: 'x' }],
    error: null,
  });
  expect(await myWishes()).toEqual([{ placeId: '123', name: '찜한 카페', roadAddress: null, lat: 37.5, lng: 126.94, achievedAt: null }]);
  rpc.mockResolvedValueOnce({ data: null, error: { message: 'boom' } });
  await expect(myWishes()).rejects.toMatchObject({ message: 'boom' });
});
