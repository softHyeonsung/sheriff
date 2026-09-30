// mobile/src/features/checkin/offline.ts
// 끊겼을 때 후보: 저장본의 내 아지트 중 가까운 곳 + 새로 만들기. 카카오 후보는 네트워크가 있어야 한다.
import { readMapCache } from '@/features/map/mapCache';
import type { MyHideout } from '@/features/map/useMyHideouts';
import { isOffline } from '@/lib/network';
import { type Candidate, type Fix, type MineCandidate, suggestPlace } from './checkinApi';
import { CheckinError } from './errors';

export const OFFLINE_RADIUS_M = 150; // 서버 checkin_radius_m와 같은 값
export const OFFLINE_ACCURACY_MAX_M = 150; // 서버 gps_accuracy_max_m와 같은 값

export type Suggestion =
  | { status: 'weak_gps' }
  | { status: 'ok'; hereAddress: string | null; candidates: Candidate[]; offline: boolean };

export function metersBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function offlineCandidates(fix: Fix, hideouts: MyHideout[]): MineCandidate[] {
  return hideouts
    .map((h) => ({ kind: 'mine' as const, aidutId: h.id, name: h.name, grade: h.grade, distanceM: metersBetween(fix, h) }))
    .filter((c) => c.distanceM <= OFFLINE_RADIUS_M)
    .sort((a, b) => a.distanceM - b.distanceM);
}

export async function suggestOrOffline(fix: Fix): Promise<Suggestion> {
  if (!(await isOffline())) {
    try {
      const s = await suggestPlace(fix);
      return s.status === 'ok' ? { ...s, offline: false } : s;
    } catch (e) {
      if (!(e instanceof CheckinError && e.code === 'offline')) throw e; // 연결 감지가 늦은 경우만 오프라인으로
    }
  }
  if (fix.accuracy > OFFLINE_ACCURACY_MAX_M) return { status: 'weak_gps' };
  const { hideouts } = await readMapCache();
  return { status: 'ok', hereAddress: null, candidates: offlineCandidates(fix, hideouts), offline: true };
}
