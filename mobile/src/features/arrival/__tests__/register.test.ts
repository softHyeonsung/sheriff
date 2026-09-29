// mobile/src/features/arrival/__tests__/register.test.ts
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { askNotifications, ensureArrivalChannel } from '@/features/onboarding/permissions';
import { clearArrival, readArrival, updateArrival, type ArrivalData } from '../store';
import { answerArrivalOffer, clearArrivalData, shouldOfferArrival, syncArrivalRegions } from '../register';

jest.mock('expo-location', () => ({
  getBackgroundPermissionsAsync: jest.fn(),
  requestForegroundPermissionsAsync: jest.fn(),
  requestBackgroundPermissionsAsync: jest.fn(),
  getLastKnownPositionAsync: jest.fn(),
  startGeofencingAsync: jest.fn(),
  stopGeofencingAsync: jest.fn(),
  hasStartedGeofencingAsync: jest.fn(),
}));
jest.mock('../task', () => ({ ARRIVAL_TASK: 'arrival-geofence' }));
jest.mock('../store', () => ({ readArrival: jest.fn(), updateArrival: jest.fn(), clearArrival: jest.fn() }));
jest.mock('expo-notifications', () => ({ cancelAllScheduledNotificationsAsync: jest.fn() }));
jest.mock('@/features/onboarding/permissions', () => ({ askNotifications: jest.fn(), ensureArrivalChannel: jest.fn() }));

const L = Location as jest.Mocked<typeof Location>;
const read = readArrival as jest.Mock;
const EMPTY: ArrivalData = { regions: {}, log: [], offerSeen: false };
// Fake store: updateArrival runs the updater against whatever read() returns; `write` records what it wrote.
const write = jest.fn();
const bg = (status: string) => L.getBackgroundPermissionsAsync.mockResolvedValue({ status } as never);
const h = (id: string, lat: number) => ({ id, name: id, grade: 'box' as const, footprintCount: 2, lat, lng: 127, lastVisitedAt: null });

beforeEach(() => {
  jest.clearAllMocks();
  read.mockResolvedValue(EMPTY);
  (updateArrival as jest.Mock).mockImplementation(async (fn: (d: ArrivalData) => Promise<ArrivalData | null>) => {
    const next = await fn(await read());
    if (next) write(next);
  });
});

test('항상 허용이 아니면 등록하지 않는다', async () => {
  bg('denied');
  await syncArrivalRegions([h('a', 37.5)]);
  expect(L.startGeofencingAsync).not.toHaveBeenCalled();
});

test('내 위치에서 가까운 20곳을 150m로 등록하고 목록을 저장한다', async () => {
  bg('granted');
  L.getLastKnownPositionAsync.mockResolvedValue({ coords: { latitude: 37.5, longitude: 127 } } as never);
  const many = Array.from({ length: 25 }, (_, i) => h(`h${i}`, 37.5 + i * 0.001)).reverse();
  await syncArrivalRegions(many);
  const regions = L.startGeofencingAsync.mock.calls[0][1]!;
  expect(L.startGeofencingAsync.mock.calls[0][0]).toBe('arrival-geofence');
  expect(regions).toHaveLength(20);
  expect(regions[0]).toEqual({ identifier: 'h0', latitude: 37.5, longitude: 127, radius: 150 });
  expect(Object.keys(write.mock.calls[0][0].regions)).toHaveLength(20);
  expect(write.mock.calls[0][0].regions.h0).toEqual({ name: 'h0', grade: 'box', lastVisitedAt: null });
});

test('등록할 때 안드로이드 알림 채널을 만들어 둔다(온보딩에서 못 만들었어도)', async () => {
  bg('granted');
  L.getLastKnownPositionAsync.mockResolvedValue(null);
  await syncArrivalRegions([h('a', 37.5)]);
  expect(ensureArrivalChannel).toHaveBeenCalled();
});

