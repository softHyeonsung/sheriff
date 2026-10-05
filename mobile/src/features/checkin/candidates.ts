// mobile/src/features/checkin/candidates.ts
// Pure (type-only imports) so UI can use it without pulling in the Supabase client.
import type { Candidate, CheckinTarget } from './checkinApi';

// 대기열·머무는 중 안내에서 보여줄 이름.
export function nameFor(target: CheckinTarget, candidates: Candidate[]): string {
  if (target.kind !== 'mine') return target.name;
  const c = candidates.find((x) => x.kind === 'mine' && x.aidutId === target.aidutId);
  return c?.name ?? '내 아지트';
}

export function targetFor(c: Candidate): CheckinTarget {
  if (c.kind === 'mine') return { kind: 'mine', aidutId: c.aidutId };
  return { kind: 'kakao', placeId: c.placeId, name: c.name, lat: c.lat, lng: c.lng, roadAddress: c.roadAddress };
}
