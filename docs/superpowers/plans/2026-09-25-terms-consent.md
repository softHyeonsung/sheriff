# 약관 동의 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 신규 가입자는 필수 약관 4개에 동의하기 전엔 계정이 생기지 않고, 동의는 서버가 버전까지 재검증·기록한다.

**Architecture:** `kakao-custom-token` Edge Function이 카카오 토큰 검증 직후 `public.users.kakao_id`로 동의 여부를 조회해, 필요하면 아무것도 만들지 않고 `412 terms_required`(+현재 버전)를 돌려준다. 앱은 카카오 토큰을 쥔 채 약관 바텀시트를 띄우고, 동의하면 같은 토큰 + 서버가 준 버전으로 재요청한다. 서버는 버전이 맞을 때만 계정을 만들고 `terms_agreed_at`/`terms_version`을 기록한다.

**Tech Stack:** Supabase Postgres 마이그레이션 + pgTAP, Deno Edge Function, Expo SDK 57 / React Native, `expo-web-browser`(설치됨), Jest + `@testing-library/react-native` v14(**`render`/`fireEvent`는 async — 반드시 `await`**).

**Spec:** `docs/superpowers/specs/2026-09-25-terms-consent-design.md`

## Global Constraints

- 작업 위치: 워크트리 `C:\Users\user\sheriff\.claude\worktrees\auth-kakao-login`, 브랜치 `worktree-auth-kakao-login`.
- 현재 약관 버전의 유일한 출처는 Edge Function 상수 `TERMS_VERSION = '2026-09-25'`. 앱에 버전을 하드코딩하지 않는다.
- 동의 필수 4개(전부 필수): "만 14세 이상이에요", "[필수] 이용약관", "[필수] 개인정보 수집·이용", "[필수] 위치기반서비스 이용약관".
- 계약: `POST { kakaoAccessToken: string, agreedTermsVersion?: string }` → `200 { access_token, refresh_token }` | `412 { error: 'terms_required', termsVersion }` | `500 { error }`.
- 새 컬럼(`kakao_id`, `terms_version`, 기존 `terms_agreed_at`)은 service role만 쓴다. `authenticated`의 update 권한은 `home_address`만(기존 유지).
- 화면 코드에 raw hex 금지 — `mobile/src/constants/tokens.ts`의 `color`/`type`/`radius`/`space`/`font`만.
- 카피는 해요체(`docs/기획-카피톤-v1.md`). 오류 문구는 정확히 "앗, 잠깐 문제가 생겼다냥. 다시 해볼까냥?".
- 화면에서 `supabase.auth` 직접 호출 금지 — `features/auth/kakaoLogin.ts`를 거친다.
- Deno 실행: `npx -y deno test --node-modules-dir=none --allow-net --allow-env <file>` (PowerShell에서. Git Bash의 npx는 이 머신에서 WSL 오류가 남).
- Expo 패키지 추가는 `npx expo install`만. 이 플랜은 새 의존성이 없다.

## Review Focus

1. **동의 후 재요청이 네트워크 오류로 실패** — 시트가 열린 채 체크가 유지되고 오류 문구가 시트 안에 보이며, 다시 누르면 같은 토큰으로 재시도된다. → Task 4 테스트 "재요청 실패".
2. **이미 동의한 사용자가 (옛/엉뚱한) `agreedTermsVersion`을 보냄** — 세션은 나오고 `terms_agreed_at`은 덮어쓰지 않는다. → Task 1 `termsDecision` 테스트 "이미 동의".
3. **사용자가 SQL/REST로 자기 `terms_agreed_at`/`terms_version`/`kakao_id`를 직접 쓰려 함** — 권한 오류. → Task 1 pgTAP.
4. **시트를 닫고 다시 카카오 버튼** — 이전 토큰·체크·오류가 남지 않고 새로 시작한다. → Task 3 "닫으면 초기화", Task 4 "닫기".
5. **동의 버튼 연타** — 요청은 한 번만(처리 중 비활성). → Task 3 "처리 중 비활성".
6. **동의를 마친 뒤 같은 기기에서 다른 신규 사용자가 로그인** — 체크가 비어 있어야 한다(미리 체크된 동의는 동의가 아님). → Task 4 "다음 신규 로그인에서는 체크가 비어 있다".

---

## Task 1: DB 컬럼 + Edge Function 약관 재검증

**Files:**
- Create: `supabase/migrations/20260925000001_users_terms.sql`
- Create: `supabase/tests/database/terms.test.sql`
- Modify: `supabase/functions/kakao-custom-token/index.ts`
- Test: `supabase/functions/kakao-custom-token/index.test.ts`

**Interfaces:**
- Consumes: 기존 `verifyKakaoAccessToken(accessToken, appId, fetchImpl?) → Promise<number>`, `assertKakaoOwner`, `upsertSupabaseUser`.
- Produces: HTTP 계약(Global Constraints). `export const TERMS_VERSION`, `export function termsDecision(row: { terms_agreed_at: string | null } | null, agreedVersion: string | undefined, currentVersion: string): 'ok' | 'record' | 'required'`.

