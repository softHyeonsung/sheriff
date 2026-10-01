// mobile/src/app/(tabs)/__tests__/map.test.tsx
/* eslint-disable @typescript-eslint/no-explicit-any -- loosely typed test doubles for native components */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { Linking } from 'react-native';
import { answerArrivalOffer, shouldOfferArrival } from '@/features/arrival/register';
import { useArrivalTap } from '@/features/arrival/useArrivalTap';
import { useMyHideouts } from '@/features/map/useMyHideouts';
import { useMyLocation } from '@/features/map/useMyLocation';
import { MSG } from '@/features/checkin/copy';
import { useCheckin } from '@/features/checkin/useCheckin';
import { COURSE } from '@/features/course/copy';
import { findKakaoPlace, suggestCourse } from '@/features/course/courseApi';
import { useCheckinQueue } from '@/features/checkin/useCheckinQueue';
import { onOnline } from '@/lib/network';
import { useWishes } from '@/features/wishlist/useWishes';
import { useShareStore } from '@/stores/shareStore';
import { useMyFog } from '@/features/territory/useMyFog';
import { useDongAt } from '@/features/territory/useDongAt';
import { useMeStore } from '@/stores/meStore';
import MapScreen from '../index';

let mockBridgeProps: Record<string, any> = {};
const mockPanTo = jest.fn();
const mockCatSay = jest.fn();
jest.mock('expo-router', () => ({ router: { navigate: jest.fn(), push: jest.fn() } }));
jest.mock('@/features/arrival/register', () => ({ shouldOfferArrival: jest.fn(), answerArrivalOffer: jest.fn() }));
jest.mock('@/features/arrival/useArrivalTap', () => ({ useArrivalTap: jest.fn() }));
jest.mock('@/features/territory/useMyFog', () => ({ useMyFog: jest.fn() }));
jest.mock('@/features/territory/useDongAt', () => ({ useDongAt: jest.fn() }));
jest.mock('@/map/MapBridge', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    MapBridge: React.forwardRef(function MockMapBridge(props: any, ref: any) {
      mockBridgeProps = props;
      React.useImperativeHandle(ref, () => ({ panTo: mockPanTo, catSay: mockCatSay }));
      return <View testID="map" />;
    }),
  };
});
jest.mock('@/features/map/useMyHideouts', () => ({ useMyHideouts: jest.fn() }));
jest.mock('@/features/map/useMyLocation', () => ({ useMyLocation: jest.fn() }));
let mockSheetProps: Record<string, any> = {};
let mockCelebrationProps: Record<string, any> = {};
jest.mock('@/features/checkin/useCheckin', () => ({ useCheckin: jest.fn() }));
jest.mock('@/features/checkin/useCheckinQueue', () => ({ useCheckinQueue: jest.fn() }));
jest.mock('@/features/wishlist/useWishes', () => ({ useWishes: jest.fn() }));
jest.mock('@/lib/network', () => ({ onOnline: jest.fn(() => () => {}) }));
jest.mock('@/features/course/courseApi', () => ({ suggestCourse: jest.fn(), findKakaoPlace: jest.fn() }));
jest.mock('@/features/checkin/CheckinSheet', () => {
  const { View } = require('react-native');
  return { CheckinSheet: function MockSheet(props: any) { mockSheetProps = props; return <View testID="checkin-sheet" />; } };
});
jest.mock('@/features/checkin/Celebration', () => {
  const { View } = require('react-native');
  return { Celebration: function MockCelebration(props: any) { mockCelebrationProps = props; return <View testID="celebration" />; } };
});


const T = { box: 2, hut: 5, tower: 10, palace: 20 };
const cafe = { id: 'a1', name: '테스트 카페', grade: 'box' as const, footprintCount: 3, lat: 37.5, lng: 126.9 };
const queueState = (over = {}) => ({ pending: 0, celebrations: [], dropped: 0, next: jest.fn(), clearDropped: jest.fn(), refresh: jest.fn(), flush: jest.fn(), droppedMemories: 0, clearDroppedMemories: jest.fn(), ...over });
const hideoutsState = (over = {}) => ({ hideouts: [cafe], thresholds: T, status: 'ready', retry: jest.fn(), ...over });

