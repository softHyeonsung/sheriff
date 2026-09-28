# 체크인 UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 지도에서 "발자국 남기기" → "여기 ○○ 맞나요?"(아니면 후보 목록·새로 만들기) → 발자국 → 성장 축하 → 지도 마커 갱신.

**Architecture:** 서버와의 대화는 `features/checkin/checkinApi.ts` 하나(`suggest-place` Edge Function, `submit_checkin` RPC, 새 위치 받기). 흐름은 `useCheckin()` 상태 기계가 갖고, 문구는 `copy.ts` 순수 함수가 고른다. 화면 조각은 `CheckinSheet`(확인/목록)과 `Celebration`(스프링 팝+파티클+햅틱). 지도 화면은 조립만.

**Tech Stack:** Expo SDK 57, `expo-location`(설치됨), `expo-haptics`(신규), `react-native-reanimated`(설치됨), Supabase JS(`functions.invoke`, `rpc`), Jest + RNTL v14(**`render`·`renderHook`·`fireEvent`·`act`는 async — 반드시 `await`**; `jest.mock` 팩토리 안에서 쓰는 바깥 변수는 이름이 `mock`으로 시작해야 함).

**Spec:** `docs/superpowers/specs/2026-09-28-checkin-ux-design.md`

## Global Constraints

- 브랜치: `main`에서 `checkin-ux`(워크트리 `.claude/worktrees/checkin-ux`). `main` 직접 커밋 금지.
- 패키지 추가는 `npx expo install`만. Expo API는 `https://docs.expo.dev/versions/v57.0.0/sdk/<pkg>/` 확인 후 사용, 다르면 Ruling.
- 화면 코드 raw hex 금지(`@/constants/tokens`). Supabase는 `@/services/supabase`로만. 화면은 훅만 호출.
- 규칙 판정은 서버. 앱은 위치를 보내고 결과·거절을 보여줄 뿐.
- 서버 계약(①): `suggest-place` → `{ status: 'weak_gps' } | { status: 'ok', hereAddress: string | null, candidates: Candidate[] }`; `submit_checkin(p_lat, p_lng, p_accuracy, p_target)` → `{ aidutId, name, footprintCount, grade, gradeChanged, newCellsCleared }`, 거절은 `error.message` ∈ `too_far|weak_gps|cooldown|not_yours|…`, 쿨다운 다음 시각은 `error.details`(ISO 문자열).
- 문구(정확히):
  - 버튼 `발자국 남기기` · 확인 `여기 ○○ 맞나요?` · `다른 곳이에요` · `여기에 새로 만들기` · 축하 닫기 `좋아요`
  - 위치 확인 중/GPS 약함 `잠깐, 위치를 확인하고 있어요…`
  - 너무 멂 `조금만 더 가까이 가면 발자국을 남길 수 있어요.`
  - 쿨다운 `여긴 아까 다녀왔어요. H시 M분부터 다시 남길 수 있어요.`(현지 시각, 24시간), 시각을 모르면 `여긴 아까 다녀왔어요. 조금 뒤에 다시 남겨볼까요?`
  - 위치 권한 없음 `위치가 꺼져 있어서 발자국을 남기기 어려워요. 켜두시면 제가 도와드릴게요.`(카피톤 §3.6 원문 — 스펙의 "②와 같은 안내"를 카피톤의 체크인 전용 문구로 구체화) + `설정 열기`
  - 그 외 `앗, 잠깐 문제가 생겼어요. 다시 해볼까요?`
  - 첫 발자국 `🐾 첫 발자국이 찍혔어요. 여기서부터 시작이에요.`
  - 등급업 box `여기 박스가 생겼어요 📦 마음에 드나 봐요.` · hut `작은 집이 됐어요 🛖 자주 오시는군요.` · tower `캣타워예요 🗼 여긴 우리 단골이네요.` · palace `🏰 캣 팰리스. 여긴 당신의 인생 장소예요.`
  - 같은 등급 `🐾 발자국을 남겼어요` + `nextStageHint`(②)
- 명령은 PowerShell(`npx`는 Git Bash에서 WSL 오류). jest는 `mobile/`에서.

## Review Focus

1. **"발자국 남기기"·"여기 맞아요" 연타** — 요청은 한 번만. → Task 2 "진행 중 두 번째 요청 무시".
2. **쿨다운인데 서버가 시각(details)을 안 줌** — 깨진 "NaN시" 대신 시각 없는 문구. → Task 1 "시각을 모르면".
3. **발자국 저장 중에 시트를 닫음** — 저장 중엔 닫히지 않는다(닫았는데 뒤늦게 축하가 튀어나오지 않게). → Task 3 "저장 중엔 닫히지 않는다".
4. **후보 조회 네트워크 실패** — '위치 확인 중'에 멈추지 않고 다시 시도 가능한 안내. → Task 2 "후보 조회 실패".
5. **축하를 닫으면 지도 마커가 자란 모습으로 바뀐다** — 목록 새로고침. → Task 4 "축하 닫기 → 새로고침".

---

## Task 1: `checkinApi.ts` + `copy.ts`

**Files:**
- Create: `mobile/src/features/checkin/checkinApi.ts`
- Create: `mobile/src/features/checkin/copy.ts`
- Test: `mobile/src/features/checkin/__tests__/checkinApi.test.ts`, `mobile/src/features/checkin/__tests__/copy.test.ts`