- [ ] **Step 1: 실패하는 Deno 테스트 추가** — `index.test.ts` 맨 위 import에 `termsDecision`을 추가하고 파일 끝에 붙인다:

```ts
import { assertKakaoOwner, termsDecision, verifyKakaoAccessToken } from './index.ts';

Deno.test('termsDecision: 처음 온 사용자가 동의 없이 오면 required', () => {
  assertEquals(termsDecision(null, undefined, '2026-09-25'), 'required');
});

Deno.test('termsDecision: 처음 온 사용자가 현재 버전으로 동의하면 record', () => {
  assertEquals(termsDecision(null, '2026-09-25', '2026-09-25'), 'record');
});

Deno.test('termsDecision: 옛 버전/엉뚱한 값으로 동의하면 required', () => {
  assertEquals(termsDecision(null, '2020-01-01', '2026-09-25'), 'required');
  assertEquals(termsDecision({ terms_agreed_at: null }, '', '2026-09-25'), 'required');
});

Deno.test('termsDecision: 행은 있는데 미동의(마이그레이션 전 계정)면 동의가 필요하다', () => {
  assertEquals(termsDecision({ terms_agreed_at: null }, undefined, '2026-09-25'), 'required');
  assertEquals(termsDecision({ terms_agreed_at: null }, '2026-09-25', '2026-09-25'), 'record');
});

Deno.test('termsDecision: 이미 동의한 사용자는 무엇을 보내든 ok (기록을 덮어쓰지 않음)', () => {
  const agreed = { terms_agreed_at: '2026-09-25T00:00:00Z' };
  assertEquals(termsDecision(agreed, undefined, '2026-09-25'), 'ok');
  assertEquals(termsDecision(agreed, '2020-01-01', '2026-09-25'), 'ok');
  assertEquals(termsDecision(agreed, '2026-09-25', '2026-09-25'), 'ok');
});
```

- [ ] **Step 2: 실패 확인**

Run (PowerShell, 워크트리 루트): `npx -y deno test --node-modules-dir=none --allow-net --allow-env supabase/functions/kakao-custom-token/index.test.ts`
Expected: FAIL — `termsDecision`이 export되지 않음.

- [ ] **Step 3: 마이그레이션 작성**

```sql
-- supabase/migrations/20260925000001_users_terms.sql
-- kakao_id: 계정을 만들기 전에 약관 동의 여부를 조회하는 직접 키(합성 이메일 대신).
-- terms_version: 동의한 약관 버전 — 약관 개정 시 재동의 대상 판별용.
-- 쓰기는 service role(kakao-custom-token)만. authenticated의 update는 기존대로 home_address만.
alter table public.users
  add column kakao_id bigint unique,
  add column terms_version text;
```

- [ ] **Step 4: pgTAP 테스트 작성**

```sql
-- supabase/tests/database/terms.test.sql
begin;
select plan(4);

select has_column('public', 'users', 'kakao_id', 'users.kakao_id가 있다');
select has_column('public', 'users', 'terms_version', 'users.terms_version이 있다');

insert into auth.users (id) values ('44444444-4444-4444-4444-444444444444');
insert into public.users (uid, provider) values ('44444444-4444-4444-4444-444444444444', 'kakao');

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '44444444-4444-4444-4444-444444444444', 'role', 'authenticated')::text,
  true
);

select throws_ok(
  $$update public.users set terms_agreed_at = now(), terms_version = '2026-09-25'
    where uid = '44444444-4444-4444-4444-444444444444'$$,
  '42501',
  null,
  '사용자는 자기 약관 동의 기록을 직접 쓸 수 없다'
);

select throws_ok(
  $$update public.users set kakao_id = 1 where uid = '44444444-4444-4444-4444-444444444444'$$,
  '42501',
  null,
  '사용자는 자기 kakao_id를 직접 바꿀 수 없다'
);

select * from finish();
rollback;
```

- [ ] **Step 5: 로컬 DB에 적용 + pgTAP 실행**

Run (PowerShell, 워크트리 루트, Docker 실행 중): `npx supabase migration up` 후 `npx supabase test db`
Expected: 기존 `rls.test.sql` + `terms.test.sql` 모두 ok. (로컬 스택이 꺼져 있으면 먼저 `npx supabase start`.)

- [ ] **Step 6: Edge Function 구현** — `index.ts`에서:

(a) 환경변수 선언 아래에 추가:

```ts
// Single source of truth for the current terms version. The app never hardcodes it:
// it echoes back whatever the 412 response said.
export const TERMS_VERSION = '2026-09-25';

export type TermsDecision = 'ok' | 'record' | 'required';

// ok: already agreed (never overwrite the record) · record: agreeing to the current version now ·
// required: must agree first — nothing may be created.
export function termsDecision(
  row: { terms_agreed_at: string | null } | null,
  agreedVersion: string | undefined,
  currentVersion: string,
): TermsDecision {
  if (row?.terms_agreed_at) return 'ok';
  return agreedVersion === currentVersion ? 'record' : 'required';
}
```

