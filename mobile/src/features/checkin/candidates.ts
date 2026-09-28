// mobile/src/features/checkin/candidates.ts
// Pure (type-only imports) so UI can use it without pulling in the Supabase client.
import type { Candidate, CheckinTarget } from './checkinApi';

export function targetFor(c: Candidate): CheckinTarget {
  if (c.kind === 'mine') return { kind: 'mine', aidutId: c.aidutId };
  return { kind: 'kakao', placeId: c.placeId, name: c.name, lat: c.lat, lng: c.lng, roadAddress: c.roadAddress };
}