beforeEach(() => {
  jest.clearAllMocks();
  (useMyHideouts as jest.Mock).mockReturnValue(hideoutsState());
  (useMyLocation as jest.Mock).mockReturnValue({ location: { lat: 37.5, lng: 126.9, accuracy: 10 }, permission: 'granted' });
  (useCheckin as jest.Mock).mockReturnValue({ state: { name: 'idle' }, start: jest.fn(), choose: jest.fn(), close: jest.fn() });
  (useMyFog as jest.Mock).mockReturnValue({ cells: [], refresh: jest.fn() });
  useMeStore.setState({ me: null });
  (useDongAt as jest.Mock).mockReturnValue({ dong: null, onIdle: jest.fn(), refresh: jest.fn() });
  (shouldOfferArrival as jest.Mock).mockResolvedValue(false);
  (useCheckinQueue as jest.Mock).mockReturnValue(queueState());
  (useWishes as jest.Mock).mockReturnValue({ wishes: [], status: 'ready', refresh: jest.fn(), add: jest.fn(), remove: jest.fn() });

});

test('지도에는 이름 없이 위치·등급만 넘긴다', async () => {
  await render(<MapScreen />);
  expect(mockBridgeProps.hideouts).toEqual([{ id: 'a1', lat: 37.5, lng: 126.9, grade: 'box' }]);
});

test('마커 탭 → 카드(이름·N번·다음 단계)', async () => {
  await render(<MapScreen />);
  await act(async () => mockBridgeProps.onHideoutTap('a1'));
  expect(screen.getByText('테스트 카페')).toBeTruthy();
  expect(screen.getByText('지금까지 3번 다녀왔어요')).toBeTruthy();
  expect(screen.getByText('2번 더 오면 작은 집이 돼요')).toBeTruthy();
});

test('선택된 아지트가 목록에서 사라지면 카드가 닫힌다', async () => {
  const { rerender } = await render(<MapScreen />);
  await act(async () => mockBridgeProps.onHideoutTap('a1'));
  (useMyHideouts as jest.Mock).mockReturnValue(hideoutsState({ hideouts: [] }));
  await rerender(<MapScreen />);
  expect(screen.queryByText('테스트 카페')).toBeNull();
});

test('아지트 0개면 초대 문구', async () => {
  (useMyHideouts as jest.Mock).mockReturnValue(hideoutsState({ hideouts: [] }));
  await render(<MapScreen />);
  expect(screen.getByText('아직 발자국이 없어요. 가까운 곳부터 같이 가볼까요?')).toBeTruthy();
});

test('위치 거부 → 배너 + 설정 열기', async () => {
  (useMyLocation as jest.Mock).mockReturnValue({ location: null, permission: 'denied' });
  const open = jest.spyOn(Linking, 'openSettings').mockResolvedValue();
  await render(<MapScreen />);
  expect(screen.getByText('위치를 켜두시면 지금 있는 곳을 보여드릴게요')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: '설정 열기' }));
  expect(open).toHaveBeenCalled();
});

test('아지트 조회 실패 → 한 줄 + 다시 시도', async () => {
  const retry = jest.fn();
  (useMyHideouts as jest.Mock).mockReturnValue(hideoutsState({ hideouts: [], status: 'error', retry }));
  await render(<MapScreen />);
  expect(screen.getByText('아지트를 불러오지 못했어요')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: '다시 시도' }));
  expect(retry).toHaveBeenCalled();
});

test('지도 로드 실패 → 재시도 화면 → 다시 지도', async () => {
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  await render(<MapScreen />);
  await act(async () => mockBridgeProps.onError('sdk_load_failed'));
  expect(screen.getByText('지도를 불러오지 못했어요. 다시 해볼까요?')).toBeTruthy();
  expect(screen.queryByTestId('map')).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: '다시 시도' }));
  expect(screen.getByTestId('map')).toBeTruthy();
});