**Interfaces:**
- Consumes: `supabase`(`@/services/supabase`), `Grade`·`GRADE_LABEL`(`@/map/grades`), `nextStageHint`·`GradeThresholds`(`@/features/map/…`), `expo-location`.
- Produces:
  - `export type Fix = { lat: number; lng: number; accuracy: number }`
  - `export type MineCandidate = { kind: 'mine'; aidutId: string; name: string; grade: Grade; distanceM: number }`
  - `export type KakaoCandidate = { kind: 'kakao'; placeId: string; name: string; lat: number; lng: number; roadAddress: string | null; distanceM: number }`
  - `export type Candidate = MineCandidate | KakaoCandidate`
  - `export type SuggestResult = { status: 'weak_gps' } | { status: 'ok'; hereAddress: string | null; candidates: Candidate[] }`
  - `export type CheckinTarget = { kind: 'mine'; aidutId: string } | { kind: 'kakao'; placeId: string; name: string; lat: number; lng: number; roadAddress: string | null } | { kind: 'new'; roadAddress: string | null }`
  - `export type CheckinResult = { aidutId: string; name: string; footprintCount: number; grade: Grade; gradeChanged: boolean; newCellsCleared: number }`
  - `export type CheckinErrorCode = 'too_far' | 'weak_gps' | 'cooldown' | 'not_yours' | 'unknown'`
  - `export class CheckinError extends Error { code: CheckinErrorCode; nextAt?: string }`
  - `export async function getFreshFix(): Promise<Fix | 'denied'>`
  - `export async function suggestPlace(fix: Fix): Promise<SuggestResult>`
  - `export async function submitCheckin(fix: Fix, target: CheckinTarget): Promise<CheckinResult>`
  - `export function targetFor(c: Candidate): CheckinTarget`
  - `copy.ts`: `export const MSG: { locating: string; denied: string; unknown: string }`, `export function messageFor(e: unknown): string`, `export function celebrationCopy(r: CheckinResult, t: GradeThresholds | null): { title: string; hint: string | null }`

- [ ] **Step 1: 실패하는 테스트**

```ts
// mobile/src/features/checkin/__tests__/checkinApi.test.ts
import * as Location from 'expo-location';
import { supabase } from '@/services/supabase';
import { CheckinError, getFreshFix, submitCheckin, suggestPlace, targetFor } from '../checkinApi';

jest.mock('@/services/supabase', () => ({ supabase: { rpc: jest.fn(), functions: { invoke: jest.fn() } } }));
jest.mock('expo-location', () => ({
  getForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
  Accuracy: { High: 4 },
}));

const rpc = supabase.rpc as jest.Mock;
const invoke = supabase.functions.invoke as jest.Mock;
const fix = { lat: 37.5, lng: 126.9, accuracy: 12 };

beforeEach(() => jest.clearAllMocks());

test('새 위치: 권한 있으면 정확한 위치, 없으면 denied', async () => {
  (Location.getForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
  (Location.getCurrentPositionAsync as jest.Mock).mockResolvedValue({ coords: { latitude: 37.5, longitude: 126.9, accuracy: 12 } });
  await expect(getFreshFix()).resolves.toEqual(fix);
  expect(Location.getCurrentPositionAsync).toHaveBeenCalledWith({ accuracy: Location.Accuracy.High });
  (Location.getForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'denied' });
  await expect(getFreshFix()).resolves.toBe('denied');
});

test('suggestPlace는 로그인 세션으로 Edge Function을 부르고 결과를 그대로 준다', async () => {
  invoke.mockResolvedValue({ data: { status: 'ok', hereAddress: '서울 테스트로 1', candidates: [] }, error: null });
  await expect(suggestPlace(fix)).resolves.toEqual({ status: 'ok', hereAddress: '서울 테스트로 1', candidates: [] });
  expect(invoke).toHaveBeenCalledWith('suggest-place', { body: { lat: 37.5, lng: 126.9, accuracy: 12 } });
});

test('suggestPlace 실패는 unknown', async () => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  invoke.mockResolvedValue({ data: null, error: new Error('network') });
  await expect(suggestPlace(fix)).rejects.toMatchObject({ code: 'unknown' });
});

test('submitCheckin 성공은 결과 그대로', async () => {
  const result = { aidutId: 'a1', name: '카페', footprintCount: 2, grade: 'box', gradeChanged: true, newCellsCleared: 0 };
  rpc.mockResolvedValue({ data: result, error: null });
  await expect(submitCheckin(fix, { kind: 'new', roadAddress: null })).resolves.toEqual(result);
  expect(rpc).toHaveBeenCalledWith('submit_checkin', {
    p_lat: 37.5, p_lng: 126.9, p_accuracy: 12, p_target: { kind: 'new', roadAddress: null },
  });
});

test('서버 거절 → 코드, 쿨다운은 다음 시각까지', async () => {
  rpc.mockResolvedValueOnce({ data: null, error: { message: 'too_far', details: null } });
  await expect(submitCheckin(fix, { kind: 'new', roadAddress: null })).rejects.toMatchObject({ code: 'too_far' });
  rpc.mockResolvedValueOnce({ data: null, error: { message: 'cooldown', details: '2026-09-28T09:05:00Z' } });
  const e = await submitCheckin(fix, { kind: 'new', roadAddress: null }).catch((x) => x);
  expect(e).toBeInstanceOf(CheckinError);
  expect(e).toMatchObject({ code: 'cooldown', nextAt: '2026-09-28T09:05:00Z' });
  jest.spyOn(console, 'error').mockImplementation(() => {});
  rpc.mockResolvedValueOnce({ data: null, error: { message: 'relation does not exist', details: null } });
  await expect(submitCheckin(fix, { kind: 'new', roadAddress: null })).rejects.toMatchObject({ code: 'unknown' });
});

test('후보 → target', () => {
  expect(targetFor({ kind: 'mine', aidutId: 'a1', name: 'x', grade: 'hut', distanceM: 5 })).toEqual({ kind: 'mine', aidutId: 'a1' });
  expect(targetFor({ kind: 'kakao', placeId: 'p1', name: '카페', lat: 37.5, lng: 126.9, roadAddress: '서울 1', distanceM: 20 })).toEqual({
    kind: 'kakao', placeId: 'p1', name: '카페', lat: 37.5, lng: 126.9, roadAddress: '서울 1',
  });
});
```

