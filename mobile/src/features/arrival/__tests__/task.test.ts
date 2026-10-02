// mobile/src/features/arrival/__tests__/task.test.ts
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { AppState } from 'react-native';
import type { ArrivalData } from '../store';
import { updateArrival } from '../store';
import { ARRIVAL_TASK, cancelArrivalAlert, handleGeofenceEvent } from '../task';

jest.mock('expo-task-manager', () => ({ defineTask: jest.fn() }));
jest.mock('expo-location', () => ({ GeofencingEventType: { Enter: 1, Exit: 2 } }));
jest.mock('expo-notifications', () => ({
  scheduleNotificationAsync: jest.fn(),
  cancelScheduledNotificationAsync: jest.fn(),
  SchedulableTriggerInputTypes: { TIME_INTERVAL: 'timeInterval' },
}));
jest.mock('../store', () => ({ updateArrival: jest.fn() }));

const schedule = Notifications.scheduleNotificationAsync as jest.Mock;
const cancel = Notifications.cancelScheduledNotificationAsync as jest.Mock;
const now = new Date(2026, 8, 29, 14, 0).getTime();
const region = { identifier: 'a', latitude: 37.5, longitude: 127, radius: 150 };
const data = (log: { id: string; at: number }[] = []): ArrivalData => ({
  regions: { a: { name: '동네 빵집', grade: 'hut', lastVisitedAt: null } },
  log,
  offerSeen: false,
});

// Fake store: runs the updater against `current`, remembers what it wrote (undefined = no write).
let current: ArrivalData;
let written: ArrivalData | null | undefined;
function useStore(d: ArrivalData) {
  current = d;
  written = undefined;
  (updateArrival as jest.Mock).mockImplementation(async (fn: (d: ArrivalData) => Promise<ArrivalData | null>) => {
    const next = await fn(current);
    if (next) written = next;
  });
}

test('태스크를 등록해 둔다', () => {
  // module load registered it; checked before clearAllMocks runs below
  expect(TaskManager.defineTask).toHaveBeenCalledWith(ARRIVAL_TASK, expect.any(Function));
});

describe('진입/이탈', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.defineProperty(AppState, 'currentState', { value: 'background', configurable: true });
  });

  test('진입하면 2분 뒤 알림을 예약하고 기록한다', async () => {
    useStore(data());
    await handleGeofenceEvent({ eventType: 1, region }, now);
    expect(schedule).toHaveBeenCalledWith({
      identifier: 'arrival:a',
      content: { body: '또 왔다냥, 동네 빵집. 여기 자주 오는구냥 :)', data: { hideoutId: 'a' } },
      trigger: { type: 'timeInterval', seconds: 120, channelId: 'arrival' },
    });
    expect(written).toEqual({ ...data(), log: [{ id: 'a', at: now + 120000 }] });
    expect((updateArrival as jest.Mock).mock.calls[0][1]).toBe(now);
  });

  test('앱을 보고 있을 때 들어온 진입은 무시(등록 직후 "이미 안에 있음" 이벤트 포함)', async () => {
    Object.defineProperty(AppState, 'currentState', { value: 'active', configurable: true });
    useStore(data());
    await handleGeofenceEvent({ eventType: 1, region }, now);
    expect(schedule).not.toHaveBeenCalled();
    expect(written).toBeUndefined();
  });

  test('규칙이 막으면 아무것도 안 한다', async () => {
    useStore(data([{ id: 'a', at: now + 60000 }])); // 이미 예약됨(진입 중복)
    await handleGeofenceEvent({ eventType: 1, region }, now);
    expect(schedule).not.toHaveBeenCalled();
    expect(written).toBeUndefined();
  });

  test('모르는 곳이면 무시', async () => {
    useStore(data());
    await handleGeofenceEvent({ eventType: 1, region: { ...region, identifier: 'zzz' } }, now);
    expect(schedule).not.toHaveBeenCalled();
  });

  test('이탈하면 예약을 취소하고 아직 안 울린 기록만 지운다', async () => {
    const rang = { id: 'a', at: now - 3600000 };
    const pending = { id: 'a', at: now + 60000 };
    const other = { id: 'b', at: now + 60000 };
    useStore(data([rang, pending, other]));
    await handleGeofenceEvent({ eventType: 2, region }, now);
    expect(cancel).toHaveBeenCalledWith('arrival:a');
    expect(written).toEqual({ ...data(), log: [rang, other] });
  });

  test('찜한 곳이면 찜 문구', async () => {
    useStore({ ...data(), regions: { 'wish:1': { name: '찜한 카페', grade: 'paw', lastVisitedAt: null, wish: true } } });
    await handleGeofenceEvent({ eventType: 1, region: { ...region, identifier: 'wish:1' } }, now);
    expect(schedule.mock.calls[0][0].content.body).toBe('가고 싶다던 찜한 카페, 드디어 왔다냥!');
  });

  test('발자국을 남기면 그곳 예약 알림을 취소한다(기록은 남겨 하루 횟수에 센다)', async () => {
    await cancelArrivalAlert('a');
    expect(cancel).toHaveBeenCalledWith('arrival:a');
    expect(updateArrival).not.toHaveBeenCalled();
  });
});