test('위치 허용 사용자는 아지트가 먼저 와도 위치가 오면 내 위치로 맞춘다', async () => {
  (useMyLocation as jest.Mock).mockReturnValue({ location: null, permission: 'granted' });
  const { rerender } = await render(<MapScreen />);
  expect(mockPanTo).toHaveBeenLastCalledWith(37.5, 126.9); // hideout fallback first
  (useMyLocation as jest.Mock).mockReturnValue({ location: { lat: 37.61, lng: 127.02, accuracy: 10 }, permission: 'granted' });
  await rerender(<MapScreen />);
  expect(mockPanTo).toHaveBeenLastCalledWith(37.61, 127.02);
  (useMyLocation as jest.Mock).mockReturnValue({ location: { lat: 37.62, lng: 127.03, accuracy: 10 }, permission: 'granted' });
  await rerender(<MapScreen />);
  expect(mockPanTo).toHaveBeenCalledTimes(2); // later fixes don't yank the map around
});

test('지도 실패 후 다시 시도하면 다시 중심을 맞춘다', async () => {
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  await render(<MapScreen />);
  const before = mockPanTo.mock.calls.length;
  await act(async () => mockBridgeProps.onError('sdk_load_failed'));
  await fireEvent.press(screen.getByRole('button', { name: '다시 시도' }));
  expect(mockPanTo.mock.calls.length).toBeGreaterThan(before);
});

test('마커 탭 같은 재렌더에서는 지도에 같은 목록을 넘긴다(마커를 매번 다시 만들지 않음)', async () => {
  await render(<MapScreen />);
  const first = mockBridgeProps.hideouts;
  await act(async () => mockBridgeProps.onHideoutTap('a1'));
  expect(mockBridgeProps.hideouts).toBe(first);
});

const checkin = (state: object, over = {}) => {
  const api = { state, start: jest.fn(), choose: jest.fn(), close: jest.fn(), ...over };
  (useCheckin as jest.Mock).mockReturnValue(api);
  return api;
};

test('발자국 남기기 → 체크인 시작', async () => {
  const api = checkin({ name: 'idle' });
  await render(<MapScreen />);
  await fireEvent.press(screen.getByRole('button', { name: '발자국 남기기' }));
  expect(api.start).toHaveBeenCalled();
});

test('위치 확인 중엔 안내가 뜨고 버튼이 비활성', async () => {
  checkin({ name: 'locating' });
  await render(<MapScreen />);
  expect(screen.getByText('잠깐, 위치를 확인하고 있어요…')).toBeTruthy();
  expect(screen.getByRole('button', { name: '발자국 남기기', disabled: true })).toBeTruthy();
});

test('후보 고르기 → 시트(발자국 수 전달)', async () => {
  checkin({ name: 'choosing', fix: { lat: 1, lng: 2, accuracy: 3 }, hereAddress: null, candidates: [], offline: false, busy: false, error: null });
  await render(<MapScreen />);
  expect(screen.getByTestId('checkin-sheet')).toBeTruthy();
  expect(mockSheetProps.footprintsById).toEqual({ a1: 3 });
});

test('축하 닫기 → 새로고침(마커가 자란 모습으로)', async () => {
  const retry = jest.fn();
  (useMyHideouts as jest.Mock).mockReturnValue(hideoutsState({ retry }));
  const fogRefresh = jest.fn();
  const dongRefresh = jest.fn();
  (useMyFog as jest.Mock).mockReturnValue({ cells: [], refresh: fogRefresh });
  (useDongAt as jest.Mock).mockReturnValue({ dong: null, onIdle: jest.fn(), refresh: dongRefresh });
  const result = { aidutId: 'a1', name: '테스트 카페', footprintCount: 5, grade: 'hut', gradeChanged: true, newCellsCleared: 0 };
  const api = checkin({ name: 'celebrating', result });
  await render(<MapScreen />);
  expect(mockCelebrationProps.result).toEqual(result);
  expect(mockCelebrationProps.thresholds).toEqual(T);
  await act(async () => mockCelebrationProps.onClose());
  expect(api.close).toHaveBeenCalled();
  expect(retry).toHaveBeenCalled();
  expect(fogRefresh).toHaveBeenCalled();
  expect(dongRefresh).toHaveBeenCalled();
});

