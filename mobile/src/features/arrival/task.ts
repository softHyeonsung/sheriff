// mobile/src/features/arrival/task.ts
// OS가 지오펜스 진입/이탈 때 깨우는 태스크. 앱이 꺼진 채 깨어나도 정의돼 있도록 앱 진입점(index.ts)에서 import한다.
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { AppState } from 'react-native';
import { ARRIVAL, arrivalMessage, decideArrival } from './rules';
import { updateArrival } from './store';

export const ARRIVAL_TASK = 'arrival-geofence';

type GeofenceEvent = { eventType: Location.GeofencingEventType; region: Location.LocationRegion };

const keyFor = (id: string) => `arrival:${id}`;

export async function handleGeofenceEvent({ eventType, region }: GeofenceEvent, now = Date.now()): Promise<void> {
  const id = region.identifier;
  if (!id) return;

  if (eventType === Location.GeofencingEventType.Exit) {
    // 2분 안에 떠났다 = 스쳐 지나감. 이미 울린 기록은 하루 횟수에 계속 센다.
    await Notifications.cancelScheduledNotificationAsync(keyFor(id));
    await updateArrival(async (data) => ({ ...data, log: data.log.filter((e) => !(e.id === id && e.at > now)) }), now);
    return;
  }

  // 앱을 보고 있으면 알릴 필요가 없다. 등록 직후 OS가 "이미 안에 있음"으로 보내는 진입도 여기서 걸러진다.
  if (AppState.currentState === 'active') return;

  await updateArrival(async (data) => {
    const target = data.regions[id];
    if (!target || !decideArrival(now, id, target, data.log)) return null;
    await Notifications.scheduleNotificationAsync({
      identifier: keyFor(id),
      content: { body: arrivalMessage(target.name, target.grade), data: { hideoutId: id } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: ARRIVAL.dwellMs / 1000, channelId: 'arrival' },
    });
    return { ...data, log: [...data.log, { id, at: now + ARRIVAL.dwellMs }] };
  }, now);
}

// 알림이 울리기 전에 발자국을 남겼으면 "발자국 남길까요?"는 늦은 말이다. 기록은 그대로 둬 하루 횟수에 센다.
export async function cancelArrivalAlert(hideoutId: string): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(keyFor(hideoutId));
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
