// mobile/src/app/(tabs)/__tests__/map.test.tsx
/* eslint-disable @typescript-eslint/no-explicit-any -- loosely typed test doubles for native components */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Linking } from 'react-native';
import { useMyHideouts } from '@/features/map/useMyHideouts';
import { useMyLocation } from '@/features/map/useMyLocation';
import MapScreen from '../index';

let mockBridgeProps: Record<string, any> = {};
const mockPanTo = jest.fn();
jest.mock('@/map/MapBridge', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    MapBridge: React.forwardRef(function MockMapBridge(props: any, ref: any) {
      mockBridgeProps = props;
      React.useImperativeHandle(ref, () => ({ panTo: mockPanTo }));
      return <View testID="map" />;
    }),
  };
});
jest.mock('@/features/map/useMyHideouts', () => ({ useMyHideouts: jest.fn() }));
jest.mock('@/features/map/useMyLocation', () => ({ useMyLocation: jest.fn() }));

const T = { box: 2, hut: 5, tower: 10, palace: 20 };
const cafe = { id: 'a1', name: '테스트 카페', grade: 'box' as const, footprintCount: 3, lat: 37.5, lng: 126.9 };
const hideoutsState = (over = {}) => ({ hideouts: [cafe], thresholds: T, status: 'ready', retry: jest.fn(), ...over });

beforeEach(() => {
  jest.clearAllMocks();
  (useMyHideouts as jest.Mock).mockReturnValue(hideoutsState());
  (useMyLocation as jest.Mock).mockReturnValue({ location: { lat: 37.5, lng: 126.9, accuracy: 10 }, permission: 'granted' });
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
