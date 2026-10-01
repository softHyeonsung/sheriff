// mobile/src/app/__tests__/aidut.test.tsx
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { readMapCache } from '@/features/map/mapCache';
import { useHideoutPlaces } from '@/features/map/useHideoutPlaces';
import { useMyLocation } from '@/features/map/useMyLocation';
import { useMemories } from '@/features/memories/useMemories';
import { getFreshFix } from '@/features/checkin/checkinApi';
import HideoutDetail from '../aidut/[id]';

let mockBtnProps: Record<string, unknown> = {};
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'a1' }),
  useFocusEffect: (cb: () => void) => require('react').useEffect(cb, [cb]),
  router: { back: jest.fn() },
}));
jest.mock('@/features/map/mapCache', () => ({ readMapCache: jest.fn() }));
jest.mock('@/features/map/useMyLocation', () => ({ useMyLocation: jest.fn() }));
jest.mock('@/features/map/useHideoutPlaces', () => ({ useHideoutPlaces: jest.fn() }));
jest.mock('@/features/memories/useMemories', () => ({ useMemories: jest.fn() }));
jest.mock('@/features/checkin/checkinApi', () => ({ getFreshFix: jest.fn() }));
jest.mock('@/features/memories/MemoryButton', () => {
  const { Text } = require('react-native');
  return {
    MemoryButton: (p: Record<string, unknown>) => {
      mockBtnProps = p;
      return <Text>{p.disabled ? 'btn:off' : 'btn:on'}</Text>;
    },
  };
});

const T = { box: 2, hut: 5, tower: 10, palace: 20 };
const cafe = { id: 'a1', name: '단골 카페', grade: 'box', footprintCount: 3, lat: 37.5, lng: 127, lastVisitedAt: null };
const mem = (over = {}) => ({ photos: [], pending: 0, status: 'ready', refresh: jest.fn(), ...over });

beforeEach(() => {
  jest.clearAllMocks();
  (readMapCache as jest.Mock).mockResolvedValue({ hideouts: [cafe], thresholds: T, fog: null });
  (useMyLocation as jest.Mock).mockReturnValue({ location: { lat: 37.5001, lng: 127, accuracy: 10 }, permission: 'granted' });
  (useMemories as jest.Mock).mockReturnValue(mem());
  (useHideoutPlaces as jest.Mock).mockReturnValue({ places: [], status: 'ready' });
});

test('헤더: 이름·등급·다녀온 횟수·다음 단계, 사진 없으면 빈 상태', async () => {
  await render(<HideoutDetail />);
  await waitFor(() => expect(screen.getByText('단골 카페')).toBeTruthy());
  expect(screen.getByText('지금까지 3번 다녀왔어요')).toBeTruthy();
  expect(screen.getByText('2번 더 오면 작은 집이 돼요')).toBeTruthy();
  expect(screen.getByText('여기서의 순간들')).toBeTruthy();
  expect(screen.getByText('아직 남긴 순간이 없어요. 다음에 오면 하나 남겨볼까요?')).toBeTruthy();
});

test('150m 안이면 버튼 활성, 밖이면 비활성 + 안내', async () => {
  const { unmount } = await render(<HideoutDetail />);
  await waitFor(() => expect(screen.getByText('btn:on')).toBeTruthy());
  expect(mockBtnProps.aidutId).toBe('a1');
  expect(screen.queryByText('가까이 가면 순간을 남길 수 있어요.')).toBeNull();
  await unmount();
  (useMyLocation as jest.Mock).mockReturnValue({ location: { lat: 37.51, lng: 127, accuracy: 10 }, permission: 'granted' });
  await render(<HideoutDetail />);
  await waitFor(() => expect(screen.getByText('btn:off')).toBeTruthy());
  expect(screen.getByText('가까이 가면 순간을 남길 수 있어요.')).toBeTruthy();
});

