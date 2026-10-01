// mobile/src/features/course/__tests__/courseApi.test.ts
import { searchPlaces } from '@/features/wishlist/wishlistApi';
import { supabase } from '@/services/supabase';
import { bareName, fmtM } from '../copy';
import { findKakaoPlace, suggestCourse } from '../courseApi';

jest.mock('@/services/supabase', () => ({ supabase: { functions: { invoke: jest.fn() } } }));
jest.mock('@/features/wishlist/wishlistApi', () => ({ searchPlaces: jest.fn() }));
const invoke = supabase.functions.invoke as jest.Mock;
const search = searchPlaces as jest.Mock;
const stop = { name: '세종로공원', address: '서울 종로구', lat: 37.57, lng: 126.97, legM: 280 };
const place = (distanceM: number | null) => ({ placeId: '1', name: '세종로공원', roadAddress: null, lat: 37.57, lng: 126.97, distanceM });

beforeEach(() => jest.clearAllMocks());

test('suggestCourse: Edge Function을 부르고 빈 값을 채운다', async () => {
  invoke.mockResolvedValueOnce({ data: { stops: [stop], route: [[37.5, 127]], distanceM: 300, routeLimited: false }, error: null });
  expect(await suggestCourse(37.5, 127)).toEqual({ stops: [stop], route: [[37.5, 127]], distanceM: 300, routeLimited: false });
  expect(invoke).toHaveBeenCalledWith('suggest-course', { body: { lat: 37.5, lng: 127 }, timeout: 15000 });
  invoke.mockResolvedValueOnce({ data: {}, error: null });
  expect(await suggestCourse(37.5, 127)).toEqual({ stops: [], route: null, distanceM: null, routeLimited: false });
  invoke.mockResolvedValueOnce({ data: null, error: new Error('502') });
  await expect(suggestCourse(37.5, 127)).rejects.toThrow('502');
});

test('findKakaoPlace: 후보 좌표 기준 200m 안 첫 결과만', async () => {
  search.mockResolvedValueOnce([place(40), place(60)]);
  expect(await findKakaoPlace(stop)).toEqual(place(40));
  expect(search).toHaveBeenCalledWith('세종로공원', { lat: 37.57, lng: 126.97 });
  search.mockResolvedValueOnce([place(201)]);
  expect(await findKakaoPlace(stop)).toBeNull();
  search.mockResolvedValueOnce([place(null)]);
  expect(await findKakaoPlace(stop)).toBeNull();
  search.mockResolvedValueOnce([]);
  expect(await findKakaoPlace(stop)).toBeNull();
});

test('findKakaoPlace: 괄호는 떼고 40자까지만 검색한다', async () => {
  search.mockResolvedValue([]);
  await findKakaoPlace({ ...stop, name: 'K-컬처 스크린(대한민국역사박물관)' });
  expect(search).toHaveBeenLastCalledWith('K-컬처 스크린', expect.anything());
  await findKakaoPlace({ ...stop, name: '가'.repeat(60) });
  expect(search).toHaveBeenLastCalledWith('가'.repeat(40), expect.anything());
  await findKakaoPlace({ ...stop, name: '(구)서울역사' });
  expect(search).toHaveBeenLastCalledWith('(구)서울역사', expect.anything());
});

test('fmtM: 10m 단위, 1km부터 km', () => {
  expect(fmtM(284)).toBe('약 280m');
  expect(fmtM(3)).toBe('약 10m');
  expect(fmtM(999)).toBe('약 1.0km');
  expect(fmtM(2680)).toBe('약 2.7km');
});

test('findKakaoPlace: 200m 안에 이름이 같은 곳이 있으면 더 가까운 다른 곳보다 그곳', async () => {
  const lot = { ...place(30), placeId: '7', name: '세종로공원 주차장' };
  const park = { ...place(120), placeId: '8', name: '세종로공원' };
  search.mockResolvedValueOnce([lot, park]);
  expect(await findKakaoPlace(stop)).toEqual(park);
  search.mockResolvedValueOnce([lot, { ...park, distanceM: 300 }]);
  expect(await findKakaoPlace(stop)).toEqual(lot); // 같은 이름이 200m 밖이면 가까운 첫 결과
});

test('bareName: 괄호 앞까지, 40자까지', () => {
  expect(bareName('K-컬처 스크린(대한민국역사박물관)')).toBe('K-컬처 스크린');
  expect(bareName('가'.repeat(60))).toBe('가'.repeat(40));
  expect(bareName('(구)서울역사')).toBe('(구)서울역사');
});