test('재방문 축하를 닫으면 도착 알림 카드, 좋아요 → 허용되면 다시 불러와 등록', async () => {
  const retry = jest.fn();
  (useMyHideouts as jest.Mock).mockReturnValue(hideoutsState({ retry }));
  (shouldOfferArrival as jest.Mock).mockResolvedValue(true);
  (answerArrivalOffer as jest.Mock).mockResolvedValue(true);
  checkin({ name: 'celebrating', result: { aidutId: 'a1', name: '테스트 카페', footprintCount: 2, grade: 'box', gradeChanged: true, newCellsCleared: 0 } });
  await render(<MapScreen />);
  expect(screen.queryByText('다음에 여기 오면 제가 알려드릴까요?')).toBeNull();
  await act(async () => mockCelebrationProps.onClose());
  expect(shouldOfferArrival).toHaveBeenCalledWith(2);
  retry.mockClear();
  await fireEvent.press(screen.getByRole('button', { name: '좋아요' }));
  expect(answerArrivalOffer).toHaveBeenCalledWith(true);
  expect(screen.queryByText('다음에 여기 오면 제가 알려드릴까요?')).toBeNull();
  expect(retry).toHaveBeenCalled();
});

test('도착 알림을 누르고 들어오면 지도 탭으로 가서 체크인 시작(프로필 탭에 있었어도)', async () => {
  const api = checkin({ name: 'idle' });
  await render(<MapScreen />);
  const onArrive = (useArrivalTap as jest.Mock).mock.calls.at(-1)![0];
  await act(async () => onArrive());
  expect(router.navigate).toHaveBeenCalledWith('/');
  expect(api.start).toHaveBeenCalled();
});

test('실패 안내 + 다시 시도, 권한 문제면 설정 열기', async () => {
  const api = checkin({ name: 'failed', message: '위치가 꺼져 있어서 발자국을 남기기 어려워요. 켜두시면 제가 도와드릴게요.', needsSettings: true });
  const open = jest.spyOn(Linking, 'openSettings').mockResolvedValue();
  await render(<MapScreen />);
  expect(screen.getByText('위치가 꺼져 있어서 발자국을 남기기 어려워요. 켜두시면 제가 도와드릴게요.')).toBeTruthy();
  await fireEvent.press(screen.getAllByRole('button', { name: '설정 열기' }).at(-1)!);
  expect(open).toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: '다시 시도' }));
  expect(api.start).toHaveBeenCalled();
});


test('카드가 열린 채 발자국 남기기를 누르면 카드를 닫아 안내가 가려지지 않게', async () => {
  const api = checkin({ name: 'idle' });
  await render(<MapScreen />);
  await act(async () => mockBridgeProps.onHideoutTap('a1'));
  expect(screen.getByText('테스트 카페')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: '발자국 남기기' }));
  expect(api.start).toHaveBeenCalled();
  expect(screen.queryByText('테스트 카페')).toBeNull();
});

test('위치 확인 중에도 닫을 수 있다', async () => {
  const api = checkin({ name: 'locating' });
  await render(<MapScreen />);
  await fireEvent.press(screen.getByRole('button', { name: '닫기' }));
  expect(api.close).toHaveBeenCalled();
});

const cell = { sw: { lat: 37.5, lng: 126.9 }, ne: { lat: 37.501, lng: 126.901 } };
const sajik = { code: '1', name: '사직동', stage: 'sprout', hideoutCount: 3, exploredCells: 12, totalCells: 100, ratio: 12 };

test('걷힌 칸·idle을 지도에 연결하고 동네 배지를 보여준다', async () => {
  const onIdle = jest.fn();
  (useMyFog as jest.Mock).mockReturnValue({ cells: [cell], refresh: jest.fn() });
  (useDongAt as jest.Mock).mockReturnValue({ dong: sajik, onIdle, refresh: jest.fn() });
  await render(<MapScreen />);
  expect(mockBridgeProps.fog).toEqual([cell]);
  expect(mockBridgeProps.onIdle).toBe(onIdle);
  expect(screen.getByLabelText('사직동 · 🌱 개척지 · 개척률 12%')).toBeTruthy();
});