test('사진 격자 + 올라가는 중 칸, 누르면 크게 보기', async () => {
  (useMemories as jest.Mock).mockReturnValue(
    mem({ photos: [{ id: 'm1', url: 'https://s/1', createdAt: '2026-09-30T01:00:00Z' }, { id: 'm2', url: null, createdAt: 'x' }], pending: 1 }),
  );
  await render(<HideoutDetail />);
  await waitFor(() => expect(screen.getByText('올라가는 중')).toBeTruthy());
  expect(screen.queryByText('아직 남긴 순간이 없어요. 다음에 오면 하나 남겨볼까요?')).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: '사진 1 크게 보기' }));
  expect(screen.getByTestId('photo-large')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: '닫기' }));
  expect(screen.queryByTestId('photo-large')).toBeNull();
});

test('올라가면 목록을 새로 부른다', async () => {
  const m = mem();
  (useMemories as jest.Mock).mockReturnValue(m);
  await render(<HideoutDetail />);
  await waitFor(() => expect(screen.getByText('btn:on')).toBeTruthy());
  await act(async () => (mockBtnProps.onUploaded as () => void)());
  expect(m.refresh).toHaveBeenCalled();
});

test('오프라인·오류 안내', async () => {
  (useMemories as jest.Mock).mockReturnValue(mem({ status: 'offline' }));
  const { unmount } = await render(<HideoutDetail />);
  await waitFor(() => expect(screen.getByText('연결되면 순간들을 보여드릴게요.')).toBeTruthy());
  await unmount();
  const m = mem({ status: 'error' });
  (useMemories as jest.Mock).mockReturnValue(m);
  await render(<HideoutDetail />);
  await waitFor(() => expect(screen.getByText('순간들을 불러오지 못했어요.')).toBeTruthy());
  await fireEvent.press(screen.getByRole('button', { name: '다시 시도' }));
  expect(m.refresh).toHaveBeenCalled();
});

test('모르는 아지트면 안내 + 돌아가기', async () => {
  (readMapCache as jest.Mock).mockResolvedValue({ hideouts: [], thresholds: T, fog: null });
  await render(<HideoutDetail />);
  await waitFor(() => expect(screen.getByText('이 아지트를 찾지 못했어요.')).toBeTruthy());
  await fireEvent.press(screen.getByRole('button', { name: '돌아가기' }));
  expect(router.back).toHaveBeenCalled();
});

test('상세의 위치 확인: 흐리거나 멀면 문제를 알려 주고, 괜찮으면 그 위치', async () => {
  await render(<HideoutDetail />);
  await waitFor(() => expect(screen.getByText('btn:on')).toBeTruthy());
  const getFix = mockBtnProps.getFix as () => Promise<unknown>;
  (getFreshFix as jest.Mock).mockResolvedValueOnce({ lat: 37.5001, lng: 127, accuracy: 200 });
  expect(await getFix()).toEqual({ problem: '위치가 흐려요. 조금 뒤에 다시 해볼까요?' });
  (getFreshFix as jest.Mock).mockResolvedValueOnce({ lat: 37.51, lng: 127, accuracy: 10 });
  expect(await getFix()).toEqual({ problem: '조금만 더 가까이 가면 순간을 남길 수 있어요.' });
  (getFreshFix as jest.Mock).mockResolvedValueOnce('denied');
  expect(await getFix()).toBe('denied');
  const ok = { lat: 37.5001, lng: 127, accuracy: 10 };
  (getFreshFix as jest.Mock).mockResolvedValueOnce(ok);
  expect(await getFix()).toEqual(ok);
});

test('여기서 간 곳: 장소별 횟수', async () => {
  (useHideoutPlaces as jest.Mock).mockReturnValue({
    places: [{ placeId: '222', name: '2층 카페', visits: 3 }, { placeId: '111', name: '단골 카페', visits: 1 }],
    status: 'ready',
  });
  await render(<HideoutDetail />);
  await waitFor(() => expect(screen.getByText('여기서 간 곳')).toBeTruthy());
  expect(useHideoutPlaces).toHaveBeenCalledWith('a1');
  expect(screen.getByText('2층 카페 · 3번')).toBeTruthy();
  expect(screen.getByText('단골 카페 · 1번')).toBeTruthy();
});