(b) `upsertSupabaseUser` 시그니처를 `upsertSupabaseUser(kakaoId: number, recordTerms: boolean)`로 바꾸고, `users` upsert를 다음으로 교체:

```ts
  const { error: usersError } = await admin.from('users').upsert(
    {
      uid: sessionData.user.id,
      provider: 'kakao',
      kakao_id: kakaoId,
      ...(recordTerms ? { terms_agreed_at: new Date().toISOString(), terms_version: TERMS_VERSION } : {}),
    },
    { onConflict: 'uid' },
  );
  if (usersError) throw usersError;
```

(c) `Deno.serve` 핸들러 전체를 교체:

```ts
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  try {
    const { kakaoAccessToken, agreedTermsVersion } = await req.json();
    if (!kakaoAccessToken) return json({ error: 'kakaoAccessToken required' }, 400);

    const kakaoId = await verifyKakaoAccessToken(kakaoAccessToken, KAKAO_APP_ID);

    // Consent is checked BEFORE anything is created: no account exists without agreement.
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: row, error: lookupError } = await admin
      .from('users')
      .select('terms_agreed_at')
      .eq('kakao_id', kakaoId)
      .maybeSingle();
    if (lookupError) throw lookupError;

    const decision = termsDecision(row, agreedTermsVersion, TERMS_VERSION);
    if (decision === 'required') return json({ error: 'terms_required', termsVersion: TERMS_VERSION }, 412);

    const session = await upsertSupabaseUser(kakaoId, decision === 'record');
    return json({ access_token: session.access_token, refresh_token: session.refresh_token });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
```

파일 머리 주석의 계약 줄도 `// POST { kakaoAccessToken, agreedTermsVersion? } -> { access_token, refresh_token } | 412 { error: 'terms_required', termsVersion } | { error }`로 고친다.

- [ ] **Step 7: 테스트 + 타입체크**

Run: `npx -y deno test --node-modules-dir=none --allow-net --allow-env supabase/functions/kakao-custom-token/index.test.ts`
Expected: 11 passed (기존 6 + 신규 5).
Run: `npx -y deno check --node-modules-dir=none supabase/functions/kakao-custom-token/index.ts`
Expected: 오류 없음.

- [ ] **Step 8: 로컬 스모크** — `npx supabase functions serve kakao-custom-token --env-file supabase/functions/.env.local`를 백그라운드로 띄우고:

Run: `curl -s -X POST http://127.0.0.1:54321/functions/v1/kakao-custom-token -H "Content-Type: application/json" -d '{"kakaoAccessToken":"fake"}'`
Expected: `500` + `kakao token check failed: 401` (가짜 토큰은 약관 판정 전에 거절돼야 함 — 412가 나오면 순서가 틀린 것).

- [ ] **Step 9: 커밋**

```bash
git add supabase/migrations/20260925000001_users_terms.sql supabase/tests/database/terms.test.sql supabase/functions/kakao-custom-token/index.ts supabase/functions/kakao-custom-token/index.test.ts
git commit -m "feat(supabase): require terms consent before creating a Kakao account"
```

---

## Task 2: 앱 — 토큰 교환 분리 + 약관 링크 상수

**Files:**
- Modify: `mobile/src/features/auth/kakaoLogin.ts`
- Create: `mobile/src/constants/terms.ts`
- Test: `mobile/src/features/auth/__tests__/kakaoLogin.test.ts`

**Interfaces:**
- Consumes: Task 1의 HTTP 계약.
- Produces:
  - `loginWithKakao(): Promise<string>` (변경 없음)
  - `type ExchangeResult = { status: 'signed_in' } | { status: 'terms_required'; termsVersion: string }`
  - `exchangeKakaoToken(kakaoAccessToken: string, agreedTermsVersion?: string): Promise<ExchangeResult>` — 200이면 `supabase.auth.setSession` 후 `signed_in`, 412 `terms_required`면 세션을 건드리지 않고 반환, 그 외는 throw.
  - `signInWithKakao`는 **삭제**(Task 4가 대체).
  - `TERMS_LINKS: { service: string; privacy: string; location: string }` (`constants/terms.ts`)

- [ ] **Step 1: 테스트 교체** — `kakaoLogin.test.ts`에서 `signInWithKakao` 관련 두 테스트와 import를 지우고 아래로 교체(`loginWithKakao` 테스트와 mock 선언은 유지):

