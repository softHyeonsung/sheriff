// mobile/src/features/arrival/register.ts
// 감시할 아지트 등록과 "항상 허용" 권한 카드.
import * as Location from 'expo-location';
import type { MyHideout } from '@/features/map/useMyHideouts';
import { askNotifications, ensureArrivalChannel } from '@/features/onboarding/permissions';
import { ARRIVAL, pickNearest } from './rules';
import { readArrival, updateArrival } from './store';
import { ARRIVAL_TASK } from './task';

async function backgroundGranted(): Promise<boolean> {
  return (await Location.getBackgroundPermissionsAsync()).status === 'granted';
}

const sameIds = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join() === [...b].sort().join();

// ponytail: 앱을 열 때만 갱신 — 아지트 20곳 초과 + 오래 안 연 채 먼 동네면 거기선 알림이 없다.
// 필요해지면 "내 위치 큰 원 이탈 시 재등록"을 추가.
export async function syncArrivalRegions(hideouts: MyHideout[]): Promise<void> {
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
  if ((await readArrival()).offerSeen) return false;
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