test('고양이를 누르면 말풍선을 보낸다(권유 → 인사 번갈아)', async () => {
  (useDongAt as jest.Mock).mockReturnValue({ dong: sajik, onIdle: jest.fn(), refresh: jest.fn() });
  await render(<MapScreen />);
  await act(async () => mockBridgeProps.onCatTap());
  await act(async () => mockBridgeProps.onCatTap());
  expect(mockCatSay.mock.calls).toEqual([['저쪽 골목은 아직 안개예요. 같이 가볼까요?'], ['우리 동네, 오늘도 조용하고 좋네요.']]);
});

test('지도 고양이는 내 털색, 모르면 치즈', async () => {
  await render(<MapScreen />);
  expect(mockBridgeProps.catColor).toBe('cheese');
  useMeStore.setState({ me: { onboarded: true, nickname: '나비집사', catName: '나비', catColor: 'mackerel', homeDong: null, hasHideout: true } });
  await render(<MapScreen />);
  expect(mockBridgeProps.catColor).toBe('mackerel');
});

const synced = { aidutId: 'a1', name: '테스트 카페', footprintCount: 2, grade: 'box', gradeChanged: true, newCellsCleared: 0 };

test('오프라인이면 저장본 배지·챙긴 개수, 동 배지는 숨긴다', async () => {
  (useMyHideouts as jest.Mock).mockReturnValue(hideoutsState({ status: 'offline' }));
  (useCheckinQueue as jest.Mock).mockReturnValue(queueState({ pending: 2 }));
  (useDongAt as jest.Mock).mockReturnValue({
    dong: { code: '1', name: '사직동', stage: 'sprout', hideoutCount: 1, exploredCells: 1, totalCells: 10, ratio: 0.1 },
    onIdle: jest.fn(),
    refresh: jest.fn(),
  });
  await render(<MapScreen />);
  expect(screen.getByText('연결이 끊겨 있어요. 마지막으로 본 지도예요.')).toBeTruthy();
  expect(screen.getByText('챙겨둔 발자국 2개')).toBeTruthy();
  expect(screen.queryByText(/사직동/)).toBeNull();
});

test('챙기면 안내 + 닫기, 바로 올리기를 시도(연결이 살아 있으면 올라감)', async () => {
  const api = checkin({ name: 'queued' });
  const q = queueState();
  (useCheckinQueue as jest.Mock).mockReturnValue(q);
  await render(<MapScreen />);
  expect(screen.getByText('발자국을 챙겨뒀어요. 연결되면 남길게요 🐾')).toBeTruthy();
  expect(q.flush).toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: '닫기' }));
  expect(api.close).toHaveBeenCalled();
});

test('올라간 발자국은 차례로 축하, 닫으면 다음 것', async () => {
  const q = queueState({ celebrations: [synced] });
  (useCheckinQueue as jest.Mock).mockReturnValue(q);
  await render(<MapScreen />);
  expect(mockCelebrationProps.result).toEqual(synced);
  await act(async () => mockCelebrationProps.onClose());
  expect(q.next).toHaveBeenCalled();
});

test('직접 체크인 중이면 올라간 축하는 미룬다', async () => {
  (useCheckinQueue as jest.Mock).mockReturnValue(queueState({ celebrations: [synced] }));
  checkin({ name: 'locating' });
  await render(<MapScreen />);
  expect(screen.queryByTestId('celebration')).toBeNull();
});

test('거절된 발자국 안내 + 닫기', async () => {
  const q = queueState({ dropped: 2 });
  (useCheckinQueue as jest.Mock).mockReturnValue(q);
  await render(<MapScreen />);
  expect(screen.getByText('챙겨둔 발자국 2개는 남기지 못했어요. 너무 멀었거나 위치가 흐렸어요.')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: '닫기' }));
  expect(q.clearDropped).toHaveBeenCalled();
});