```ts
import { exchangeKakaoToken, loginWithKakao } from '../kakaoLogin';

test('동의가 필요 없으면 받은 세션을 심고 signed_in', async () => {
  const fetchMock = mockFetch(200, { access_token: 'sb-access', refresh_token: 'sb-refresh' });
  await expect(exchangeKakaoToken('kakao-token')).resolves.toEqual({ status: 'signed_in' });
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ kakaoAccessToken: 'kakao-token' });
  expect(supabase.auth.setSession).toHaveBeenCalledWith({ access_token: 'sb-access', refresh_token: 'sb-refresh' });
});

test('412 terms_required면 세션 없이 서버가 준 버전을 돌려준다', async () => {
  mockFetch(412, { error: 'terms_required', termsVersion: '2026-09-25' });
  await expect(exchangeKakaoToken('kakao-token')).resolves.toEqual({ status: 'terms_required', termsVersion: '2026-09-25' });
  expect(supabase.auth.setSession).not.toHaveBeenCalled();
});

test('동의 버전을 함께 보낸다', async () => {
  const fetchMock = mockFetch(200, { access_token: 'a', refresh_token: 'r' });
  await exchangeKakaoToken('kakao-token', '2026-09-25');
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ kakaoAccessToken: 'kakao-token', agreedTermsVersion: '2026-09-25' });
});

test('그 외 실패는 세션을 심지 않고 에러를 던진다', async () => {
  mockFetch(500, { error: 'kakao token was issued to a different app' });
  await expect(exchangeKakaoToken('kakao-token')).rejects.toThrow('different app');
  expect(supabase.auth.setSession).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: 실패 확인**

Run (PowerShell, `mobile/`): `npx jest src/features/auth/__tests__/kakaoLogin.test.ts`
Expected: FAIL — `exchangeKakaoToken` 없음.

- [ ] **Step 3: 구현** — `kakaoLogin.ts`의 `signInWithKakao`를 삭제하고 추가:

```ts
export type ExchangeResult = { status: 'signed_in' } | { status: 'terms_required'; termsVersion: string };

// Kakao token -> kakao-custom-token -> Supabase session. A first-time user gets
// terms_required back (nothing created server-side) and must resend with the version they agreed to.
export async function exchangeKakaoToken(
  kakaoAccessToken: string,
  agreedTermsVersion?: string,
): Promise<ExchangeResult> {
  const res = await fetch(EDGE_FUNCTION_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kakaoAccessToken, agreedTermsVersion }),
  });
  const body = await res.json();
  if (res.status === 412 && body.error === 'terms_required') {
    return { status: 'terms_required', termsVersion: body.termsVersion };
  }
  if (!res.ok) throw new Error(`kakao-custom-token failed: ${body.error ?? res.status}`);
  const { error } = await supabase.auth.setSession({
    access_token: body.access_token,
    refresh_token: body.refresh_token,
  });
  if (error) throw error;
  return { status: 'signed_in' };
}
```

(`JSON.stringify`는 `undefined` 필드를 빼므로 버전 없는 요청 본문은 `{ kakaoAccessToken }`만 남는다 — 첫 테스트가 이를 확인.)

- [ ] **Step 4: 링크 상수**

```ts
// mobile/src/constants/terms.ts
// ponytail: placeholder URLs — the documents aren't written yet. Replace with the real hosted
// pages before store submission (DoD §5: 약관·개인정보 처리방침 완비).
export const TERMS_LINKS = {
  service: 'https://sanchaeknyang.app/terms',
  privacy: 'https://sanchaeknyang.app/privacy',
  location: 'https://sanchaeknyang.app/location-terms',
} as const;
```

- [ ] **Step 5: 통과 확인**

Run: `npx jest src/features/auth/__tests__/kakaoLogin.test.ts`
Expected: 5 passed.
(`npx tsc --noEmit`은 `login.tsx`가 아직 `signInWithKakao`를 import해서 실패한다 — Task 4에서 해소. 이 태스크에선 돌리지 않는다.)

- [ ] **Step 6: 커밋**

```bash
git add mobile/src/features/auth/kakaoLogin.ts mobile/src/features/auth/__tests__/kakaoLogin.test.ts mobile/src/constants/terms.ts
git commit -m "feat(mobile): split Kakao token exchange to surface terms_required"
```

---

## Task 3: 약관 바텀시트

**Files:**
- Create: `mobile/src/features/auth/TermsSheet.tsx`
- Test: `mobile/src/features/auth/__tests__/TermsSheet.test.tsx`

**Interfaces:**
- Consumes: `TERMS_LINKS`(Task 2), `color`/`type`/`radius`/`space`/`font`(`@/constants/tokens`).
- Produces: `export function TermsSheet(props: { visible: boolean; busy: boolean; failed: boolean; onAgree: () => void; onClose: () => void }): JSX.Element`. 체크 상태는 시트 내부 state. `onClose` 시(바깥 탭·안드로이드 백·닫힘) 체크를 비운다. `failed`면 시트 안에 오류 문구.

- [ ] **Step 1: 실패하는 테스트**

```tsx
// mobile/src/features/auth/__tests__/TermsSheet.test.tsx
import { fireEvent, render, screen } from '@testing-library/react-native';
import * as WebBrowser from 'expo-web-browser';
import { TERMS_LINKS } from '@/constants/terms';
import { TermsSheet } from '../TermsSheet';

jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn(() => Promise.resolve()) }));

const REQUIRED = ['만 14세 이상이에요', '[필수] 이용약관', '[필수] 개인정보 수집·이용', '[필수] 위치기반서비스 이용약관'];
const AGREE = '동의하고 시작하기';
const props = { visible: true, busy: false, failed: false, onAgree: jest.fn(), onClose: jest.fn() };

beforeEach(() => jest.clearAllMocks());

test('필수 4개를 모두 체크하기 전엔 동의 버튼이 비활성', async () => {
  await render(<TermsSheet {...props} />);
  expect(screen.getByRole('button', { name: AGREE, disabled: true })).toBeTruthy();
  for (const label of REQUIRED.slice(0, 3)) await fireEvent.press(screen.getByRole('checkbox', { name: label }));
  expect(screen.getByRole('button', { name: AGREE, disabled: true })).toBeTruthy();
  await fireEvent.press(screen.getByRole('checkbox', { name: REQUIRED[3] }));
  await fireEvent.press(screen.getByRole('button', { name: AGREE, disabled: false }));
  expect(props.onAgree).toHaveBeenCalledTimes(1);
});

test('모두 동의가 전부 켜고 끈다', async () => {
  await render(<TermsSheet {...props} />);
  await fireEvent.press(screen.getByRole('checkbox', { name: '모두 동의할게요' }));
  for (const label of REQUIRED) expect(screen.getByRole('checkbox', { name: label, checked: true })).toBeTruthy();
  await fireEvent.press(screen.getByRole('checkbox', { name: '모두 동의할게요' }));
  for (const label of REQUIRED) expect(screen.getByRole('checkbox', { name: label, checked: false })).toBeTruthy();
});

test('처리 중엔 다 체크돼 있어도 동의 버튼이 비활성 (연타 방지)', async () => {
  await render(<TermsSheet {...props} busy />);
  await fireEvent.press(screen.getByRole('checkbox', { name: '모두 동의할게요' }));
  expect(screen.getByRole('button', { name: AGREE, disabled: true })).toBeTruthy();
});

test('보기는 약관 원문을 인앱 브라우저로 연다', async () => {
  await render(<TermsSheet {...props} />);
  await fireEvent.press(screen.getByRole('link', { name: '[필수] 위치기반서비스 이용약관 보기' }));
  expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith(TERMS_LINKS.location);
});

test('닫으면 체크가 초기화된다', async () => {
  const { rerender } = await render(<TermsSheet {...props} />);
  await fireEvent.press(screen.getByRole('checkbox', { name: '모두 동의할게요' }));
  await fireEvent.press(screen.getByRole('button', { name: '닫기' }));
  expect(props.onClose).toHaveBeenCalledTimes(1);
  await rerender(<TermsSheet {...props} />);
  expect(screen.getByRole('checkbox', { name: '모두 동의할게요', checked: false })).toBeTruthy();
});

test('실패하면 시트 안에 다시 해보라는 안내', async () => {
  await render(<TermsSheet {...props} failed />);
  expect(screen.getByText('앗, 잠깐 문제가 생겼다냥. 다시 해볼까냥?')).toBeTruthy();
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx jest src/features/auth/__tests__/TermsSheet.test.tsx`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: 구현**

```tsx
// mobile/src/features/auth/TermsSheet.tsx
import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';

import { color, font, radius, space, type } from '@/constants/tokens';
import { TERMS_LINKS } from '@/constants/terms';

const ITEMS = [
  { key: 'age', label: '만 14세 이상이에요' },
  { key: 'service', label: '[필수] 이용약관', url: TERMS_LINKS.service },
  { key: 'privacy', label: '[필수] 개인정보 수집·이용', url: TERMS_LINKS.privacy },
  { key: 'location', label: '[필수] 위치기반서비스 이용약관', url: TERMS_LINKS.location },
] as const;

type Key = (typeof ITEMS)[number]['key'];

function Checkbox({ label, checked, onPress, strong }: { label: string; checked: boolean; onPress: () => void; strong?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked }}
      style={styles.row}>
      <View style={[styles.box, checked && styles.boxOn]}>{checked && <Text style={styles.tick}>✓</Text>}</View>
      <Text style={[styles.label, strong && styles.labelStrong]}>{label}</Text>
    </Pressable>
  );
}

