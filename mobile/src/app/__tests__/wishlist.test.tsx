// mobile/src/app/__tests__/wishlist.test.tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useMyLocation } from '@/features/map/useMyLocation';
import { useWishes } from '@/features/wishlist/useWishes';
import { parseShared, searchPlaces } from '@/features/wishlist/wishlistApi';
import WishlistScreen from '../wishlist';

jest.mock('expo-router', () => ({ router: { back: jest.fn() }, useLocalSearchParams: jest.fn(() => ({})) }));
jest.mock('@/features/map/useMyLocation', () => ({ useMyLocation: jest.fn() }));
jest.mock('@/features/wishlist/useWishes', () => ({ useWishes: jest.fn() }));
jest.mock('@/features/wishlist/wishlistApi', () => ({ searchPlaces: jest.fn(), parseShared: jest.fn() }));

const place = (id: string, name: string) => ({ placeId: id, name, roadAddress: '서울 1', lat: 37.5, lng: 126.94, distanceM: 120 });
const wishState = (over = {}) => ({ wishes: [], status: 'ready', refresh: jest.fn(), add: jest.fn(), remove: jest.fn(), ...over });

beforeEach(() => {
  jest.clearAllMocks();
  (useMyLocation as jest.Mock).mockReturnValue({ location: { lat: 37.5, lng: 127, accuracy: 10 }, permission: 'granted' });
  (useWishes as jest.Mock).mockReturnValue(wishState());
  (useLocalSearchParams as jest.Mock).mockReturnValue({});
});

const search = async (text: string) => {
  await fireEvent.changeText(screen.getByLabelText('장소 검색'), text);
  await fireEvent.press(screen.getByRole('button', { name: '찾기' }));
};

test('비어 있으면 안내', async () => {
  await render(<WishlistScreen />);
  expect(screen.getByText('가고 싶은 곳이 있나요? 검색해서 찜해두면 지도에 표시돼요.')).toBeTruthy();
});

test('이름으로 검색 → 결과 → ⭐ 찜', async () => {
  const w = wishState();
  (useWishes as jest.Mock).mockReturnValue(w);
  (searchPlaces as jest.Mock).mockResolvedValue([place('1', '찜한 카페')]);
  await render(<WishlistScreen />);
  await search('카페');
  expect(searchPlaces).toHaveBeenCalledWith('카페', { lat: 37.5, lng: 127 });
  await waitFor(() => expect(screen.getByText('찜한 카페')).toBeTruthy());
  await fireEvent.press(screen.getByRole('button', { name: '⭐ 찜' }));
  expect(w.add).toHaveBeenCalledWith(place('1', '찜한 카페'));
});

test('이미 찜한 곳은 찜 해제, 목록에 달성 표시', async () => {
  const w = wishState({
    wishes: [
      { placeId: '1', name: '찜한 카페', roadAddress: null, lat: 1, lng: 1, achievedAt: null },
      { placeId: '2', name: '가 본 곳', roadAddress: null, lat: 1, lng: 1, achievedAt: '2026-09-30' },
    ],
  });
  (useWishes as jest.Mock).mockReturnValue(w);
  (searchPlaces as jest.Mock).mockResolvedValue([place('1', '찜한 카페')]);
  await render(<WishlistScreen />);
  expect(screen.getByText('고양이가 찜한 곳')).toBeTruthy();
  expect(screen.getByText('달성 ✓')).toBeTruthy();
  await search('카페');
  await waitFor(() => expect(screen.getAllByRole('button', { name: '찜 해제' }).length).toBeGreaterThan(1));
  await fireEvent.press(screen.getAllByRole('button', { name: '찜 해제' })[0]);
  expect(w.remove).toHaveBeenCalledWith('1');
});

test('링크를 붙여넣으면 공유 해석, 가장 그럴듯한 이름으로 검색창을 바꾼다', async () => {
  (parseShared as jest.Mock).mockResolvedValue({ places: [place('9', '스타벅스 성수점')], query: '스타벅스 성수점' });
  await render(<WishlistScreen />);
  await search('https://naver.me/abc');
  expect(parseShared).toHaveBeenCalledWith('https://naver.me/abc', { lat: 37.5, lng: 127 });
  expect(searchPlaces).not.toHaveBeenCalled();
  await waitFor(() => expect(screen.getByText('스타벅스 성수점')).toBeTruthy());
  expect(screen.getByLabelText('장소 검색').props.value).toBe('스타벅스 성수점');
});

test('공유로 열리면 바로 해석, 못 찾으면 안내', async () => {
  (useLocalSearchParams as jest.Mock).mockReturnValue({ shared: '인스타 글\nhttps://instagram.com/p/x' });
  (parseShared as jest.Mock).mockResolvedValue({ places: [], query: null });
  await render(<WishlistScreen />);
  await waitFor(() => expect(parseShared).toHaveBeenCalledWith('인스타 글\nhttps://instagram.com/p/x', { lat: 37.5, lng: 127 }));
  expect(screen.getByText('장소를 찾지 못했어요. 이름으로 검색해 볼까요?')).toBeTruthy();
});

test('검색 결과 없음·연결 끊김 안내, 돌아가기', async () => {
  (searchPlaces as jest.Mock).mockResolvedValueOnce([]).mockRejectedValueOnce({ message: 'TypeError: Network request failed' });
  await render(<WishlistScreen />);
  await search('없는곳');
  await waitFor(() => expect(screen.getByText('음, 못 찾았어요. 다른 이름으로 찾아볼까요?')).toBeTruthy());
  await search('카페');
  await waitFor(() => expect(screen.getByText('연결이 끊겨 있어요. 잠시 뒤에 다시 해볼까요?')).toBeTruthy());
  await fireEvent.press(screen.getByRole('button', { name: '돌아가기' }));
  expect(router.back).toHaveBeenCalled();
});
