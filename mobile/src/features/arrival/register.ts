// mobile/src/features/arrival/register.ts
// 감시할 아지트 등록과 "항상 허용" 권한 카드.
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import type { MyHideout } from '@/features/map/useMyHideouts';
import { askNotifications, ensureArrivalChannel } from '@/features/onboarding/permissions';
import { ARRIVAL, pickNearest } from './rules';
import { clearArrival, readArrival, updateArrival } from './store';
import { ARRIVAL_TASK } from './task';

async function backgroundGranted(): Promise<boolean> {
  return (await Location.getBackgroundPermissionsAsync()).status === 'granted';
}

const sameIds = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join() === [...b].sort().join();

// ponytail: 앱을 열 때만 갱신 — 아지트 20곳 초과 + 오래 안 연 채 먼 동네면 거기선 알림이 없다.
// 필요해지면 "내 위치 큰 원 이탈 시 재등록"을 추가.
export async function syncArrivalRegions(hideouts: MyHideout[]): Promise<void> {
  if ((await readArrival()).disabled) return; // 사용자가 끈 상태
  if (!(await backgroundGranted())) return;
  if (hideouts.length === 0) {
    if (await Location.hasStartedGeofencingAsync(ARRIVAL_TASK)) await Location.stopGeofencingAsync(ARRIVAL_TASK);
    return;
  }
  await ensureArrivalChannel();
  const last = await Location.getLastKnownPositionAsync();
  const origin = last ? { lat: last.coords.latitude, lng: last.coords.longitude } : hideouts[0];
  const picked = pickNearest(hideouts, origin, ARRIVAL.maxRegions);
  let changed = true;
  // 이름·등급·방문 시각은 매번 새로 저장한다(태스크가 이걸 보고 판단).
  await updateArrival(async (data) => {
    changed = !sameIds(Object.keys(data.regions), picked.map((h) => h.id));
    return {
      ...data,
      regions: Object.fromEntries(picked.map((h) => [h.id, { name: h.name, grade: h.grade, lastVisitedAt: h.lastVisitedAt }])),
    };
  });
  // 등록할 때마다 OS가 모든 원에 진입/이탈을 한꺼번에 보낸다. 같은 곳들을 이미 감시 중이면 건드리지 않는다.
  if (!changed && (await Location.hasStartedGeofencingAsync(ARRIVAL_TASK))) return;
  await Location.startGeofencingAsync(
    ARRIVAL_TASK,
    picked.map((h) => ({ identifier: h.id, latitude: h.lat, longitude: h.lng, radius: ARRIVAL.radiusM })),
  );
}

export async function shouldOfferArrival(footprintCount: number): Promise<boolean> {
  if (footprintCount < 2) return false;
  const data = await readArrival();
  if (data.offerSeen || data.disabled) return false;
  return !(await backgroundGranted());
}

// 어떤 답이든 카드는 다시 안 띄운다. 허용까지 가면 true.
export async function answerArrivalOffer(accept: boolean): Promise<boolean> {
  await updateArrival(async (data) => ({ ...data, offerSeen: true }));
  if (!accept) return false;
  await askNotifications();
  if ((await Location.requestForegroundPermissionsAsync()).status !== 'granted') return false;
  return (await Location.requestBackgroundPermissionsAsync()).status === 'granted';
}

// 로그아웃: 이 계정의 아지트 감시를 멈추고 예약된 도착 알림·기록을 지운다(다음 사람에게 울리지 않게).
export async function clearArrivalData(): Promise<void> {
  if (await Location.hasStartedGeofencingAsync(ARRIVAL_TASK)) await Location.stopGeofencingAsync(ARRIVAL_TASK);
  await Notifications.cancelAllScheduledNotificationsAsync(); // 이 앱이 예약하는 알림은 도착 알림뿐
  await clearArrival();
}

// 프로필 스위치: 항상 허용 && 사용자가 끄지 않음.
export async function arrivalSwitchState(): Promise<{ on: boolean }> {
  const [granted, data] = await Promise.all([backgroundGranted(), readArrival()]);
  return { on: granted && !data.disabled };
}

// 끄기는 "끔"을 기억해서 지도를 열어도 다시 등록하지 않는다. 켜기는 권한을 차례로 묻고 바로 등록.
export async function setArrivalEnabled(on: boolean, hideouts: MyHideout[]): Promise<'on' | 'off' | 'needs_settings'> {
  if (!on) {
    await updateArrival(async (d) => ({ ...d, disabled: true }));
    if (await Location.hasStartedGeofencingAsync(ARRIVAL_TASK)) await Location.stopGeofencingAsync(ARRIVAL_TASK);
    await Notifications.cancelAllScheduledNotificationsAsync(); // 이 앱이 예약하는 알림은 도착 알림뿐
    return 'off';
  }
  await updateArrival(async (d) => ({ ...d, disabled: false, offerSeen: true }));
  await askNotifications();
  if ((await Location.requestForegroundPermissionsAsync()).status !== 'granted') return 'needs_settings';
  if ((await Location.requestBackgroundPermissionsAsync()).status !== 'granted') return 'needs_settings';
  await syncArrivalRegions(hideouts);
  return 'on';
}
