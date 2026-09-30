// mobile/src/features/arrival/rules.ts
// 도착 알림을 보낼지, 어디를 감시할지, 뭐라고 말할지 — 전부 순수 함수.
import type { Grade } from '@/map/grades';

const HOUR = 3600 * 1000;
export const ARRIVAL = {
  radiusM: 150,
  dwellMs: 2 * 60 * 1000,
  cooldownMs: 6 * HOUR,
  dailyMax: 8,
  quietStart: 22,
  quietEnd: 8,
  maxRegions: 20, // iOS 지오펜스 한도
  keepMs: 7 * 24 * HOUR,
};

export type ArrivalRegion = { name: string; grade: Grade; lastVisitedAt: string | null; wish?: boolean };
// at = 알림이 울리는(울릴) 시각. 이탈로 취소된 예약은 기록에서 빠진다.
export type ArrivalLogEntry = { id: string; at: number };

export function decideArrival(now: number, id: string, region: ArrivalRegion, log: ArrivalLogEntry[]): boolean {
  const fireAt = now + ARRIVAL.dwellMs;
  const hour = new Date(fireAt).getHours();
  if (hour >= ARRIVAL.quietStart || hour < ARRIVAL.quietEnd) return false;
  if (region.lastVisitedAt && fireAt - Date.parse(region.lastVisitedAt) < ARRIVAL.cooldownMs) return false;
  if (log.some((e) => e.id === id && Math.abs(fireAt - e.at) < ARRIVAL.cooldownMs)) return false;
  const dayStart = new Date(fireAt);
  dayStart.setHours(0, 0, 0, 0);
  return log.filter((e) => e.at >= dayStart.getTime()).length < ARRIVAL.dailyMax;
}

export function pickNearest<T extends { lat: number; lng: number }>(items: T[], origin: { lat: number; lng: number }, n: number): T[] {
  // 순서만 필요하니 평면 근사로 충분하다.
  const k = Math.cos((origin.lat * Math.PI) / 180);
  const d2 = (p: { lat: number; lng: number }) => (p.lat - origin.lat) ** 2 + ((p.lng - origin.lng) * k) ** 2;
  return [...items].sort((a, b) => d2(a) - d2(b)).slice(0, n);
}

const REGULAR: Grade[] = ['hut', 'tower', 'palace'];

export function arrivalMessage(name: string, grade: Grade, wish = false): string {
  if (wish) return `가고 싶다던 ${name}, 드디어 왔어요!`;
  return REGULAR.includes(grade) ? `또 왔네요, ${name}. 여기 자주 오시네요 :)` : `${name} 오셨네요. 발자국 남길까요?`;
}
