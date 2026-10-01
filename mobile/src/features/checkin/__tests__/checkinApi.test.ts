// mobile/src/features/checkin/__tests__/checkinApi.test.ts
import * as Location from 'expo-location';
import { supabase } from '@/services/supabase';
import { CheckinError, getFreshFix, submitCheckin, suggestPlace, targetFor } from '../checkinApi';
import { messageFor } from '../copy';

jest.mock('@/services/supabase', () => ({ supabase: { rpc: jest.fn(), functions: { invoke: jest.fn() } } }));
jest.mock('expo-location', () => ({
  getForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
  requestForegroundPermissionsAsync: jest.fn(),
  hasServicesEnabledAsync: jest.fn(() => Promise.resolve(true)),
  Accuracy: { High: 4 },
}));

const rpc = supabase.rpc as jest.Mock;
const invoke = supabase.functions.invoke as jest.Mock;
const fix = { lat: 37.5, lng: 126.9, accuracy: 12 };

beforeEach(() => jest.clearAllMocks());

test('새 위치: 권한 있으면 정확한 위치, 없으면 denied', async () => {
  (Location.getForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
  (Location.getCurrentPositionAsync as jest.Mock).mockResolvedValue({ coords: { latitude: 37.5, longitude: 126.9, accuracy: 12 } });
  await expect(getFreshFix()).resolves.toEqual(fix);
  expect(Location.getCurrentPositionAsync).toHaveBeenCalledWith({ accuracy: Location.Accuracy.High });
  (Location.getForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'denied' });
  await expect(getFreshFix()).resolves.toBe('denied');
});

test('suggestPlace는 로그인 세션으로 Edge Function을 부르고 결과를 그대로 준다', async () => {
  invoke.mockResolvedValue({ data: { status: 'ok', hereAddress: '서울 테스트로 1', candidates: [] }, error: null });
  await expect(suggestPlace(fix)).resolves.toEqual({ status: 'ok', hereAddress: '서울 테스트로 1', candidates: [] });
  expect(invoke).toHaveBeenCalledWith('suggest-place', { body: { lat: 37.5, lng: 126.9, accuracy: 12 }, timeout: 10000 });
});

test('suggestPlace 실패는 unknown', async () => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  invoke.mockResolvedValue({ data: null, error: new Error('network') });
  await expect(suggestPlace(fix)).rejects.toMatchObject({ code: 'unknown' });
});

test('submitCheckin 성공은 결과 그대로', async () => {
  const result = { aidutId: 'a1', name: '카페', footprintCount: 2, grade: 'box', gradeChanged: true, newCellsCleared: 0 };
  rpc.mockResolvedValue({ data: result, error: null });
  await expect(submitCheckin(fix, { kind: 'new', roadAddress: null })).resolves.toEqual(result);
  expect(rpc).toHaveBeenCalledWith('submit_checkin', {
    p_lat: 37.5, p_lng: 126.9, p_accuracy: 12, p_target: { kind: 'new', roadAddress: null },
  });
});

test('서버 거절 → 코드, 쿨다운은 다음 시각까지', async () => {
  rpc.mockResolvedValueOnce({ data: null, error: { message: 'too_far', details: null } });
  await expect(submitCheckin(fix, { kind: 'new', roadAddress: null })).rejects.toMatchObject({ code: 'too_far' });
  rpc.mockResolvedValueOnce({ data: null, error: { message: 'cooldown', details: '2026-09-28T09:05:00Z' } });
  const e = await submitCheckin(fix, { kind: 'new', roadAddress: null }).catch((x) => x);
  expect(e).toBeInstanceOf(CheckinError);
  expect(e).toMatchObject({ code: 'cooldown', nextAt: '2026-09-28T09:05:00Z' });
  jest.spyOn(console, 'error').mockImplementation(() => {});
  rpc.mockResolvedValueOnce({ data: null, error: { message: 'relation does not exist', details: null } });
  await expect(submitCheckin(fix, { kind: 'new', roadAddress: null })).rejects.toMatchObject({ code: 'unknown' });
});

test('후보 → target', () => {
  expect(targetFor({ kind: 'mine', aidutId: 'a1', name: 'x', grade: 'hut', distanceM: 5 })).toEqual({ kind: 'mine', aidutId: 'a1' });
  expect(targetFor({ kind: 'kakao', placeId: 'p1', name: '카페', lat: 37.5, lng: 126.9, roadAddress: '서울 1', distanceM: 20 })).toEqual({
    kind: 'kakao', placeId: 'p1', name: '카페', lat: 37.5, lng: 126.9, roadAddress: '서울 1',
  });
});

test('연결이 안 되면 offline', async () => {
  invoke.mockResolvedValue({ data: null, error: { name: 'FunctionsFetchError', message: 'Failed to send a request to the Edge Function' } });
  await expect(suggestPlace(fix)).rejects.toMatchObject({ code: 'offline' });
  rpc.mockResolvedValue({ data: null, error: { message: 'TypeError: Network request failed', code: '' } });
  await expect(submitCheckin(fix, { kind: 'new', roadAddress: null })).rejects.toMatchObject({ code: 'offline' });
});

test('새 위치: 아직 묻지 않은 권한은 거절로 치지 않고 지금 묻는다', async () => {
  (Location.getForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'undetermined' });
  (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValueOnce({ status: 'granted' });
  (Location.getCurrentPositionAsync as jest.Mock).mockResolvedValue({ coords: { latitude: 37.5, longitude: 126.9, accuracy: 12 } });
  await expect(getFreshFix()).resolves.toEqual(fix);
  (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValueOnce({ status: 'denied' });
  await expect(getFreshFix()).resolves.toBe('denied');
  (Location.getForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'denied' });
  (Location.requestForegroundPermissionsAsync as jest.Mock).mockClear();
  await expect(getFreshFix()).resolves.toBe('denied');
  expect(Location.requestForegroundPermissionsAsync).not.toHaveBeenCalled(); // 이미 거절한 사람에게 또 묻지 않는다
});

test('새 위치: 휴대폰 위치 서비스가 꺼져 있으면 location_off', async () => {
  (Location.getForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
  (Location.hasServicesEnabledAsync as jest.Mock).mockResolvedValueOnce(false);
  await expect(getFreshFix()).rejects.toMatchObject({ code: 'location_off' });
  expect(Location.getCurrentPositionAsync).not.toHaveBeenCalled();
  expect(messageFor(new CheckinError('location_off'))).toBe('휴대폰의 위치 서비스가 꺼져 있어요. 켜고 다시 해볼까요?');
});