export function TermsSheet({
  visible,
  busy,
  failed,
  onAgree,
  onClose,
}: {
  visible: boolean;
  busy: boolean;
  failed: boolean;
  onAgree: () => void;
  onClose: () => void;
}) {
  const [checked, setChecked] = useState<Record<Key, boolean>>({ age: false, service: false, privacy: false, location: false });
  const all = ITEMS.every((i) => checked[i.key]);
  const setAll = (v: boolean) => setChecked({ age: v, service: v, privacy: v, location: v });

  const close = () => {
    setAll(false);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close} accessibilityRole="button" accessibilityLabel="닫기" />
      <SafeAreaView edges={['bottom']} style={styles.sheet}>
        <Text style={styles.title} accessibilityRole="header">
          시작하기 전에 확인해 주세요
        </Text>

        <Checkbox label="모두 동의할게요" checked={all} onPress={() => setAll(!all)} strong />
        <View style={styles.divider} />

        {ITEMS.map((item) => (
          <View key={item.key} style={styles.itemRow}>
            <Checkbox
              label={item.label}
              checked={checked[item.key]}
              onPress={() => setChecked((c) => ({ ...c, [item.key]: !c[item.key] }))}
            />
            {'url' in item && (
              <Pressable
                onPress={() => WebBrowser.openBrowserAsync(item.url)}
                accessibilityRole="link"
                accessibilityLabel={`${item.label} 보기`}
                hitSlop={8}
                style={styles.view}>
                <Text style={styles.viewText}>보기</Text>
              </Pressable>
            )}
          </View>
        ))}

        <Pressable
          onPress={onAgree}
          disabled={!all || busy}
          accessibilityRole="button"
          accessibilityLabel="동의하고 시작하기"
          accessibilityState={{ disabled: !all || busy, busy }}
          style={[styles.cta, (!all || busy) && styles.ctaOff]}>
          {busy ? (
            <ActivityIndicator color={color.onPrimary} />
          ) : (
            <Text style={[styles.ctaText, !all && styles.ctaTextOff]}>동의하고 시작하기</Text>
          )}
        </Pressable>

        <Text style={styles.error} accessibilityLiveRegion="polite">
          {failed ? '앗, 잠깐 문제가 생겼다냥. 다시 해볼까냥?' : ' '}
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
  title: { ...type.title, color: color.ink, marginBottom: 16 },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: space.tapMin, flex: 1, gap: 12 },
  itemRow: { flexDirection: 'row', alignItems: 'center' },
  box: {
    width: 24,
    height: 24,
    borderRadius: radius.min,
    borderWidth: 2,
    borderColor: color.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxOn: { backgroundColor: color.primary, borderColor: color.primary },
  tick: { fontFamily: font.bold, fontSize: 14, lineHeight: 16, color: color.onPrimary },
  label: { ...type.body, color: color.ink, flexShrink: 1 },
  labelStrong: { fontFamily: font.semibold },
  divider: { height: 1, backgroundColor: color.line, marginVertical: 8 },
  view: { minHeight: space.tapMin, justifyContent: 'center', paddingLeft: 12 },
  viewText: { ...type.caption, color: color.inkSub, textDecorationLine: 'underline' },
  cta: {
    marginTop: 20,
    height: 52,
    borderRadius: radius.btn,
    backgroundColor: color.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaOff: { backgroundColor: color.line },
  ctaText: { fontFamily: font.semibold, fontSize: 16, color: color.onPrimary },
  ctaTextOff: { color: color.inkSub },
  error: { ...type.caption, color: color.ink, marginTop: 12, marginBottom: 8, minHeight: 18 },
});
```

(`backdrop`의 rgba는 `color.ink`(#4A3D30)의 반투명 — 토큰엔 알파 변형이 없어 주석으로 출처를 남긴다.)

- [ ] **Step 4: 통과 확인**

Run: `npx jest src/features/auth/__tests__/TermsSheet.test.tsx`
Expected: 6 passed. 실패 시 흔한 원인: `render`/`fireEvent`에 `await` 누락, 또는 `getByRole`의 `name`이 `accessibilityLabel`과 글자 하나라도 다름.

- [ ] **Step 5: 커밋**

```bash
git add mobile/src/features/auth/TermsSheet.tsx mobile/src/features/auth/__tests__/TermsSheet.test.tsx
git commit -m "feat(mobile): add terms consent bottom sheet"
```

---

## Task 4: 로그인 화면에 약관 흐름 연결

**Files:**
- Modify: `mobile/src/app/login.tsx`
- Test: `mobile/src/app/__tests__/login.test.tsx`

**Interfaces:**
- Consumes: `loginWithKakao`, `exchangeKakaoToken`, `ExchangeResult`(Task 2), `TermsSheet`(Task 3).
- Produces: 없음(화면).

- [ ] **Step 1: 테스트 교체** — `login.test.tsx` 전체를 아래로:

```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { exchangeKakaoToken, loginWithKakao } from '@/features/auth/kakaoLogin';
import LoginScreen from '../login';

jest.mock('@/features/auth/kakaoLogin', () => ({ loginWithKakao: jest.fn(), exchangeKakaoToken: jest.fn() }));
jest.mock('expo-router', () => ({ router: { replace: jest.fn() } }));
jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn() }));
// Decorative hero; reanimated's jest mock has no useReducedMotion.
jest.mock('@/features/auth/FogReveal', () => ({ FogReveal: () => null }));