test('여기서 간 곳: 한 곳뿐이고 아지트 이름과 같으면 숨긴다, 이름이 다르면 보인다', async () => {
  (useHideoutPlaces as jest.Mock).mockReturnValue({ places: [{ placeId: '111', name: '단골 카페', visits: 3 }], status: 'ready' });
  const { unmount } = await render(<HideoutDetail />);
  await waitFor(() => expect(screen.getByText('여기서의 순간들')).toBeTruthy());
  expect(screen.queryByText('여기서 간 곳')).toBeNull();
  await unmount();
  (useHideoutPlaces as jest.Mock).mockReturnValue({ places: [{ placeId: '222', name: '2층 카페', visits: 1 }], status: 'ready' });
  await render(<HideoutDetail />);
  await waitFor(() => expect(screen.getByText('2층 카페 · 1번')).toBeTruthy());
});

test('여기서 간 곳: 오프라인·오류 안내', async () => {
  (useHideoutPlaces as jest.Mock).mockReturnValue({ places: [], status: 'offline' });
  const { unmount } = await render(<HideoutDetail />);
  await waitFor(() => expect(screen.getByText('연결되면 간 곳을 보여드릴게요.')).toBeTruthy());
  await unmount();
  (useHideoutPlaces as jest.Mock).mockReturnValue({ places: [], status: 'error' });
  await render(<HideoutDetail />);
  await waitFor(() => expect(screen.getByText('간 곳을 불러오지 못했어요.')).toBeTruthy());
});

test('사진 크게 보기: 어느 장소에서 남겼는지, 모르는 옛 사진은 줄 없음', async () => {
  (useMemories as jest.Mock).mockReturnValue(
    mem({ photos: [
      { id: 'm1', url: 'https://s/1', createdAt: 'x', placeName: '2층 카페' },
      { id: 'm2', url: 'https://s/2', createdAt: 'y', placeName: null },
    ] }),
  );
  await render(<HideoutDetail />);
  await fireEvent.press(await screen.findByRole('button', { name: '사진 1 크게 보기' }));
  expect(screen.getByText('2층 카페에서')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: '닫기' }));
  await fireEvent.press(screen.getByRole('button', { name: '사진 2 크게 보기' }));
  expect(screen.getByTestId('photo-large')).toBeTruthy();
  expect(screen.queryByText(/에서$/)).toBeNull();
});

test('장소 이름이 빈 글자인 사진도 크게 보기가 깨지지 않는다', async () => {
  (useMemories as jest.Mock).mockReturnValue(mem({ photos: [{ id: 'm1', url: 'https://s/1', createdAt: 'x', placeName: '' }] }));
  await render(<HideoutDetail />);
  await fireEvent.press(await screen.findByRole('button', { name: '사진 1 크게 보기' }));
  expect(screen.getByTestId('photo-large')).toBeTruthy();
  expect(screen.queryByText(/에서$/)).toBeNull();
});

test('상세의 위치 확인: 위치 서비스가 꺼져 있으면 그렇게 알려 준다', async () => {
  await render(<HideoutDetail />);
  await waitFor(() => expect(screen.getByText('btn:on')).toBeTruthy());
  const getFix = mockBtnProps.getFix as () => Promise<unknown>;
  const { CheckinError } = jest.requireActual('@/features/checkin/errors');
  (getFreshFix as jest.Mock).mockRejectedValueOnce(new CheckinError('location_off'));
  expect(await getFix()).toEqual({ problem: '휴대폰의 위치 서비스가 꺼져 있어요. 켜고 다시 해볼까요?' });
});
