// mobile/src/features/checkin/errors.ts
// Kept free of SDK imports so pure modules (copy.ts) can use it without pulling in Supabase.
export type CheckinErrorCode = 'too_far' | 'weak_gps' | 'cooldown' | 'not_yours' | 'offline' | 'location_off' | 'unknown';

export class CheckinError extends Error {
  constructor(
    public code: CheckinErrorCode,
    public nextAt?: string,
  ) {
    super(code);
  }
}