const ERROR = '앗, 잠깐 문제가 생겼다냥. 다시 해볼까냥?';
const SHEET_TITLE = '시작하기 전에 확인해 주세요';
const login = loginWithKakao as jest.Mock;
const exchange = exchangeKakaoToken as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  login.mockResolvedValue('kakao-token');
});

const tapKakao = async () => fireEvent.press(screen.getByRole('button', { name: '카카오로 시작하기' }));
const agreeAll = async () => {
  await fireEvent.press(screen.getByRole('checkbox', { name: '모두 동의할게요' }));
  await fireEvent.press(screen.getByRole('button', { name: '동의하고 시작하기' }));
};

test('이미 동의한 사용자는 시트 없이 프로필로', async () => {
  exchange.mockResolvedValue({ status: 'signed_in' });
  await render(<LoginScreen />);
  await tapKakao();
  await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/profile'));
  expect(screen.queryByText(SHEET_TITLE)).toBeNull();
});

test('신규 사용자는 시트 → 동의하면 같은 토큰+서버 버전으로 재요청 → 프로필', async () => {
  exchange.mockResolvedValueOnce({ status: 'terms_required', termsVersion: '2026-09-25' }).mockResolvedValueOnce({ status: 'signed_in' });
  await render(<LoginScreen />);
  await tapKakao();
  expect(await screen.findByText(SHEET_TITLE)).toBeTruthy();
  await agreeAll();
  await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/profile'));
  expect(exchange).toHaveBeenLastCalledWith('kakao-token', '2026-09-25');
  expect(login).toHaveBeenCalledTimes(1); // 카카오 재로그인 없음
});

test('재요청 실패 — 시트는 열린 채 안내가 보이고, 다시 누르면 같은 토큰으로 재시도', async () => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  exchange
    .mockResolvedValueOnce({ status: 'terms_required', termsVersion: '2026-09-25' })
    .mockRejectedValueOnce(new Error('Network request failed'))
    .mockResolvedValueOnce({ status: 'signed_in' });
  await render(<LoginScreen />);
  await tapKakao();
  await screen.findByText(SHEET_TITLE);
  await agreeAll();
  expect(await screen.findByText(ERROR)).toBeTruthy();
  expect(screen.getByText(SHEET_TITLE)).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: '동의하고 시작하기' })); // 체크 유지됨
  await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/profile'));
  expect(exchange).toHaveBeenLastCalledWith('kakao-token', '2026-09-25');
});

test('시트를 닫으면 로그인 화면으로 돌아오고 다음 탭은 새 카카오 로그인', async () => {
  exchange.mockResolvedValue({ status: 'terms_required', termsVersion: '2026-09-25' });
  await render(<LoginScreen />);
  await tapKakao();
  await screen.findByText(SHEET_TITLE);
  await fireEvent.press(screen.getByRole('button', { name: '닫기' }));
  await waitFor(() => expect(screen.queryByText(SHEET_TITLE)).toBeNull());
  await tapKakao();
  await waitFor(() => expect(login).toHaveBeenCalledTimes(2));
  expect(router.replace).not.toHaveBeenCalled();
});

test('동의 후 다음 신규 로그인에서는 체크가 비어 있다 (미리 체크된 동의 금지)', async () => {
  login.mockResolvedValueOnce('token-a').mockResolvedValueOnce('token-b');
  exchange
    .mockResolvedValueOnce({ status: 'terms_required', termsVersion: '2026-09-25' })
    .mockResolvedValueOnce({ status: 'signed_in' })
    .mockResolvedValueOnce({ status: 'terms_required', termsVersion: '2026-09-25' });
  await render(<LoginScreen />);
  await tapKakao();
  await screen.findByText(SHEET_TITLE);
  await agreeAll();
  await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/profile'));
  await tapKakao();
  await screen.findByText(SHEET_TITLE);
  expect(screen.getByRole('checkbox', { name: '모두 동의할게요', checked: false })).toBeTruthy();
  expect(screen.getByRole('button', { name: '동의하고 시작하기', disabled: true })).toBeTruthy();
});

test('사용자가 카카오 로그인을 취소하면 에러를 띄우지 않는다', async () => {
  login.mockRejectedValue(new Error('ClientError(reason=Cancelled)'));
  await render(<LoginScreen />);
  await tapKakao();
  await waitFor(() => expect(login).toHaveBeenCalled());
  expect(screen.queryByText(ERROR)).toBeNull();
  expect(exchange).not.toHaveBeenCalled();
});

