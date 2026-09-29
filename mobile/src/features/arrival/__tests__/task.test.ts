// mobile/src/features/arrival/__tests__/task.test.ts
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { readArrival, writeArrival } from '../store';
import { ARRIVAL_TASK, handleGeofenceEvent } from '../task';

jest.mock('expo-task-manager', () => ({ defineTask: jest.fn() }));
jest.mock('expo-location', () => ({ GeofencingEventType: { Enter: 1, Exit: 2 } }));
jest.mock('expo-notifications', () => ({
  scheduleNotificationAsync: jest.fn(),
  cancelScheduledNotificationAsync: jest.fn(),
  SchedulableTriggerInputTypes: { TIME_INTERVAL: 'timeInterval' },
}));
jest.mock('../store', () => ({ readArrival: jest.fn(), writeArrival: jest.fn() }));

const read = readArrival as jest.Mock;
const write = writeArrival as jest.Mock;
const schedule = Notifications.scheduleNotificationAsync as jest.Mock;
const cancel = Notifications.cancelScheduledNotificationAsync as jest.Mock;
const now = new Date(2026, 8, 29, 14, 0).getTime();
const region = { identifier: 'a', latitude: 37.5, longitude: 127, radius: 150 };
const data = (log: { id: string; at: number }[] = []) => ({
  regions: { a: { name: '동네 빵집', grade: 'hut', lastVisitedAt: null } },
  log,
  offerSeen: false,
});

test('태스크를 등록해 둔다', () => {
  // module load registered it; checked before clearAllMocks runs below
  expect(TaskManager.defineTask).toHaveBeenCalledWith(ARRIVAL_TASK, expect.any(Function));
});

describe('진입/이탈', () => {
  beforeEach(() => jest.clearAllMocks());

  test('진입하면 2분 뒤 알림을 예약하고 기록한다', async () => {
    read.mockResolvedValue(data());
    await handleGeofenceEvent({ eventType: 1, region }, now);
    expect(schedule).toHaveBeenCalledWith({
      identifier: 'arrival:a',
      content: { body: '또 왔네요, 동네 빵집. 여기 자주 오시네요 :)', data: { hideoutId: 'a' } },
      trigger: { type: 'timeInterval', seconds: 120, channelId: 'arrival' },
    });
    expect(write).toHaveBeenCalledWith({ ...data(), log: [{ id: 'a', at: now + 120000 }] }, now);
  });

  test('규칙이 막으면 아무것도 안 한다', async () => {
    read.mockResolvedValue(data([{ id: 'a', at: now + 60000 }])); // 이미 예약됨(진입 중복)
    await handleGeofenceEvent({ eventType: 1, region }, now);
    expect(schedule).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
  });

  test('모르는 곳이면 무시', async () => {
    read.mockResolvedValue(data());
    await handleGeofenceEvent({ eventType: 1, region: { ...region, identifier: 'zzz' } }, now);
    expect(schedule).not.toHaveBeenCalled();
  });

  test('이탈하면 예약을 취소하고 아직 안 울린 기록만 지운다', async () => {
    const rang = { id: 'a', at: now - 3600000 };
    const pending = { id: 'a', at: now + 60000 };
    const other = { id: 'b', at: now + 60000 };
    read.mockResolvedValue(data([rang, pending, other]));
    await handleGeofenceEvent({ eventType: 2, region }, now);
    expect(cancel).toHaveBeenCalledWith('arrival:a');
    expect(write).toHaveBeenCalledWith({ ...data(), log: [rang, other] }, now);
  });
});
