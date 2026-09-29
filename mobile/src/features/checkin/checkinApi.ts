// mobile/src/features/checkin/checkinApi.ts
// The only place the check-in flow talks to the outside world: GPS, suggest-place, submit_checkin.
import * as Location from 'expo-location';
import { supabase } from '@/services/supabase';
import type { DongStage } from '@/features/territory/stages';
import type { Grade } from '@/map/grades';
import { CheckinError, type CheckinErrorCode } from './errors';

export { CheckinError, type CheckinErrorCode };
export { targetFor } from './candidates';

export type Fix = { lat: number; lng: number; accuracy: number };
export type MineCandidate = { kind: 'mine'; aidutId: string; name: string; grade: Grade; distanceM: number };
export type KakaoCandidate = {
  kind: 'kakao';
  placeId: string;
  name: string;
  lat: number;
  lng: number;
  roadAddress: string | null;
  distanceM: number;
};
export type Candidate = MineCandidate | KakaoCandidate;
export type SuggestResult = { status: 'weak_gps' } | { status: 'ok'; hereAddress: string | null; candidates: Candidate[] };
export type CheckinTarget =
  | { kind: 'mine'; aidutId: string }
  | { kind: 'kakao'; placeId: string; name: string; lat: number; lng: number; roadAddress: string | null }
  | { kind: 'new'; roadAddress: string | null };
export type CheckinResult = {
  aidutId: string;
  name: string;
  footprintCount: number;
  grade: Grade;
  gradeChanged: boolean;
  newCellsCleared: number;
  // 아지트가 동 경계 밖이거나 경계 데이터가 없으면 null.
  dong?: { name: string; stage: DongStage; stageChanged: boolean } | null;
};

const KNOWN: CheckinErrorCode[] = ['too_far', 'weak_gps', 'cooldown', 'not_yours'];

// A fresh, accurate fix taken at the moment of the tap — the map's dot may be minutes old.
export async function getFreshFix(): Promise<Fix | 'denied'> {
  const perm = await Location.getForegroundPermissionsAsync();
  if (perm.status !== 'granted') return 'denied';
  const p = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
  return { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy ?? 999 };
}

export async function suggestPlace(fix: Fix): Promise<SuggestResult> {
  const { data, error } = await supabase.functions.invoke('suggest-place', {
    body: { lat: fix.lat, lng: fix.lng, accuracy: fix.accuracy },
    timeout: 10000, // RN fetch has no default timeout; a stalled request must not hang the flow
  });
  if (error) {
    console.error('suggest-place 실패', error);
    throw new CheckinError('unknown');
  }
  return data as SuggestResult;
}

export async function submitCheckin(fix: Fix, target: CheckinTarget): Promise<CheckinResult> {
  const { data, error } = await supabase.rpc('submit_checkin', {
    p_lat: fix.lat,
    p_lng: fix.lng,
    p_accuracy: fix.accuracy,
    p_target: target,
  });
  if (error) {
    const code = (KNOWN as string[]).includes(error.message) ? (error.message as CheckinErrorCode) : 'unknown';
    if (code === 'unknown') console.error('submit_checkin 실패', error);
    throw new CheckinError(code, code === 'cooldown' ? (error.details ?? undefined) : undefined);
  }
  return data as CheckinResult;
}