```ts
// mobile/src/features/checkin/__tests__/copy.test.ts
import { CheckinError } from '../checkinApi';
import { celebrationCopy, messageFor } from '../copy';

const T = { box: 2, hut: 5, tower: 10, palace: 20 };
const r = (over: object) => ({ aidutId: 'a', name: 'x', footprintCount: 3, grade: 'box', gradeChanged: false, newCellsCleared: 0, ...over }) as never;

test('거절 문구', () => {
  expect(messageFor(new CheckinError('too_far'))).toBe('조금만 더 가까이 가면 발자국을 남길 수 있어요.');
  expect(messageFor(new CheckinError('weak_gps'))).toBe('잠깐, 위치를 확인하고 있어요…');
  expect(messageFor(new CheckinError('not_yours'))).toBe('앗, 잠깐 문제가 생겼어요. 다시 해볼까요?');
  expect(messageFor(new Error('boom'))).toBe('앗, 잠깐 문제가 생겼어요. 다시 해볼까요?');
});

test('쿨다운은 현지 시각으로', () => {
  const at = '2026-09-28T09:05:00Z';
  const d = new Date(at);
  expect(messageFor(new CheckinError('cooldown', at))).toBe(
    `여긴 아까 다녀왔어요. ${d.getHours()}시 ${d.getMinutes()}분부터 다시 남길 수 있어요.`,
  );
});

test('쿨다운인데 시각을 모르면 시각 없는 문구', () => {
  expect(messageFor(new CheckinError('cooldown'))).toBe('여긴 아까 다녀왔어요. 조금 뒤에 다시 남겨볼까요?');
  expect(messageFor(new CheckinError('cooldown', 'not-a-date'))).toBe('여긴 아까 다녀왔어요. 조금 뒤에 다시 남겨볼까요?');
});

test('축하 문구: 첫 발자국 / 등급업 4종 / 같은 등급', () => {
  expect(celebrationCopy(r({ footprintCount: 1, grade: 'paw' }), T)).toEqual({ title: '🐾 첫 발자국이 찍혔어요. 여기서부터 시작이에요.', hint: null });
  expect(celebrationCopy(r({ footprintCount: 2, grade: 'box', gradeChanged: true }), T).title).toBe('여기 박스가 생겼어요 📦 마음에 드나 봐요.');
  expect(celebrationCopy(r({ footprintCount: 5, grade: 'hut', gradeChanged: true }), T).title).toBe('작은 집이 됐어요 🛖 자주 오시는군요.');
  expect(celebrationCopy(r({ footprintCount: 10, grade: 'tower', gradeChanged: true }), T).title).toBe('캣타워예요 🗼 여긴 우리 단골이네요.');
  expect(celebrationCopy(r({ footprintCount: 20, grade: 'palace', gradeChanged: true }), T).title).toBe('🏰 캣 팰리스. 여긴 당신의 인생 장소예요.');
  expect(celebrationCopy(r({ footprintCount: 3, grade: 'box' }), T)).toEqual({ title: '🐾 발자국을 남겼어요', hint: '2번 더 오면 작은 집이 돼요' });
  expect(celebrationCopy(r({ footprintCount: 3, grade: 'box' }), null)).toEqual({ title: '🐾 발자국을 남겼어요', hint: null });
});
```

- [ ] **Step 2: 실패 확인**

Run(`mobile/`): `npx jest src/features/checkin`
Expected: FAIL — `Cannot find module '../checkinApi'`.

- [ ] **Step 3: 구현**

```ts
// mobile/src/features/checkin/checkinApi.ts
// The only place the check-in flow talks to the outside world: GPS, suggest-place, submit_checkin.
import * as Location from 'expo-location';
import { supabase } from '@/services/supabase';
import type { Grade } from '@/map/grades';

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
};
export type CheckinErrorCode = 'too_far' | 'weak_gps' | 'cooldown' | 'not_yours' | 'unknown';

export class CheckinError extends Error {
  constructor(
    public code: CheckinErrorCode,
    public nextAt?: string,
  ) {
    super(code);
  }
}

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

export function targetFor(c: Candidate): CheckinTarget {
  if (c.kind === 'mine') return { kind: 'mine', aidutId: c.aidutId };
  return { kind: 'kakao', placeId: c.placeId, name: c.name, lat: c.lat, lng: c.lng, roadAddress: c.roadAddress };
}
```

```ts
// mobile/src/features/checkin/copy.ts
import type { GradeThresholds } from '@/features/map/useMyHideouts';
import { nextStageHint } from '@/features/map/nextStageHint';
import type { Grade } from '@/map/grades';
import { CheckinError, type CheckinResult } from './checkinApi';

export const MSG = {
  locating: '잠깐, 위치를 확인하고 있어요…',
  denied: '위치가 꺼져 있어서 발자국을 남기기 어려워요. 켜두시면 제가 도와드릴게요.',
  unknown: '앗, 잠깐 문제가 생겼어요. 다시 해볼까요?',
};

const GRADE_UP: Record<Exclude<Grade, 'paw'>, string> = {
  box: '여기 박스가 생겼어요 📦 마음에 드나 봐요.',
  hut: '작은 집이 됐어요 🛖 자주 오시는군요.',
  tower: '캣타워예요 🗼 여긴 우리 단골이네요.',
  palace: '🏰 캣 팰리스. 여긴 당신의 인생 장소예요.',
};

export function messageFor(e: unknown): string {
  if (!(e instanceof CheckinError)) return MSG.unknown;
  switch (e.code) {
    case 'too_far':
      return '조금만 더 가까이 가면 발자국을 남길 수 있어요.';
    case 'weak_gps':
      return MSG.locating;
    case 'cooldown': {
      const d = e.nextAt ? new Date(e.nextAt) : null;
      // A missing or unparsable time must not render as "NaN시".
      if (!d || Number.isNaN(d.getTime())) return '여긴 아까 다녀왔어요. 조금 뒤에 다시 남겨볼까요?';
      return `여긴 아까 다녀왔어요. ${d.getHours()}시 ${d.getMinutes()}분부터 다시 남길 수 있어요.`;
    }
    default:
      return MSG.unknown;
  }
}

export function celebrationCopy(r: CheckinResult, t: GradeThresholds | null): { title: string; hint: string | null } {
  if (r.footprintCount === 1) return { title: '🐾 첫 발자국이 찍혔어요. 여기서부터 시작이에요.', hint: null };
  if (r.gradeChanged && r.grade !== 'paw') return { title: GRADE_UP[r.grade], hint: null };
  return { title: '🐾 발자국을 남겼어요', hint: t ? nextStageHint(r.footprintCount, t) : null };
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx jest src/features/checkin` → 10 passed. `npx tsc --noEmit` → 0.

- [ ] **Step 5: 커밋**

```bash
git add mobile/src/features/checkin
git commit -m "feat(mobile): check-in API wrapper and copy (rejections, celebrations)"
```

---

## Task 2: `useCheckin()` 상태 기계

**Files:**
- Create: `mobile/src/features/checkin/useCheckin.ts`
- Test: `mobile/src/features/checkin/__tests__/useCheckin.test.ts`

