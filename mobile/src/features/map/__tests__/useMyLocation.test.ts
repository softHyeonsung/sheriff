// mobile/src/features/map/__tests__/useMyLocation.test.ts
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { AppState } from 'react-native';
import * as Location from 'expo-location';
import { useMyLocation } from '../useMyLocation';

jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(),
  getForegroundPermissionsAsync: jest.fn(),
  watchPositionAsync: jest.fn(),
  Accuracy: { Balanced: 3 },
}));

const req = Location.requestForegroundPermissionsAsync as jest.Mock;
const get = Location.getForegroundPermissionsAsync as jest.Mock;
const watch = Location.watchPositionAsync as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  watch.mockImplementation(async (_opts, cb) => {
    cb({ coords: { latitude: 37.5, longitude: 126.9, accuracy: 12 } });
    return { remove: jest.fn() };
  });
});

test('허용하면 위치를 받는다', async () => {
  req.mockResolvedValue({ status: 'granted' });
  const { result } = await renderHook(() => useMyLocation());
  await waitFor(() => expect(result.current.location).toEqual({ lat: 37.5, lng: 126.9, accuracy: 12 }));
  expect(result.current.permission).toBe('granted');
});

test('거부하면 위치 없이 denied', async () => {
  req.mockResolvedValue({ status: 'denied' });
  const { result } = await renderHook(() => useMyLocation());
  await waitFor(() => expect(result.current.permission).toBe('denied'));
  expect(result.current.location).toBeNull();
  expect(watch).not.toHaveBeenCalled();
});

test('앱이 다시 활성화되면 권한을 다시 확인한다(설정에서 켜고 돌아온 경우)', async () => {
  let onChange: (s: string) => void = () => {};
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_e, h) => {
    onChange = h as (s: string) => void;
    return { remove: jest.fn() } as never;
  });
  req.mockResolvedValue({ status: 'denied' });
  get.mockResolvedValue({ status: 'granted' });
  const { result } = await renderHook(() => useMyLocation());
  await waitFor(() => expect(result.current.permission).toBe('denied'));
  await act(async () => onChange('active'));
  await waitFor(() => expect(result.current.permission).toBe('granted'));
  await waitFor(() => expect(result.current.location).not.toBeNull());
});

test('첫 허용 때 권한 응답과 앱 활성화가 겹쳐도 위치 추적은 하나만', async () => {
  let onChange: (s: string) => void = () => {};
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_e, h) => {
    onChange = h as (s: string) => void;
    return { remove: jest.fn() } as never;
  });
  let resolveReq: (v: { status: string }) => void = () => {};
  req.mockReturnValue(new Promise((r) => (resolveReq = r)));
  get.mockResolvedValue({ status: 'granted' });
  await renderHook(() => useMyLocation());
  await act(async () => {
    onChange('active');
    resolveReq({ status: 'granted' });
  });
  await waitFor(() => expect(watch).toHaveBeenCalled());
  expect(watch).toHaveBeenCalledTimes(1);
});

test('추적 시작 중에 화면이 사라져도 나중에 온 구독을 해제한다', async () => {
  const remove = jest.fn();
  let resolveWatch: (v: { remove: () => void }) => void = () => {};
  watch.mockReturnValue(new Promise((r) => (resolveWatch = r)));
  req.mockResolvedValue({ status: 'granted' });
  const { unmount } = await renderHook(() => useMyLocation());
  await waitFor(() => expect(watch).toHaveBeenCalled());
  await unmount();
  await act(async () => resolveWatch({ remove }));
  expect(remove).toHaveBeenCalled();
});