test('저장본을 보다가 다시 연결되면 지도를 새로 불러온다(챙긴 게 없어도)', async () => {
  const retry = jest.fn();
  const fogRefresh = jest.fn();
  (useMyHideouts as jest.Mock).mockReturnValue(hideoutsState({ status: 'offline', retry }));
  (useMyFog as jest.Mock).mockReturnValue({ cells: [], refresh: fogRefresh });
  await render(<MapScreen />);
  const online = (onOnline as jest.Mock).mock.calls.at(-1)![0];
  retry.mockClear();
  await act(async () => online());
  expect(retry).toHaveBeenCalled();
  expect(fogRefresh).toHaveBeenCalled();
});

test('온라인 상태에서 온 연결 소식으로는 다시 불러오지 않는다', async () => {
  const retry = jest.fn();
  (useMyHideouts as jest.Mock).mockReturnValue(hideoutsState({ retry }));
  await render(<MapScreen />);
  const online = (onOnline as jest.Mock).mock.calls.at(-1)![0];
  retry.mockClear();
  await act(async () => online());
  expect(retry).not.toHaveBeenCalled();
});

test('직접 남긴 축하에는 순간 남기기(체크인 위치로), 올라간 축하에는 없음', async () => {
  const fixUsed = { lat: 37.5, lng: 126.9, accuracy: 10 };
  const result = { aidutId: 'a1', name: '테스트 카페', footprintCount: 2, grade: 'box', gradeChanged: true, newCellsCleared: 0 };
  checkin({ name: 'celebrating', result, fix: fixUsed });
  const { unmount } = await render(<MapScreen />);
  expect(mockCelebrationProps.memory).toEqual({ aidutId: 'a1', fix: fixUsed });
  await unmount();
  checkin({ name: 'idle' });
  (useCheckinQueue as jest.Mock).mockReturnValue(queueState({ celebrations: [result] }));
  await render(<MapScreen />);
  expect(mockCelebrationProps.memory).toBeUndefined();
});

test('마커 카드의 추억 보기 → 아지트 상세', async () => {
  await render(<MapScreen />);
  await act(async () => mockBridgeProps.onHideoutTap('a1'));
  await fireEvent.press(screen.getByRole('button', { name: '추억 보기' }));
  expect(router.push).toHaveBeenCalledWith({ pathname: '/aidut/[id]', params: { id: 'a1' } });
});

test('거절된 사진 안내 + 닫기', async () => {
  const q = queueState({ droppedMemories: 1 });
  (useCheckinQueue as jest.Mock).mockReturnValue(q);
  await render(<MapScreen />);
  expect(screen.getByText('남긴 순간 1개는 올리지 못했어요. 너무 멀었거나 위치가 흐렸어요.')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: '닫기' }));
  expect(q.clearDroppedMemories).toHaveBeenCalled();
});

test('[⭐ 찜] → 찜 화면, 달성 안 한 찜만 핀, 핀 카드에서 찜 해제', async () => {
  const remove = jest.fn(() => Promise.resolve());
  (useWishes as jest.Mock).mockReturnValue({
    wishes: [
      { placeId: '1', name: '찜한 카페', roadAddress: '서울 1', lat: 37.5, lng: 127, achievedAt: null },
      { placeId: '2', name: '가 본 곳', roadAddress: null, lat: 37.6, lng: 127, achievedAt: '2026-09-30' },
    ],
    status: 'ready', refresh: jest.fn(), add: jest.fn(), remove,
  });
  await render(<MapScreen />);
  expect(mockBridgeProps.wishes).toEqual([{ placeId: '1', lat: 37.5, lng: 127 }]);
  await fireEvent.press(screen.getByRole('button', { name: '⭐ 찜' }));
  expect(router.push).toHaveBeenCalledWith('/wishlist');
  await act(async () => mockBridgeProps.onWishTap('1'));
  expect(screen.getByText('찜한 카페')).toBeTruthy();
  expect(screen.getByText('고양이가 찜한 곳')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: '찜 해제' }));
  expect(remove).toHaveBeenCalledWith('1');
});

test('공유가 기다리고 있으면 찜 화면으로 넘기고 비운다', async () => {
  useShareStore.setState({ pending: 'https://naver.me/a' });
  await render(<MapScreen />);
  expect(router.push).toHaveBeenCalledWith({ pathname: '/wishlist', params: { shared: 'https://naver.me/a' } });
  expect(useShareStore.getState().pending).toBeNull();
});