**Interfaces:**
- Consumes: Task 1 전부.
- Produces:
  - `export type Choosing = { name: 'choosing'; fix: Fix; hereAddress: string | null; candidates: Candidate[]; busy: boolean; error: string | null }`
  - `export type CheckinState = { name: 'idle' } | { name: 'locating' } | Choosing | { name: 'celebrating'; result: CheckinResult } | { name: 'failed'; message: string; needsSettings: boolean }`
  - `export function useCheckin(): { state: CheckinState; start: () => Promise<void>; choose: (target: CheckinTarget) => Promise<void>; close: () => void }`

- [ ] **Step 1: 실패하는 테스트**

```ts
// mobile/src/features/checkin/__tests__/useCheckin.test.ts
import { act, renderHook } from '@testing-library/react-native';
import * as api from '../checkinApi';
import { useCheckin } from '../useCheckin';

jest.mock('../checkinApi', () => {
  const actual = jest.requireActual('../checkinApi');
  return { ...actual, getFreshFix: jest.fn(), suggestPlace: jest.fn(), submitCheckin: jest.fn() };
});

const fix = { lat: 37.5, lng: 126.9, accuracy: 12 };
const cand = { kind: 'kakao' as const, placeId: 'p1', name: '카페', lat: 37.5, lng: 126.9, roadAddress: null, distanceM: 10 };
const ok = { status: 'ok' as const, hereAddress: '서울 1', candidates: [cand] };
const result = { aidutId: 'a1', name: '카페', footprintCount: 1, grade: 'paw' as const, gradeChanged: false, newCellsCleared: 1 };
const getFix = api.getFreshFix as jest.Mock;
const suggest = api.suggestPlace as jest.Mock;
const submit = api.submitCheckin as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  getFix.mockResolvedValue(fix);
  suggest.mockResolvedValue(ok);
  submit.mockResolvedValue(result);
});

test('시작 → 후보 고르기 → 발자국 → 축하', async () => {
  const { result: h } = await renderHook(() => useCheckin());
  await act(async () => h.current.start());
  expect(h.current.state).toEqual({ name: 'choosing', fix, hereAddress: '서울 1', candidates: [cand], busy: false, error: null });
  await act(async () => h.current.choose({ kind: 'new', roadAddress: '서울 1' }));
  expect(submit).toHaveBeenCalledWith(fix, { kind: 'new', roadAddress: '서울 1' });
  expect(h.current.state).toEqual({ name: 'celebrating', result });
  await act(async () => h.current.close());
  expect(h.current.state).toEqual({ name: 'idle' });
});

test('GPS 약함은 자동으로 한 번 더, 그래도 약하면 안내', async () => {
  suggest.mockResolvedValue({ status: 'weak_gps' });
  const { result: h } = await renderHook(() => useCheckin());
  await act(async () => h.current.start());
  expect(getFix).toHaveBeenCalledTimes(2);
  expect(h.current.state).toEqual({ name: 'failed', message: '잠깐, 위치를 확인하고 있어요…', needsSettings: false });
});

test('GPS 약함 뒤 두 번째에 잡히면 그대로 진행', async () => {
  suggest.mockResolvedValueOnce({ status: 'weak_gps' }).mockResolvedValueOnce(ok);
  const { result: h } = await renderHook(() => useCheckin());
  await act(async () => h.current.start());
  expect(h.current.state.name).toBe('choosing');
});

test('위치 권한 없음 → 설정 안내', async () => {
  getFix.mockResolvedValue('denied');
  const { result: h } = await renderHook(() => useCheckin());
  await act(async () => h.current.start());
  expect(h.current.state).toEqual({
    name: 'failed',
    message: '위치가 꺼져 있어서 발자국을 남기기 어려워요. 켜두시면 제가 도와드릴게요.',
    needsSettings: true,
  });
  expect(suggest).not.toHaveBeenCalled();
});

test('후보 조회 실패 → 멈추지 않고 다시 시도할 수 있는 안내', async () => {
  suggest.mockRejectedValue(new api.CheckinError('unknown'));
  const { result: h } = await renderHook(() => useCheckin());
  await act(async () => h.current.start());
  expect(h.current.state).toEqual({ name: 'failed', message: '앗, 잠깐 문제가 생겼어요. 다시 해볼까요?', needsSettings: false });
  suggest.mockResolvedValue(ok);
  await act(async () => h.current.start());
  expect(h.current.state.name).toBe('choosing');
});

test('기록 거절 → 시트는 열린 채 안내(다른 후보 고르기 가능)', async () => {
  submit.mockRejectedValue(new api.CheckinError('too_far'));
  const { result: h } = await renderHook(() => useCheckin());
  await act(async () => h.current.start());
  await act(async () => h.current.choose({ kind: 'mine', aidutId: 'a1' }));
  expect(h.current.state).toMatchObject({ name: 'choosing', busy: false, error: '조금만 더 가까이 가면 발자국을 남길 수 있어요.' });
});

test('진행 중 두 번째 요청 무시(연타)', async () => {
  let release: (v: typeof result) => void = () => {};
  submit.mockReturnValue(new Promise((r) => (release = r)));
  const { result: h } = await renderHook(() => useCheckin());
  await act(async () => h.current.start());
  await act(async () => {
    void h.current.choose({ kind: 'new', roadAddress: null });
    void h.current.choose({ kind: 'new', roadAddress: null });
  });
  expect(h.current.state).toMatchObject({ name: 'choosing', busy: true });
  await act(async () => release(result));
  expect(submit).toHaveBeenCalledTimes(1);
  expect(h.current.state.name).toBe('celebrating');

  getFix.mockClear();
  await act(async () => h.current.close());
  await act(async () => {
    void h.current.start();
    void h.current.start();
  });
  expect(getFix).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx jest src/features/checkin/__tests__/useCheckin.test.ts` → FAIL (모듈 없음).

- [ ] **Step 3: 구현**

```ts
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
```

- [ ] **Step 4: 통과 확인**

Run: `npx jest src/features/checkin` → 17 passed. `npx tsc --noEmit` → 0.

- [ ] **Step 5: 커밋**

```bash
git add mobile/src/features/checkin/useCheckin.ts mobile/src/features/checkin/__tests__/useCheckin.test.ts
git commit -m "feat(mobile): useCheckin state machine (locate, choose, submit, celebrate)"
```