test('이미 같은 곳들을 감시 중이면 다시 등록하지 않는다(등록 때마다 OS가 진입/이탈을 몰아 보냄)', async () => {
  bg('granted');
  L.getLastKnownPositionAsync.mockResolvedValue(null);
  L.hasStartedGeofencingAsync.mockResolvedValue(true);
  read.mockResolvedValue({ ...EMPTY, regions: { b: { name: 'b', grade: 'box', lastVisitedAt: null }, a: { name: 'a', grade: 'paw', lastVisitedAt: null } } });
  await syncArrivalRegions([h('a', 37.5), h('b', 37.6)]);
  expect(L.startGeofencingAsync).not.toHaveBeenCalled();
  expect(write.mock.calls[0][0].regions.a.grade).toBe('box'); // 이름·등급·방문 시각은 새로 저장
});

test('감시가 꺼져 있으면 같은 곳이어도 등록한다', async () => {
  bg('granted');
  L.getLastKnownPositionAsync.mockResolvedValue(null);
  L.hasStartedGeofencingAsync.mockResolvedValue(false);
  read.mockResolvedValue({ ...EMPTY, regions: { a: { name: 'a', grade: 'box', lastVisitedAt: null } } });
  await syncArrivalRegions([h('a', 37.5)]);
  expect(L.startGeofencingAsync).toHaveBeenCalled();
});

test('위치를 모르면 첫 아지트 기준', async () => {
  bg('granted');
  L.getLastKnownPositionAsync.mockResolvedValue(null);
  await syncArrivalRegions([h('a', 37.5), h('b', 37.6)]);
  expect(L.startGeofencingAsync.mock.calls[0][1]![0].identifier).toBe('a');
});

test('아지트가 없으면 감시를 끈다', async () => {
  bg('granted');
  L.hasStartedGeofencingAsync.mockResolvedValue(true);
  await syncArrivalRegions([]);
  expect(L.stopGeofencingAsync).toHaveBeenCalledWith('arrival-geofence');
});

test('카드는 발자국 2개 이상 + 본 적 없음 + 항상 허용 아님일 때만', async () => {
  bg('denied');
  expect(await shouldOfferArrival(1)).toBe(false);
  expect(await shouldOfferArrival(2)).toBe(true);
  read.mockResolvedValue({ ...EMPTY, offerSeen: true });
  expect(await shouldOfferArrival(2)).toBe(false);
  read.mockResolvedValue(EMPTY);
  bg('granted');
  expect(await shouldOfferArrival(2)).toBe(false);
});

test('괜찮아요: 본 것으로 기록만', async () => {
  expect(await answerArrivalOffer(false)).toBe(false);
  expect(write).toHaveBeenCalledWith({ ...EMPTY, offerSeen: true });
  expect(L.requestBackgroundPermissionsAsync).not.toHaveBeenCalled();
});

test('좋아요: 알림 → 위치 → 항상 허용 순서로 묻는다', async () => {
  L.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' } as never);
  L.requestBackgroundPermissionsAsync.mockResolvedValue({ status: 'granted' } as never);
  expect(await answerArrivalOffer(true)).toBe(true);
  expect(write).toHaveBeenCalledWith({ ...EMPTY, offerSeen: true });
  expect((askNotifications as jest.Mock).mock.invocationCallOrder[0]).toBeLessThan(
    L.requestBackgroundPermissionsAsync.mock.invocationCallOrder[0],
  );
});

test('좋아요인데 위치를 거절하면 항상 허용은 안 묻는다', async () => {
  L.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'denied' } as never);
  expect(await answerArrivalOffer(true)).toBe(false);
  expect(L.requestBackgroundPermissionsAsync).not.toHaveBeenCalled();
});

test('로그아웃 정리: 감시를 멈추고 예약 알림·기록을 지운다', async () => {
  L.hasStartedGeofencingAsync.mockResolvedValue(true);
  await clearArrivalData();
  expect(L.stopGeofencingAsync).toHaveBeenCalledWith('arrival-geofence');
  expect(Notifications.cancelAllScheduledNotificationsAsync).toHaveBeenCalled();
  expect(clearArrival).toHaveBeenCalled();
});