test('진짜 실패면 로그인 화면에 다시 해보라는 안내', async () => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  exchange.mockRejectedValue(new Error('kakao-custom-token failed: 500'));
  await render(<LoginScreen />);
  await tapKakao();
  expect(await screen.findByText(ERROR)).toBeTruthy();
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx jest src/app/__tests__/login.test.tsx`
Expected: FAIL (현재 화면은 `signInWithKakao`를 쓰고 시트가 없음).

- [ ] **Step 3: 구현** — `login.tsx`의 import와 `LoginScreen` 본문을 교체(`isCancel`, `KakaoSymbol`, `styles`는 그대로):

```tsx
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { color, font, kakao, radius, space, type } from '@/constants/tokens';
import { FogReveal } from '@/features/auth/FogReveal';
import { exchangeKakaoToken, loginWithKakao } from '@/features/auth/kakaoLogin';
import { TermsSheet } from '@/features/auth/TermsSheet';
```

```tsx
export default function LoginScreen() {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  // A first-time user: we hold the Kakao token while the terms sheet is open, so agreeing
  // doesn't send them through Kakao login a second time.
  const [pending, setPending] = useState<{ token: string; termsVersion: string } | null>(null);

  const run = async (step: () => Promise<void>) => {
    setBusy(true);
    setFailed(false);
    try {
      await step();
    } catch (e) {
      if (!isCancel(e)) {
        console.error('카카오 로그인 실패', e);
        setFailed(true);
      }
    } finally {
      setBusy(false);
    }
  };

  const onKakao = () =>
    run(async () => {
      const token = await loginWithKakao();
      const result = await exchangeKakaoToken(token);
      if (result.status === 'terms_required') setPending({ token, termsVersion: result.termsVersion });
      else router.replace('/profile');
    });

  const onAgree = () =>
    run(async () => {
      if (!pending) return;
      const result = await exchangeKakaoToken(pending.token, pending.termsVersion);
      // The server bumped the version while the sheet was open: keep the sheet, fail visibly.
      if (result.status === 'terms_required') {
        setPending({ ...pending, termsVersion: result.termsVersion });
        throw new Error('terms version changed during consent');
      }
      setPending(null);
      router.replace('/profile');
    });

  const onCloseSheet = () => {
    setPending(null);
    setFailed(false);
  };

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <FogReveal />
      <View style={styles.body}>
        <Text style={styles.headline} accessibilityRole="header">
          저랑 같이 우리 동네를{'\n'}누벼볼까요?
        </Text>
        <Text style={styles.lede}>다녀온 곳마다 발자국이 남고,{'\n'}그 자리부터 안개가 걷혀요.</Text>

        <Pressable
          onPress={onKakao}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="카카오로 시작하기"
          accessibilityState={{ busy, disabled: busy }}
          style={({ pressed }) => [styles.kakao, pressed && styles.kakaoPressed]}>
          {busy && !pending ? <ActivityIndicator color={kakao.symbol} /> : <KakaoSymbol />}
          <Text style={styles.kakaoLabel}>카카오로 시작하기</Text>
        </Pressable>

        <Text style={styles.error} accessibilityLiveRegion="polite">
          {failed && !pending ? '앗, 잠깐 문제가 생겼다냥. 다시 해볼까냥?' : ' '}
        </Text>
      </View>

      {/* key: a fresh sheet (all boxes empty) for every Kakao login. Without it, a sheet hidden after
          a successful agreement keeps its ticks, and the next new user on this device would see
          consent pre-checked — which isn't consent. */}
      <TermsSheet
        key={pending?.token ?? 'none'}
        visible={!!pending}
        busy={busy}
        failed={failed}
        onAgree={onAgree}
        onClose={onCloseSheet}
      />
    </SafeAreaView>
  );
}
```

(오류 문구는 시트가 열려 있으면 시트 안에만, 아니면 로그인 화면에만 — 같은 문장이 두 번 보이지 않게.)

- [ ] **Step 4: 전체 확인**

Run (`mobile/`): `npx jest --ci`
Expected: 전부 통과 — kakaoLogin 5 + TermsSheet 6 + login 7 + 기존(authStore 1, supabase 1, index 1).
Run: `npx tsc --noEmit` → 0. `npx expo lint` → 오류 0(기존 경고 1개는 무관).

- [ ] **Step 5: 커밋**

```bash
git add mobile/src/app/login.tsx mobile/src/app/__tests__/login.test.tsx
git commit -m "feat(mobile): ask first-time users for terms consent before creating the account"
```

---

## 마지막 — 사람이 직접 확인 (자동화 불가)

실기기(dev build)에서, `supabase functions serve kakao-custom-token --env-file supabase/functions/.env.local`이 켜진 상태로:

1. **한 번도 로그인 안 한 카카오 계정**으로 "카카오로 시작하기" → 약관 시트가 뜬다. 이때 `select * from auth.users` → 이 카카오 계정의 행이 **없어야** 한다.
2. 시트를 닫았다가 다시 시도 → 시트가 새로(체크 비어) 뜬다.
3. 모두 동의 → "동의하고 시작하기" → 프로필 화면. `select kakao_id, terms_agreed_at, terms_version from public.users` → 값이 채워져 있다.
4. 로그아웃 → 다시 카카오 로그인 → 시트 **없이** 바로 프로필.
5. "보기" 3개가 인앱 브라우저로 열린다(지금은 임시 주소라 404일 수 있음 — 열리기만 하면 OK).