---

## Task 3: `CheckinSheet` + `Celebration`

**Files:**
- Create: `mobile/src/features/checkin/CheckinSheet.tsx`
- Create: `mobile/src/features/checkin/Celebration.tsx`
- Modify: `mobile/package.json`, `mobile/package-lock.json` (`expo-haptics`)
- Test: `mobile/src/features/checkin/__tests__/CheckinSheet.test.tsx`, `mobile/src/features/checkin/__tests__/Celebration.test.tsx`

**Interfaces:**
- Consumes: `Choosing`(Task 2), `CheckinTarget`·`CheckinResult`·`targetFor`(Task 1), `celebrationCopy`(Task 1), `markerFor`·`GRADE_LABEL`, `GradeThresholds`.
- Produces:
  - `export function CheckinSheet(props: { state: Choosing; footprintsById: Record<string, number>; onChoose: (t: CheckinTarget) => void; onClose: () => void }): JSX.Element`
  - `export function Celebration(props: { result: CheckinResult; thresholds: GradeThresholds | null; onClose: () => void }): JSX.Element`

**구현 전 확인:** `https://docs.expo.dev/versions/v57.0.0/sdk/haptics/` — `notificationAsync(NotificationFeedbackType.Success)`.

- [ ] **Step 1: 의존성**

Run(`mobile/`): `npx expo install expo-haptics`

- [ ] **Step 2: 실패하는 테스트**

```tsx
// mobile/src/features/checkin/__tests__/CheckinSheet.test.tsx
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { Choosing } from '../useCheckin';
import { CheckinSheet } from '../CheckinSheet';

const mine = { kind: 'mine' as const, aidutId: 'a1', name: '단골 카페', grade: 'box' as const, distanceM: 12 };
const kakao = { kind: 'kakao' as const, placeId: 'p1', name: '공원', lat: 37.5, lng: 126.9, roadAddress: '서울 2', distanceM: 43.6 };
const state = (over: Partial<Choosing> = {}): Choosing => ({
  name: 'choosing', fix: { lat: 37.5, lng: 126.9, accuracy: 10 }, hereAddress: '서울 테스트로 1',
  candidates: [mine, kakao], busy: false, error: null, ...over,
});
const props = { footprintsById: { a1: 3 }, onChoose: jest.fn(), onClose: jest.fn() };

beforeEach(() => jest.clearAllMocks());

test('첫 후보를 물어보고, 맞으면 그 장소로', async () => {
  await render(<CheckinSheet {...props} state={state()} />);
  expect(screen.getByText('여기 단골 카페 맞나요?')).toBeTruthy();
  expect(screen.getByText('지금까지 3번 다녀왔어요')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: '발자국 남기기' }));
  expect(props.onChoose).toHaveBeenCalledWith({ kind: 'mine', aidutId: 'a1' });
});

test('다른 곳이에요 → 목록(거리) → 카카오 장소 선택', async () => {
  await render(<CheckinSheet {...props} state={state()} />);
  await fireEvent.press(screen.getByRole('button', { name: '다른 곳이에요' }));
  expect(screen.getByText('약 44m')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: '공원' }));
  expect(props.onChoose).toHaveBeenCalledWith({ kind: 'kakao', placeId: 'p1', name: '공원', lat: 37.5, lng: 126.9, roadAddress: '서울 2' });
});

test('여기에 새로 만들기 → 현재 주소로', async () => {
  await render(<CheckinSheet {...props} state={state()} />);
  await fireEvent.press(screen.getByRole('button', { name: '다른 곳이에요' }));
  await fireEvent.press(screen.getByRole('button', { name: '여기에 새로 만들기' }));
  expect(props.onChoose).toHaveBeenCalledWith({ kind: 'new', roadAddress: '서울 테스트로 1' });
});

test('후보가 없으면 바로 목록(새로 만들기만)', async () => {
  await render(<CheckinSheet {...props} state={state({ candidates: [], hereAddress: null })} />);
  expect(screen.queryByText(/맞나요\?/)).toBeNull();
  expect(screen.getByText('이름 없는 골목')).toBeTruthy();
});

test('거절 안내는 시트 안에', async () => {
  await render(<CheckinSheet {...props} state={state({ error: '조금만 더 가까이 가면 발자국을 남길 수 있어요.' })} />);
  expect(screen.getByText('조금만 더 가까이 가면 발자국을 남길 수 있어요.')).toBeTruthy();
});

test('저장 중엔 닫히지 않는다', async () => {
  await render(<CheckinSheet {...props} state={state({ busy: true })} />);
  await fireEvent.press(screen.getByRole('button', { name: '닫기' }));
  expect(props.onClose).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: '발자국 남기기', disabled: true })).toBeTruthy();
});
```

```tsx
// mobile/src/features/checkin/__tests__/Celebration.test.tsx
import { fireEvent, render, screen } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';
import { useReducedMotion } from 'react-native-reanimated';
import { Celebration } from '../Celebration';

jest.mock('expo-haptics', () => ({ notificationAsync: jest.fn(), NotificationFeedbackType: { Success: 'success' } }));
jest.mock('react-native-reanimated', () => ({ ...jest.requireActual('react-native-reanimated/mock'), useReducedMotion: jest.fn(() => false) }));

const T = { box: 2, hut: 5, tower: 10, palace: 20 };
const up = { aidutId: 'a', name: '카페', footprintCount: 5, grade: 'hut' as const, gradeChanged: true, newCellsCleared: 0 };

beforeEach(() => jest.clearAllMocks());

test('등급업 문구·햅틱·닫기', async () => {
  const onClose = jest.fn();
  await render(<Celebration result={up} thresholds={T} onClose={onClose} />);
  expect(screen.getByText('작은 집이 됐어요 🛖 자주 오시는군요.')).toBeTruthy();
  expect(screen.getByText('카페')).toBeTruthy();
  expect(Haptics.notificationAsync).toHaveBeenCalledWith('success');
  await fireEvent.press(screen.getByRole('button', { name: '좋아요' }));
  expect(onClose).toHaveBeenCalled();
});

test('같은 등급은 다음 단계 힌트까지', async () => {
  await render(<Celebration result={{ ...up, footprintCount: 6, gradeChanged: false }} thresholds={T} onClose={jest.fn()} />);
  expect(screen.getByText('🐾 발자국을 남겼어요')).toBeTruthy();
  expect(screen.getByText('4번 더 오면 캣타워가 돼요')).toBeTruthy();
});

test('모션 줄이기면 애니메이션 없이도 같은 내용', async () => {
  (useReducedMotion as jest.Mock).mockReturnValue(true);
  await render(<Celebration result={up} thresholds={T} onClose={jest.fn()} />);
  expect(screen.getByText('작은 집이 됐어요 🛖 자주 오시는군요.')).toBeTruthy();
});
```

