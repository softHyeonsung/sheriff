// mobile/src/features/checkin/dwell.ts
// 발자국은 3분 머문 뒤에 남는다: 고른 장소를 적어 두고, 3분 뒤에도 그 자리면 발자국 대기열에 넣는다.
// 실제로 들렀는지 보는 가벼운 확인이다(지나가다 누른 것은 남지 않는다).
// 앱을 내려놔도 확인되도록 3분 동안만 알림이 떠 있는 위치 서비스(DWELL_TASK)를 켠다 — "항상 허용" 권한은 필요 없다.
// 앱이 꺼진 채 깨어나도 태스크가 정의돼 있도록 앱 진입점(index.ts)에서 import한다.
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { AppState } from 'react-native';
import { jsonFile } from '@/lib/jsonFile';
import { type CheckinTarget, type Fix, submitCheckin } from './checkinApi';
import { metersBetween } from './offline';
import { enqueueCheckin, flushQueue } from './queue';

export const DWELL_MS = 3 * 60 * 1000;
export const DWELL_RADIUS_M = 50; // 서버 checkin_radius_m와 같은 값
// 3분이 지났는데 위치를 끝내 못 얻으면(권한을 껐거나 실내 깊숙이) 이만큼만 더 기다리고 접는다.
export const DWELL_GIVE_UP_MS = 10 * 60 * 1000;
export const DWELL_TASK = 'checkin-dwell';

export type Dwell = { fix: Fix; target: CheckinTarget; name: string; until: number };
// outcome: 끝난 뒤 화면이 한 번 보고 지우는 결과.
export type DwellState = { pending: Dwell | null; outcome: 'stayed' | 'left' | null };
export type Sample = { lat: number; lng: number; accuracy: number; at: number };

const EMPTY: DwellState = { pending: null, outcome: null };
const file = jsonFile<DwellState>('checkin-dwell.json', (raw) => (raw && typeof raw === 'object' ? { ...EMPTY, ...(raw as DwellState) } : EMPTY));

export const readDwell = () => file.read();

export function judgeDwell(d: Dwell, s: Sample): 'wait' | 'left' | 'stayed' {
  // GPS가 흔들리는 만큼은 봐준다(최대 기준 거리만큼).
  if (metersBetween(d.fix, s) > DWELL_RADIUS_M + Math.min(s.accuracy, DWELL_RADIUS_M)) return 'left';
  if (s.at >= d.until) return 'stayed';
  return 'wait';
}

async function stopWatching(): Promise<void> {
  try {
    if (await Location.hasStartedLocationUpdatesAsync(DWELL_TASK)) await Location.stopLocationUpdatesAsync(DWELL_TASK);
  } catch (e) {
    console.warn('머무름 확인 끄기 실패', e);
  }
}

export async function startDwell(item: Omit<Dwell, 'until'>, now = Date.now()): Promise<void> {
  await file.update(async () => ({ pending: { ...item, until: now + DWELL_MS }, outcome: null }));
  try {
    await Location.startLocationUpdatesAsync(DWELL_TASK, {
      accuracy: Location.Accuracy.High,
      timeInterval: 15000,
      distanceInterval: 0,
      foregroundService: { notificationTitle: '발자국을 남기는 중이다냥', notificationBody: '3분 뒤에도 여기 있는지 한 번 확인할게냥.' },
    });
  } catch (e) {
    // 서비스를 못 켜도 앱을 보고 있으면 화면 쪽(useDwell)이 3분 뒤에 확인한다.
    console.warn('머무름 확인 켜기 실패', e);
  }
}

export async function cancelDwell(): Promise<void> {
  await file.update(async () => EMPTY);
  await stopWatching();
}

// 화면이 결과를 보여줬다.
export const ackDwell = () => file.update(async (st) => ({ ...st, outcome: null }));

// 위치 하나로 판정한다. 화면(앱을 보고 있을 때)과 태스크가 같이 불러도 결과는 한 번만 난다.
export async function settleDwell(s: Sample): Promise<void> {
  const done: { d?: Dwell; verdict?: 'stayed' | 'left'; idle?: boolean } = {};
  await file.update(async (st) => {
    if (!st.pending) {
      done.idle = true;
      return null;
    }
    const verdict = judgeDwell(st.pending, s);
    if (verdict === 'wait') return null;
    done.d = st.pending;
    done.verdict = verdict;
    return { pending: null, outcome: verdict };
  });
  if (done.idle) await stopWatching(); // 기다리는 게 없는데 서비스만 남았다
  if (!done.d) return;
  await stopWatching();
  const stayed = done.verdict === 'stayed';
  // 서버 검사(거리·정확도)는 고를 때의 위치로 받는다. 3분 뒤 위치는 머물렀다는 증거일 뿐.
  if (stayed) await enqueueCheckin({ fix: done.d.fix, target: done.d.target, name: done.d.name, dwell: true });
  if (AppState.currentState === 'active') return; // 보고 있으면 화면이 올리고 축하한다
  let uploaded = false;
  if (stayed) uploaded = (await flushQueue(submitCheckin).catch(() => null))?.results.length === 1;
  await Notifications.scheduleNotificationAsync({
    content: {
      body: !stayed
        ? `${done.d.name}에서 3분을 채우지 못해 발자국을 남기지 못했다냥.`
        : uploaded
          ? `${done.d.name}에 발자국을 남겼다냥 🐾`
          : `${done.d.name}에 3분 머물렀다냥. 앱을 열면 발자국을 남길게냥 🐾`,
    },
    trigger: null,
  });
}

TaskManager.defineTask<{ locations: Location.LocationObject[] }>(DWELL_TASK, async ({ data, error }) => {
  // 태스크가 던지면 OS가 다음 위치를 안 줄 수 있다 — 전부 잡는다.
  if (error) {
    console.error('머무름 확인 태스크 오류', error);
    return;
  }
  try {
    const l = data.locations.at(-1);
    if (l) await settleDwell({ lat: l.coords.latitude, lng: l.coords.longitude, accuracy: l.coords.accuracy ?? 999, at: l.timestamp });
  } catch (e) {
    console.error('머무름 확인 실패', e);
  }
});
