// mobile/src/features/arrival/task.ts
// OS가 지오펜스 진입/이탈 때 깨우는 태스크. 앱이 꺼진 채 깨어나도 정의돼 있도록 _layout에서 import한다.
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { ARRIVAL, arrivalMessage, decideArrival } from './rules';
import { readArrival, writeArrival } from './store';

export const ARRIVAL_TASK = 'arrival-geofence';

type GeofenceEvent = { eventType: Location.GeofencingEventType; region: Location.LocationRegion };

export async function handleGeofenceEvent({ eventType, region }: GeofenceEvent, now = Date.now()): Promise<void> {
  const id = region.identifier;
  if (!id) return;
  const key = `arrival:${id}`;
  const data = await readArrival();

  if (eventType === Location.GeofencingEventType.Exit) {
    // 2분 안에 떠났다 = 스쳐 지나감. 이미 울린 기록은 하루 횟수에 계속 센다.
    await Notifications.cancelScheduledNotificationAsync(key);
    await writeArrival({ ...data, log: data.log.filter((e) => !(e.id === id && e.at > now)) }, now);
    return;
  }

  const target = data.regions[id];
  if (!target || !decideArrival(now, id, target, data.log)) return;
  await Notifications.scheduleNotificationAsync({
    identifier: key,
    content: { body: arrivalMessage(target.name, target.grade), data: { hideoutId: id } },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: ARRIVAL.dwellMs / 1000, channelId: 'arrival' },
  });
  await writeArrival({ ...data, log: [...data.log, { id, at: now + ARRIVAL.dwellMs }] }, now);
}

TaskManager.defineTask<GeofenceEvent>(ARRIVAL_TASK, async ({ data, error }) => {
  // 태스크가 던지면 OS가 다음 이벤트를 안 줄 수 있다 — 전부 잡는다.
  if (error) {
    console.error('도착 알림 태스크 오류', error);
    return;
  }
  try {
    await handleGeofenceEvent(data);
  } catch (e) {
    console.error('도착 알림 처리 실패', e);
  }
});