- [ ] **Step 3: 실패 확인**

Run: `npx jest src/features/checkin/__tests__/CheckinSheet.test.tsx src/features/checkin/__tests__/Celebration.test.tsx` → FAIL(모듈 없음).

- [ ] **Step 4: `CheckinSheet.tsx`**

```tsx
// mobile/src/features/checkin/CheckinSheet.tsx
import { useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { color, font, radius, space, type } from '@/constants/tokens';
import { markerFor } from '@/map/markers';
import { type CheckinTarget, targetFor } from './checkinApi';
import type { Choosing } from './useCheckin';

type Props = {
  state: Choosing;
  footprintsById: Record<string, number>;
  onChoose: (t: CheckinTarget) => void;
  onClose: () => void;
};

function Row({ title, sub, onPress, disabled }: { title: string; sub: string; onPress: () => void; disabled: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled }}
      style={styles.row}>
      <Text style={styles.rowTitle}>{title}</Text>
      <Text style={styles.caption}>{sub}</Text>
    </Pressable>
  );
}

export function CheckinSheet({ state, footprintsById, onChoose, onClose }: Props) {
  const first = state.candidates[0];
  const [view, setView] = useState<'confirm' | 'list'>(first ? 'confirm' : 'list');
  // While a footprint is being saved the sheet can't be dismissed — otherwise the
  // celebration would pop up after the user thought they'd cancelled.
  const close = () => {
    if (!state.busy) onClose();
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close} accessibilityRole="button" accessibilityLabel="닫기" />
      <SafeAreaView edges={['bottom']} style={styles.sheet}>
        {view === 'confirm' && first ? (
          <View style={styles.confirm}>
            {first.kind === 'mine' && <Image source={{ uri: markerFor(first.grade).uri }} style={styles.art} />}
            <Text style={styles.title} accessibilityRole="header">
              여기 {first.name} 맞나요?
            </Text>
            {first.kind === 'mine' && footprintsById[first.aidutId] !== undefined && (
              <Text style={styles.caption}>지금까지 {footprintsById[first.aidutId]}번 다녀왔어요</Text>
            )}
            <Pressable
              onPress={() => onChoose(targetFor(first))}
              disabled={state.busy}
              accessibilityRole="button"
              accessibilityLabel="발자국 남기기"
              accessibilityState={{ disabled: state.busy, busy: state.busy }}
              style={[styles.cta, state.busy && styles.ctaBusy]}>
              {state.busy ? <ActivityIndicator color={color.onPrimary} /> : <Text style={styles.ctaText}>발자국 남기기</Text>}
            </Pressable>
            <Pressable
              onPress={() => setView('list')}
              disabled={state.busy}
              accessibilityRole="button"
              accessibilityLabel="다른 곳이에요"
              style={styles.secondary}>
              <Text style={styles.secondaryText}>다른 곳이에요</Text>
            </Pressable>
          </View>
        ) : (
          <ScrollView style={styles.list}>
            {state.candidates.map((c) => (
              <Row
                key={c.kind === 'mine' ? c.aidutId : c.placeId}
                title={c.name}
                sub={`약 ${Math.round(c.distanceM)}m`}
                disabled={state.busy}
                onPress={() => onChoose(targetFor(c))}
              />
            ))}
            <Row
              title="여기에 새로 만들기"
              sub={state.hereAddress ?? '이름 없는 골목'}
              disabled={state.busy}
              onPress={() => onChoose({ kind: 'new', roadAddress: state.hereAddress })}
            />
          </ScrollView>
        )}
        <Text style={styles.error} accessibilityLiveRegion="polite">
          {state.error ?? ' '}
        </Text>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(74, 61, 48, 0.25)' }, // color.ink @ 25%
  sheet: {
    backgroundColor: color.surfaceCard,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    paddingHorizontal: space.gutter,
    paddingTop: space.section,
  },
  confirm: { alignItems: 'center', gap: 8 },
  art: { width: 72, height: 72 },
  title: { ...type.title, color: color.ink, textAlign: 'center' },
  list: { maxHeight: 360 },
  row: { minHeight: space.tapMin, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: color.line },
  rowTitle: { ...type.body, color: color.ink },
  caption: { ...type.caption, color: color.inkSub },
  cta: {
    alignSelf: 'stretch',
    marginTop: 12,
    height: 52,
    borderRadius: radius.btn,
    backgroundColor: color.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaBusy: { opacity: 0.7 },
  ctaText: { fontFamily: font.semibold, fontSize: 16, color: color.onPrimary },
  secondary: { minHeight: space.tapMin, justifyContent: 'center' },
  secondaryText: { ...type.body, color: color.inkSub, textDecorationLine: 'underline' },
  error: { ...type.caption, color: color.ink, marginTop: 12, marginBottom: 8, minHeight: 18, textAlign: 'center' },
});
```

- [ ] **Step 5: `Celebration.tsx`**