const stopA = { name: '세종로공원', address: null, lat: 37.501, lng: 126.9, legM: 110 };
const courseOf = (over = {}) => ({ stops: [stopA], route: [[37.5, 126.9], [37.501, 126.9]], routeLimited: false, ...over });
const walk = () => fireEvent.press(screen.getByRole('button', { name: COURSE.button }));

test('산책 → 현재 위치로 코스를 받아 카드와 지도에', async () => {
  (suggestCourse as jest.Mock).mockResolvedValue(courseOf());
  await render(<MapScreen />);
  expect(mockBridgeProps.course).toBeNull();
  await walk();
  expect(suggestCourse).toHaveBeenCalledWith(37.5, 126.9);
  expect(await screen.findByText('고양이가 가보고 싶대요')).toBeTruthy();
  expect(mockBridgeProps.course).toEqual({ stops: [{ lat: 37.501, lng: 126.9 }], route: [[37.5, 126.9], [37.501, 126.9]] });
  await fireEvent.press(screen.getByRole('button', { name: '닫기' }));
  expect(mockBridgeProps.course).toBeNull();
  expect(screen.queryByText('고양이가 가보고 싶대요')).toBeNull();
});

test('산책: 찾는 동안 버튼 비활성, 닫은 뒤 늦게 온 응답은 버린다', async () => {
  let done: (c: unknown) => void = () => {};
  (suggestCourse as jest.Mock).mockReturnValue(new Promise((r) => (done = r)));
  await render(<MapScreen />);
  const pressed = walk(); // 누름은 코스가 올 때까지 끝나지 않는다: 기다리지 않고 화면을 본다
  expect(await screen.findByText(COURSE.finding)).toBeTruthy();
  expect(screen.getByRole('button', { name: COURSE.button })).toBeDisabled();
  await fireEvent.press(screen.getByRole('button', { name: '닫기' }));
  await act(async () => done(courseOf()));
  await pressed;
  expect(screen.queryByText('고양이가 가보고 싶대요')).toBeNull();
  expect(mockBridgeProps.course).toBeNull();
  expect(screen.getByRole('button', { name: COURSE.button })).not.toBeDisabled();
});

test('산책: 후보가 없으면 다 개척했다는 문구', async () => {
  (suggestCourse as jest.Mock).mockResolvedValue(courseOf({ stops: [], route: null }));
  await render(<MapScreen />);
  await walk();
  expect(await screen.findByText(COURSE.empty)).toBeTruthy();
  expect(mockBridgeProps.course).toBeNull();
});

test('산책: 위치를 모르면 부르지 않고 안내', async () => {
  (useMyLocation as jest.Mock).mockReturnValue({ location: null, permission: 'granted' });
  await render(<MapScreen />);
  await walk();
  expect(suggestCourse).not.toHaveBeenCalled();
  expect(screen.getByText(COURSE.noLocation)).toBeTruthy();
});

test('산책: 끊겼으면 연결 문구, 그 밖은 공통 문구', async () => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  (suggestCourse as jest.Mock).mockRejectedValueOnce({ message: 'TypeError: Network request failed' });
  await render(<MapScreen />);
  await walk();
  expect(await screen.findByText(MSG.offline)).toBeTruthy();
  (suggestCourse as jest.Mock).mockRejectedValueOnce(new Error('502'));
  await walk();
  expect(await screen.findByText(MSG.unknown)).toBeTruthy();
});

