// mobile/src/features/arrival/register.ts
// 감시할 아지트 등록과 "항상 허용" 권한 카드.
import * as Location from 'expo-location';
import type { MyHideout } from '@/features/map/useMyHideouts';
import { askNotifications } from '@/features/onboarding/permissions';
import { ARRIVAL, pickNearest } from './rules';
import { readArrival, writeArrival } from './store';
import { ARRIVAL_TASK } from './task';

async function backgroundGranted(): Promise<boolean> {
  return (await Location.getBackgroundPermissionsAsync()).status === 'granted';
}

// ponytail: 앱을 열 때만 갱신 — 아지트 20곳 초과 + 오래 안 연 채 먼 동네면 거기선 알림이 없다.
// 필요해지면 "내 위치 큰 원 이탈 시 재등록"을 추가.
export async function syncArrivalRegions(hideouts: MyHideout[]): Promise<void> {
  if (!(await backgroundGranted())) return;
  if (hideouts.length === 0) {
    if (await Location.hasStartedGeofencingAsync(ARRIVAL_TASK)) await Location.stopGeofencingAsync(ARRIVAL_TASK);
    return;
  }
  const last = await Location.getLastKnownPositionAsync();
  const origin = last ? { lat: last.coords.latitude, lng: last.coords.longitude } : hideouts[0];
  const picked = pickNearest(hideouts, origin, ARRIVAL.maxRegions);
  const data = await readArrival();
  await writeArrival({
    ...data,
    regions: Object.fromEntries(picked.map((h) => [h.id, { name: h.name, grade: h.grade, lastVisitedAt: h.lastVisitedAt }])),
  });
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
  const data = await readArrival();
  await writeArrival({ ...data, offerSeen: true });
  if (!accept) return false;
  await askNotifications();
  if ((await Location.requestForegroundPermissionsAsync()).status !== 'granted') return false;
  return (await Location.requestBackgroundPermissionsAsync()).status === 'granted';
}
