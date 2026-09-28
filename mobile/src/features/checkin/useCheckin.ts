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
import { CheckinError } from './errors';

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
// A fix can stall indefinitely (weak signal indoors, Android's location dialog). Give up and
// offer a retry instead of leaving the user on "위치를 확인하고 있어요…" forever.
export const LOCATE_TIMEOUT_MS = 15000;

function within<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new CheckinError('unknown')), ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}

export function useCheckin() {
  const [state, setState] = useState<CheckinState>({ name: 'idle' });
  // Synchronous guard: a double tap fires twice before React re-renders `busy`.
  const inFlight = useRef(false);
  // Each start/close bumps the run id; a result that arrives for an older run is dropped
  // (e.g. the user closed while locating, then the fix came in).
  const run = useRef(0);
  // The open sheet's context, kept in a ref (written only in callbacks, never during render)
  // so `choose` can read it without depending on `state`.
  const sheet = useRef<Omit<Choosing, 'name' | 'busy' | 'error'> | null>(null);
  // After a rejection the user may have moved (e.g. walked closer after "too far"): the next
  // attempt takes a new fix instead of resending the old one.
  const fixIsStale = useRef(false);

  const start = useCallback(async () => {
    if (inFlight.current) return;
    const id = ++run.current;
    inFlight.current = true;
    setState({ name: 'locating' });
    try {
      for (let i = 0; i < ATTEMPTS; i++) {
        const fix = await within(getFreshFix(), LOCATE_TIMEOUT_MS);
        if (run.current !== id) return;
        if (fix === 'denied') {
          setState({ name: 'failed', message: MSG.denied, needsSettings: true });
          return;
        }
        const s = await suggestPlace(fix);
        if (run.current !== id) return;
        if (s.status === 'ok') {
          sheet.current = { fix, hereAddress: s.hereAddress, candidates: s.candidates };
          fixIsStale.current = false;
          setState({ name: 'choosing', ...sheet.current, busy: false, error: null });
          return;
        }
      }
      setState({ name: 'failed', message: MSG.locating, needsSettings: false });
    } catch (e) {
      if (run.current === id) setState({ name: 'failed', message: messageFor(e), needsSettings: false });
    } finally {
      if (run.current === id) inFlight.current = false;
    }
  }, []);

  const choose = useCallback(async (target: CheckinTarget) => {
    const c = sheet.current;
    if (inFlight.current || !c) return;
    inFlight.current = true;
    setState({ name: 'choosing', ...c, busy: true, error: null });
    try {
      let fix = c.fix;
      if (fixIsStale.current) {
        const fresh = await within(getFreshFix(), LOCATE_TIMEOUT_MS);
        if (fresh === 'denied') {
          setState({ name: 'choosing', ...c, busy: false, error: MSG.denied });
          return;
        }
        fix = fresh;
        sheet.current = { ...c, fix };
        fixIsStale.current = false;
      }
      const result = await submitCheckin(fix, target);
      sheet.current = null;
      setState({ name: 'celebrating', result });
    } catch (e) {
      fixIsStale.current = true;
      setState({ name: 'choosing', ...(sheet.current ?? c), busy: false, error: messageFor(e) });
    } finally {
      inFlight.current = false;
    }
  }, []);

  const close = useCallback(() => {
    run.current++;
    inFlight.current = false;
    sheet.current = null;
    setState({ name: 'idle' });
  }, []);

  return { state, start, choose, close };
}