test('코스 카드 찜: 카카오에서 찾으면 찜, 못 찾으면 찜 화면을 그 이름으로', async () => {
  const add = jest.fn().mockResolvedValue(undefined);
  (useWishes as jest.Mock).mockReturnValue({ wishes: [], status: 'ready', refresh: jest.fn(), add, remove: jest.fn() });
  (suggestCourse as jest.Mock).mockResolvedValue(courseOf());
  const place = { placeId: '9', name: '세종로공원', roadAddress: null, lat: 37.501, lng: 126.9, distanceM: 20 };
  (findKakaoPlace as jest.Mock).mockResolvedValueOnce(place);
  await render(<MapScreen />);
  await walk();
  await fireEvent.press(await screen.findByRole('button', { name: '세종로공원 ⭐ 찜' }));
  expect(findKakaoPlace).toHaveBeenCalledWith(stopA);
  expect(add).toHaveBeenCalledWith(place);
  expect(await screen.findByText(COURSE.wished)).toBeTruthy();

  (findKakaoPlace as jest.Mock).mockResolvedValueOnce(null);
  await walk(); // 새 코스 = 새 카드
  await fireEvent.press(await screen.findByRole('button', { name: '세종로공원 ⭐ 찜' }));
  await fireEvent.press(await screen.findByRole('button', { name: '세종로공원 찜 화면에서 찾기' }));
  expect(add).toHaveBeenCalledTimes(1);
  expect(router.push).toHaveBeenCalledWith({ pathname: '/wishlist', params: { shared: '세종로공원' } });
});

test('아지트 카드가 떠 있는 동안 코스 카드는 숨고, 코스 핀은 남는다', async () => {
  (suggestCourse as jest.Mock).mockResolvedValue(courseOf());
  await render(<MapScreen />);
  await walk();
  await screen.findByText('고양이가 가보고 싶대요');
  await act(async () => mockBridgeProps.onHideoutTap('a1'));
  expect(screen.queryByText('고양이가 가보고 싶대요')).toBeNull();
  expect(mockBridgeProps.course).not.toBeNull();
});

test('코스가 떠 있어도 발자국 안내가 가려지지 않는다(체크인 중엔 코스 카드를 숨긴다)', async () => {
  (suggestCourse as jest.Mock).mockResolvedValue(courseOf());
  const { rerender } = await render(<MapScreen />);
  await walk();
  await screen.findByText('고양이가 가보고 싶대요');
  (useCheckin as jest.Mock).mockReturnValue({ state: { name: 'locating' }, start: jest.fn(), choose: jest.fn(), close: jest.fn() });
  await rerender(<MapScreen />);
  expect(screen.getByText('잠깐, 위치를 확인하고 있어요…')).toBeTruthy();
  expect(screen.queryByText('고양이가 가보고 싶대요')).toBeNull();
  expect(mockBridgeProps.course).not.toBeNull(); // 핀은 남는다
  (useCheckin as jest.Mock).mockReturnValue({ state: { name: 'idle' }, start: jest.fn(), choose: jest.fn(), close: jest.fn() });
  await rerender(<MapScreen />);
  expect(screen.getByText('고양이가 가보고 싶대요')).toBeTruthy();
});

test('찜 화면에서 찾기는 괄호를 뗀 이름으로 연다', async () => {
  const long = { ...stopA, name: '세종로공원(광화문광장 옆 작은 공원)' };
  (suggestCourse as jest.Mock).mockResolvedValue(courseOf({ stops: [long] }));
  (findKakaoPlace as jest.Mock).mockResolvedValue(null);
  await render(<MapScreen />);
  await walk();
  await fireEvent.press(await screen.findByRole('button', { name: `${long.name} ⭐ 찜` }));
  await fireEvent.press(await screen.findByRole('button', { name: /찜 화면에서 찾기$/ }));
  expect(router.push).toHaveBeenCalledWith({ pathname: '/wishlist', params: { shared: '세종로공원' } });
});

test('권한 실패 안내가 떠 있으면 위쪽 권한 배너는 숨긴다(같은 말·같은 버튼이 두 번 나오지 않게)', async () => {
  (useMyLocation as jest.Mock).mockReturnValue({ location: null, permission: 'denied' });
  (useCheckin as jest.Mock).mockReturnValue({ state: { name: 'failed', message: MSG.denied, needsSettings: true }, start: jest.fn(), choose: jest.fn(), close: jest.fn() });
  await render(<MapScreen />);
  expect(screen.getByText(MSG.denied)).toBeTruthy();
  expect(screen.queryByText('위치를 켜두시면 지금 있는 곳을 보여드릴게요')).toBeNull();
  expect(screen.getAllByRole('button', { name: '설정 열기' })).toHaveLength(1);
});