```tsx
// mobile/src/features/checkin/Celebration.tsx
// The loop's peak moment (DESIGN.md §3): the new stage springs in with soft particles and a haptic.
import { useEffect } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import Animated, {
  Easing,
  interpolate,
  type SharedValue,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { color, font, radius, space, type } from '@/constants/tokens';
import type { GradeThresholds } from '@/features/map/useMyHideouts';
import { markerFor } from '@/map/markers';
import type { CheckinResult } from './checkinApi';
import { celebrationCopy } from './copy';

const PARTICLES = 8;

function Particle({ index, progress }: { index: number; progress: SharedValue<number> }) {
  const angle = (index / PARTICLES) * Math.PI * 2;
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.3, 1], [0, 1, 0]),
    transform: [
      { translateX: Math.cos(angle) * 90 * progress.value },
      { translateY: Math.sin(angle) * 90 * progress.value },
    ],
  }));
  return <Animated.View style={[styles.particle, style]} />;
}

export function Celebration({ result, thresholds, onClose }: { result: CheckinResult; thresholds: GradeThresholds | null; onClose: () => void }) {
  const reduceMotion = useReducedMotion();
  const pop = useSharedValue(reduceMotion ? 1 : 0);
  const burst = useSharedValue(reduceMotion ? 1 : 0);
  const { title, hint } = celebrationCopy(result, thresholds);

  useEffect(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    if (reduceMotion) return;
    pop.value = withSpring(1, { damping: 8, stiffness: 160 });
    burst.value = withTiming(1, { duration: 600, easing: Easing.out(Easing.cubic) });
  }, [reduceMotion, pop, burst]);

  const popStyle = useAnimatedStyle(() => ({
    opacity: Math.min(pop.value * 2, 1),
    transform: [{ scale: interpolate(pop.value, [0, 1], [0.4, 1]) }],
  }));

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.scrim}>
        <View style={styles.card}>
          <View style={styles.stage}>
            {!reduceMotion && Array.from({ length: PARTICLES }, (_, i) => <Particle key={i} index={i} progress={burst} />)}
            <Animated.Image source={{ uri: markerFor(result.grade).uri }} style={[styles.art, popStyle]} />
          </View>
          <Text style={styles.name}>{result.name}</Text>
          <Text style={styles.title} accessibilityRole="header">
            {title}
          </Text>
          {hint && <Text style={styles.hint}>{hint}</Text>}
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="좋아요" style={styles.cta}>
            <Text style={styles.ctaText}>좋아요</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(74, 61, 48, 0.35)', alignItems: 'center', justifyContent: 'center', padding: space.gutter }, // color.ink @ 35%
  card: { alignSelf: 'stretch', backgroundColor: color.surface, borderRadius: radius.sheet, padding: space.section, alignItems: 'center', gap: 8 },
  stage: { width: 200, height: 200, alignItems: 'center', justifyContent: 'center' },
  art: { width: 140, height: 140 },
  particle: { position: 'absolute', width: 10, height: 10, borderRadius: 5, backgroundColor: color.primary },
  name: { ...type.caption, color: color.inkSub },
  title: { ...type.subtitle, color: color.ink, textAlign: 'center' },
  hint: { ...type.body, color: color.inkSub, textAlign: 'center' },
  cta: {
    alignSelf: 'stretch',
    marginTop: 12,
    height: 52,
    borderRadius: radius.btn,
    backgroundColor: color.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: { fontFamily: font.semibold, fontSize: 16, color: color.onPrimary },
});
```

(reanimated jest mock에 `Animated.Image`·`Easing`이 없으면 테스트 파일의 mock에 추가하고 Ruling.)

- [ ] **Step 6: 통과 확인**

Run: `npx jest src/features/checkin` → 26 passed(9 신규). `npx tsc --noEmit` → 0. `npx expo lint` → 오류 0.

- [ ] **Step 7: 커밋**

```bash
git add mobile/package.json mobile/package-lock.json mobile/src/features/checkin/CheckinSheet.tsx mobile/src/features/checkin/Celebration.tsx mobile/src/features/checkin/__tests__/CheckinSheet.test.tsx mobile/src/features/checkin/__tests__/Celebration.test.tsx
git commit -m "feat(mobile): check-in sheet (confirm/list) and growth celebration"
```

---

## Task 4: 지도 화면에 연결

**Files:**
- Modify: `mobile/src/app/(tabs)/index.tsx`
- Modify: `mobile/src/app/(tabs)/__tests__/map.test.tsx`

**Interfaces:**
- Consumes: `useCheckin`(Task 2), `CheckinSheet`·`Celebration`(Task 3), `useMyHideouts().retry`·`thresholds`·`hideouts`(②).

- [ ] **Step 1: 실패하는 테스트** — `map.test.tsx`에 추가. 파일 상단 mock 목록에:

```tsx
let mockSheetProps: Record<string, any> = {};
let mockCelebrationProps: Record<string, any> = {};
jest.mock('@/features/checkin/useCheckin', () => ({ useCheckin: jest.fn() }));
jest.mock('@/features/checkin/CheckinSheet', () => {
  const { View } = require('react-native');
  return { CheckinSheet: function MockSheet(props: any) { mockSheetProps = props; return <View testID="checkin-sheet" />; } };
});
jest.mock('@/features/checkin/Celebration', () => {
  const { View } = require('react-native');
  return { Celebration: function MockCelebration(props: any) { mockCelebrationProps = props; return <View testID="celebration" />; } };
});
```

import에 `import { useCheckin } from '@/features/checkin/useCheckin';`, 그리고 `beforeEach` 안에 기본값:

```tsx
  (useCheckin as jest.Mock).mockReturnValue({ state: { name: 'idle' }, start: jest.fn(), choose: jest.fn(), close: jest.fn() });
```

파일 끝에 테스트:

```tsx
const checkin = (state: object, over = {}) => {
  const api = { state, start: jest.fn(), choose: jest.fn(), close: jest.fn(), ...over };
  (useCheckin as jest.Mock).mockReturnValue(api);
  return api;
};

test('발자국 남기기 → 체크인 시작', async () => {
  const api = checkin({ name: 'idle' });
  await render(<MapScreen />);
  await fireEvent.press(screen.getByRole('button', { name: '발자국 남기기' }));
  expect(api.start).toHaveBeenCalled();
});

test('위치 확인 중엔 안내가 뜨고 버튼이 비활성', async () => {
  checkin({ name: 'locating' });
  await render(<MapScreen />);
  expect(screen.getByText('잠깐, 위치를 확인하고 있어요…')).toBeTruthy();
  expect(screen.getByRole('button', { name: '발자국 남기기', disabled: true })).toBeTruthy();
});

test('후보 고르기 → 시트(발자국 수 전달)', async () => {
  checkin({ name: 'choosing', fix: { lat: 1, lng: 2, accuracy: 3 }, hereAddress: null, candidates: [], busy: false, error: null });
  await render(<MapScreen />);
  expect(screen.getByTestId('checkin-sheet')).toBeTruthy();
  expect(mockSheetProps.footprintsById).toEqual({ a1: 3 });
});

test('축하 닫기 → 새로고침(마커가 자란 모습으로)', async () => {
  const retry = jest.fn();
  (useMyHideouts as jest.Mock).mockReturnValue(hideoutsState({ retry }));
  const result = { aidutId: 'a1', name: '테스트 카페', footprintCount: 5, grade: 'hut', gradeChanged: true, newCellsCleared: 0 };
  const api = checkin({ name: 'celebrating', result });
  await render(<MapScreen />);
  expect(mockCelebrationProps.result).toEqual(result);
  expect(mockCelebrationProps.thresholds).toEqual(T);
  await act(async () => mockCelebrationProps.onClose());
  expect(api.close).toHaveBeenCalled();
  expect(retry).toHaveBeenCalled();
});

test('실패 안내 + 다시 시도, 권한 문제면 설정 열기', async () => {
  const api = checkin({ name: 'failed', message: '위치가 꺼져 있어서 발자국을 남기기 어려워요. 켜두시면 제가 도와드릴게요.', needsSettings: true });
  const open = jest.spyOn(Linking, 'openSettings').mockResolvedValue();
  await render(<MapScreen />);
  expect(screen.getByText('위치가 꺼져 있어서 발자국을 남기기 어려워요. 켜두시면 제가 도와드릴게요.')).toBeTruthy();
  await fireEvent.press(screen.getAllByRole('button', { name: '설정 열기' }).at(-1)!);
  expect(open).toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: '다시 해볼게요' }));
  expect(api.start).toHaveBeenCalled();
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx jest "src/app/\(tabs\)/__tests__/map.test.tsx"` → 새 5개 FAIL.

- [ ] **Step 3: 구현** — `(tabs)/index.tsx`에서:

(a) import 추가:

```tsx
import { Celebration } from '@/features/checkin/Celebration';
import { CheckinSheet } from '@/features/checkin/CheckinSheet';
import { useCheckin } from '@/features/checkin/useCheckin';
```

(b) `MapScreen` 안, 훅들 아래:

```tsx
  const checkin = useCheckin();
  const footprintsById = useMemo(() => Object.fromEntries(hideouts.map((h) => [h.id, h.footprintCount])), [hideouts]);
  const locating = checkin.state.name === 'locating';
```

(c) `return` 안, 카드(`{selected && …}`) **앞**에:

```tsx
      {(locating || checkin.state.name === 'failed') && (
        <View style={styles.checkinNote}>
          <Text style={styles.bannerText}>
            {checkin.state.name === 'failed' ? checkin.state.message : '잠깐, 위치를 확인하고 있어요…'}
          </Text>
          {checkin.state.name === 'failed' && (
            <View style={styles.row}>
              <Pill label="다시 해볼게요" onPress={checkin.start} />
              {checkin.state.needsSettings && <Pill label="설정 열기" onPress={() => Linking.openSettings()} />}
              <Pill label="닫기" onPress={checkin.close} />
            </View>
          )}
        </View>
      )}

      <View style={styles.stampWrap} pointerEvents="box-none">
        <Pressable
          onPress={checkin.start}
          disabled={locating}
          accessibilityRole="button"
          accessibilityLabel="발자국 남기기"
          accessibilityState={{ disabled: locating }}
          style={[styles.stamp, locating && styles.stampBusy]}>
          <Text style={styles.stampText}>발자국 남기기</Text>
        </Pressable>
      </View>
```

(d) `return`의 맨 끝(`</View>` 닫기 직전)에:

```tsx
      {checkin.state.name === 'choosing' && (
        <CheckinSheet state={checkin.state} footprintsById={footprintsById} onChoose={checkin.choose} onClose={checkin.close} />
      )}
      {checkin.state.name === 'celebrating' && (
        <Celebration
          result={checkin.state.result}
          thresholds={thresholds}
          onClose={() => {
            checkin.close();
            retry(); // the marker should show the grown hideout
          }}
        />
      )}
```

(e) `styles`에 추가하고 `card`의 `bottom`을 `24` → `96`으로(버튼 위로):

```tsx
  checkinNote: {
    position: 'absolute',
    left: space.gutter,
    right: space.gutter,
    bottom: 96,
    backgroundColor: color.surfaceCard,
    borderRadius: radius.card,
    padding: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: color.line,
  },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  stampWrap: { position: 'absolute', left: 0, right: 0, bottom: 24, alignItems: 'center' },
  stamp: {
    minHeight: 52,
    paddingHorizontal: 28,
    borderRadius: radius.pill,
    backgroundColor: color.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stampBusy: { opacity: 0.6 },
  stampText: { fontFamily: font.semibold, fontSize: 16, color: color.onPrimary },
```

(재시도 버튼 문구를 "다시 시도"가 아니라 "다시 해볼게요"로 둔 이유: 같은 화면의 아지트 조회 실패 배너 버튼 "다시 시도"와 구분 — 둘이 동시에 떠도 스크린리더·테스트가 헷갈리지 않게.)

- [ ] **Step 4: 통과 확인**

Run(`mobile/`): `npx jest --ci` → 전부 통과. `npx tsc --noEmit` → 0. `npx expo lint` → 오류 0.
Run: `$env:EXPO_PUBLIC_KAKAO_NATIVE_APP_KEY='x'; npx expo export --platform android --output-dir $env:TEMP\checkin-export-check` → `Exported`, 폴더 삭제.

- [ ] **Step 5: 커밋**

```bash
git add "mobile/src/app/(tabs)/index.tsx" "mobile/src/app/(tabs)/__tests__/map.test.tsx"
git commit -m "feat(mobile): 발자국 남기기 on the map — sheet, celebration, refresh"
```

---

## 마지막 — 사람이 할 것 (자동화 불가)

1. `expo-haptics`가 새 네이티브 모듈 → dev build 다시(`npx expo run:android`).
2. 로컬 스택(`npx supabase start`) + `npx supabase functions serve --env-file supabase/functions/.env.local` 실행, 폰의 `EXPO_PUBLIC_SUPABASE_URL`은 PC 내부 IP.
3. 실제로 장소에 가서: 발자국 남기기 → "여기 ○○ 맞나요?" → 축하 → 지도 마커. 같은 곳 바로 다시 → 쿨다운 안내. 150m 밖 후보 → 가까이 오라는 안내.
