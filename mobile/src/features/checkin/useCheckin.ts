// mobile/src/features/checkin/useCheckin.ts
import { useCallback, useRef, useState } from 'react';
import {
  type Candidate,
  type CheckinResult,
  type CheckinTarget,
  type Fix,
  getFreshFix,
  submitCheckin,
  suggestPlace,
} from './checkinApi';
import { MSG, messageFor } from './copy';

export type Choosing = {
  name: 'choosing';
  fix: Fix;
  hereAddress: string | null;
  candidates: Candidate[];
  busy: boolean;
  error: string | null;
};
export type CheckinState =
  | { name: 'idle' }
  | { name: 'locating' }
  | Choosing
  | { name: 'celebrating'; result: CheckinResult }
  | { name: 'failed'; message: string; needsSettings: boolean };

const ATTEMPTS = 2; // weak GPS gets one automatic retry before we ask the user

export function useCheckin() {
  const [state, setState] = useState<CheckinState>({ name: 'idle' });
  // Synchronous guard: a double tap fires twice before React re-renders `busy`.
  const inFlight = useRef(false);
  // The open sheet's context, kept in a ref (written only in callbacks, never during render)
  // so `choose` can read it without depending on `state`.
  const sheet = useRef<Omit<Choosing, 'name' | 'busy' | 'error'> | null>(null);

  const start = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setState({ name: 'locating' });
    try {
      for (let i = 0; i < ATTEMPTS; i++) {
        const fix = await getFreshFix();
        if (fix === 'denied') {
          setState({ name: 'failed', message: MSG.denied, needsSettings: true });
          return;
        }
        const s = await suggestPlace(fix);
        if (s.status === 'ok') {
          sheet.current = { fix, hereAddress: s.hereAddress, candidates: s.candidates };
          setState({ name: 'choosing', ...sheet.current, busy: false, error: null });
          return;
        }
      }
      setState({ name: 'failed', message: MSG.locating, needsSettings: false });
    } catch (e) {
      setState({ name: 'failed', message: messageFor(e), needsSettings: false });
    } finally {
      inFlight.current = false;
    }
  }, []);

  const choose = useCallback(async (target: CheckinTarget) => {
    const c = sheet.current;
    if (inFlight.current || !c) return;
    inFlight.current = true;
    setState({ name: 'choosing', ...c, busy: true, error: null });
    try {
      const result = await submitCheckin(c.fix, target);
      sheet.current = null;
      setState({ name: 'celebrating', result });
    } catch (e) {
      setState({ name: 'choosing', ...c, busy: false, error: messageFor(e) });
    } finally {
      inFlight.current = false;
    }
  }, []);

  const close = useCallback(() => {
    sheet.current = null;
    setState({ name: 'idle' });
  }, []);

  return { state, start, choose, close };
}
