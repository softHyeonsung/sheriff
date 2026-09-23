# Auth: 카카오 로그인 → Supabase 세션 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 카카오 로그인으로 실제 Supabase 세션을 발급받고, 그 세션으로 RLS가 걸린 본인 데이터(프로필)를 읽고 쓸 수 있는 것까지 증명하는 최소 인증 파이프라인을 만든다. 지도 홈 화면·체크인 등 나머지 기능은 이 플랜 밖(다음 플랜).

**Architecture:** 클라이언트가 `expo-auth-session`으로 카카오 authorize code를 얻어 `kakao-custom-token` Edge Function(로컬 `supabase functions serve`)에 넘긴다. Edge Function이 code→토큰 교환·프로필 조회·`public.users`/`profiles` upsert를 서버에서 처리하고, Supabase Admin API(`generateLink`+`verifyOtp`)로 실제 세션(access/refresh token)을 발급해 클라이언트에 돌려준다. 클라이언트는 그 세션을 `setSession()`으로 심고 `expo-secure-store`에 영속화한다. 카카오 REST 키/시크릿은 절대 클라이언트에 노출하지 않는다(기존 "외부 API 전부 Edge Function 프록시" 원칙 유지).

**Tech Stack:** `@supabase/supabase-js`, `expo-secure-store`, `expo-auth-session` + `expo-web-browser`, Zustand(authStore), Deno(Supabase Edge Functions).

**Spec:** `docs/기술-아키텍처-v1.md` §1.1(저장·세션), §4(`kakao-custom-token`), §7(상태관리), `docs/핸드오프-개발팀-v1.md` §2. Supabase Admin API 세션 발급 패턴(`generateLink`+`verifyOtp`)은 2026-09-23 공식 문서(`supabase.com/docs/reference/javascript/auth-admin-generatelink`)로 확인함 — 단, Admin API는 자주 바뀌므로 구현 시 재확인 필수(Global Constraints 참조).

## Global Constraints

- 카카오 REST API 키는 클라이언트에 있어도 되는 값(OAuth `client_id`처럼 공개 식별자) — `EXPO_PUBLIC_KAKAO_REST_KEY`로 관리. **카카오 Client Secret(설정된 경우)과 code→token 교환은 반드시 Edge Function에서만** — 클라이언트가 절대 토큰 교환을 직접 하지 않는다.
- Redirect URI는 정확히 `sanchaeknyang://oauthredirect` — `mobile/app.json`의 `scheme: "sanchaeknyang"`과 일치해야 하며, 카카오 디벨로퍼스 콘솔의 Redirect URI에도 이 값이 등록돼 있어야 한다(사용자가 별도로 등록).
- 세션(access/refresh token)은 `expo-secure-store`에만 저장 — `AsyncStorage`에 저장 금지(토큰이라 반드시 SecureStore).
- Supabase 클라이언트는 `mobile/src/services/supabase.ts` 하나로 통일 — 다른 파일에서 `@supabase/supabase-js`를 직접 import 금지(기존 "SDK 직접호출 금지 경계" 원칙 유지).
- 이 플랜은 로컬 개발까지만 다룬다 — `supabase functions serve`로 로컬 Docker DB를 대상으로 테스트. 실제 호스팅 프로젝트 배포(`supabase functions deploy`)는 범위 밖(출시 준비 플랜).
- Supabase Admin API(`admin.createUser`, `admin.generateLink`, `auth.verifyOtp`)의 정확한 파라미터·응답 필드·에러 형태는 시점에 따라 바뀔 수 있다 — 구현 전 반드시 `https://supabase.com/docs/reference/javascript/auth-admin-generatelink`, `auth-admin-createuser`, `auth-verifyotp`를 확인하고, 이 플랜에 적힌 코드와 다르면 **공식 문서 쪽을 따르고 그 사실을 보고할 것**(학습 데이터를 그대로 믿지 말 것 — `mobile/AGENTS.md`가 Expo에 대해 요구하는 것과 같은 원칙을 Supabase Admin API에도 적용).
- 카카오 code→token 교환의 실제 종단 테스트(진짜 카카오 로그인 화면을 사람이 직접 탭하는 것)는 자동화된 서브에이전트가 할 수 없다 — Task 2는 Kakao API 호출을 mock한 단위 테스트로, Task 3/4는 화면 렌더·상태 전이 테스트로 검증하고, **진짜 종단 확인은 이 플랜의 마지막에 인간이 실기기/시뮬레이터에서 한 번 직접 로그인해보는 것**으로 마무리한다.

## 변경 (2026-09-23, 구현 중): 카카오 네이티브 SDK로 전환

카카오 콘솔이 Redirect URI로 `http(s)://`만 받아서 `sanchaeknyang://oauthredirect` 등록이 거부됨("유효하지 않음"). 그래서 브라우저 OAuth(authorization code) 방식을 버리고 **카카오 네이티브 SDK(`@react-native-kakao/core` + `/user` 2.4.6)**로 바꿨다. 아래 Task 2·3 본문은 원래 설계 기록이고, 실제 코드는 다음과 같다:

- **Task 2 계약 변경:** `POST { kakaoAccessToken } → { access_token, refresh_token } | { error }`. Edge Function이 `GET kapi.kakao.com/v1/user/access_token_info`로 토큰의 `app_id`가 우리 앱(`KAKAO_APP_ID`)인지 검증한 뒤 세션을 발급한다. 다른 카카오 앱에서 발급된 토큰은 거부(토큰 바꿔치기 방지). code 교환이 없으므로 `KAKAO_REST_KEY`/`KAKAO_CLIENT_SECRET`은 더 이상 쓰지 않는다.
- **Task 3 교체:** `expo-auth-session`/`useKakaoLogin`/`KAKAO_REDIRECT_URI` 삭제 → `mobile/src/features/auth/kakaoLogin.ts`의 `loginWithKakao(): Promise<string>`(카카오 액세스 토큰 반환). 네이티브 앱 키는 `mobile/app.config.js`가 `EXPO_PUBLIC_KAKAO_NATIVE_APP_KEY`에서 읽어 config plugin에 넘긴다. Expo Go 불가 — dev build 필요.
- **env:** `supabase/functions/.env.local`에 `KAKAO_APP_ID`(콘솔의 숫자 앱 ID), `mobile/.env.local`에 `EXPO_PUBLIC_KAKAO_NATIVE_APP_KEY`.
- **카카오 콘솔:** Redirect URI 불필요. 대신 플랫폼에 Android 패키지명 `com.hyeonsung.sheriff` + 키 해시, iOS 번들 ID `com.hyeonsung.sheriff` 등록.
- **추가 보안:** 계정 소유는 `app_metadata.kakao_id`로 묶고 세션 발급 전 확인, `[auth.email] enable_signup = false`(합성 이메일 선점 방지).

---

## Task 1: Supabase 클라이언트 + 보안 세션 저장소

**Files:**
- Create: `mobile/src/services/supabase.ts`
- Modify: `mobile/package.json` (의존성 추가)
- Test: `mobile/src/services/__tests__/supabase.test.ts`

**Interfaces:**
- Produces: `supabase` (설정된 `SupabaseClient` 인스턴스) — Task 2~4가 전부 이걸 통해서만 Supabase를 호출한다. `export const supabase: SupabaseClient`.

- [ ] **Step 1: 의존성 설치**

Run: `cd mobile && npx expo install @supabase/supabase-js expo-secure-store react-native-url-polyfill`

- [ ] **Step 2: 환경변수 파일 준비**

`mobile/.env.local` 생성(이미 루트 `.gitignore`가 `.env*.local`을 커버하는지 확인 — 커버 안 되면 `mobile/.gitignore`에 추가):
```
EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
EXPO_PUBLIC_SUPABASE_ANON_KEY=<로컬 supabase start 출력의 anon key를 여기 붙여넣기>
```
(`npx supabase status`로 현재 로컬 anon key 확인 가능. Docker PATH 문제 있으면 `$env:PATH += ';C:\Users\user\AppData\Local\Programs\DockerDesktop\resources\bin'`를 앞에 붙일 것.)

- [ ] **Step 3: 클라이언트 작성**

```ts
// mobile/src/services/supabase.ts
import 'react-native-url-polyfill/auto';
import * as SecureStore from 'expo-secure-store';
import { createClient } from '@supabase/supabase-js';

const SecureStoreAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY가 설정되지 않았습니다.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: SecureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
```

- [ ] **Step 4: 테스트 작성**

```ts
// mobile/src/services/__tests__/supabase.test.ts
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

describe('supabase client', () => {
  test('환경변수가 있으면 클라이언트가 생성된다', () => {
    const { supabase } = require('../supabase');
    expect(supabase).toBeDefined();
    expect(typeof supabase.auth.setSession).toBe('function');
  });
});
```
(Jest가 `EXPO_PUBLIC_*` 환경변수를 테스트 중에도 읽을 수 있는지 확인 — `mobile/.env.local`이 아니라 `mobile/package.json`의 `jest` 설정에 `setupFiles`로 더미 값을 주입하거나, 테스트 파일 상단에서 `process.env.EXPO_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321'` 등으로 직접 세팅. 실제 동작하는 방식으로 구현하고 어떤 방식을 썼는지 보고에 남길 것.)

- [ ] **Step 5: 실행**

Run: `cd mobile && npx jest src/services/__tests__/supabase.test.ts`
Expected: 1 passed.

Run: `cd mobile && npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 6: 커밋**

```
git add mobile
git commit -m "feat(mobile): add Supabase client with SecureStore session storage"
```

---

## Task 2: `kakao-custom-token` Edge Function

**Files:**
- Create: `supabase/functions/kakao-custom-token/index.ts`
- Test: `supabase/functions/kakao-custom-token/index.test.ts`

**Interfaces:**
- Consumes: 없음(독립 — Task 1의 클라이언트와 별개로, 로컬 Supabase 스택에 직접 배포해서 테스트).
- Produces: POST 엔드포인트. 요청 `{ code: string, redirectUri: string }` → 응답 `{ access_token: string, refresh_token: string }` (성공) 또는 `{ error: string }` + non-200 (실패). Task 4가 이 계약대로 호출한다.

- [ ] **Step 1: Edge Function 스캐폴드**

Run (리포 루트에서): `npx supabase functions new kakao-custom-token`
Expected: `supabase/functions/kakao-custom-token/index.ts` 생성.

- [ ] **Step 2: 구현**

**구현 전에 반드시 확인**: `https://supabase.com/docs/reference/javascript/auth-admin-createuser`(이미 등록된 이메일에 대한 에러 형태), `auth-admin-generatelink`(응답에서 세션 발급용 토큰 필드 이름), `auth-verifyotp`(정확한 파라미터). 아래 코드는 2026-09-23 시점 확인된 패턴이며, 필드명이 다르면 실제 문서에 맞게 고치고 무엇이 달랐는지 보고할 것.

```ts
// supabase/functions/kakao-custom-token/index.ts
import { createClient } from 'jsr:@supabase/supabase-js@2';

const KAKAO_REST_KEY = Deno.env.get('KAKAO_REST_KEY') ?? '';
const KAKAO_CLIENT_SECRET = Deno.env.get('KAKAO_CLIENT_SECRET'); // 선택
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

export interface KakaoTokenResponse {
  access_token: string;
  token_type: string;
  refresh_token?: string;
  expires_in: number;
}

export interface KakaoUserResponse {
  id: number;
}

export async function exchangeKakaoCode(
  code: string,
  redirectUri: string,
  fetchImpl: typeof fetch = fetch,
): Promise<KakaoTokenResponse> {
  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: KAKAO_REST_KEY,
    redirect_uri: redirectUri,
    code,
  });
  if (KAKAO_CLIENT_SECRET) params.set('client_secret', KAKAO_CLIENT_SECRET);

  const res = await fetchImpl('https://kauth.kakao.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  if (!res.ok) {
    throw new Error(`kakao token exchange failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

export async function fetchKakaoProfile(
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<KakaoUserResponse> {
  const res = await fetchImpl('https://kapi.kakao.com/v2/user/me', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`kakao profile fetch failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

export async function upsertSupabaseUser(kakaoId: number) {
  const email = `kakao-${kakaoId}@users.sanchaeknyang.app`;
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { error: createError } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { provider: 'kakao', kakao_id: kakaoId },
  });
  // 이미 존재하는 유저면 무시하고 계속 진행 — 정확한 에러 판별 방식은 위 "구현 전 확인" 문서로 검증할 것
  if (createError && !String(createError.message ?? '').toLowerCase().includes('already')) {
    throw createError;
  }

  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
  });
  if (linkError) throw linkError;

  const hashedToken = (linkData as any)?.properties?.hashed_token;
  if (!hashedToken) throw new Error('generateLink 응답에서 hashed_token을 찾을 수 없음 — 문서와 응답 형태가 다를 수 있음');

  const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data: sessionData, error: verifyError } = await anon.auth.verifyOtp({
    email,
    token: hashedToken,
    type: 'magiclink',
  });
  if (verifyError) throw verifyError;
  if (!sessionData.session || !sessionData.user) throw new Error('세션 발급 실패');

  await admin.from('users').upsert({ uid: sessionData.user.id, provider: 'kakao' }, { onConflict: 'uid' });
  await admin
    .from('profiles')
    .upsert({ user_id: sessionData.user.id, nickname: `고양이집사${kakaoId}` }, { onConflict: 'user_id' });

  return sessionData.session;
}

Deno.serve(async (req) => {
  try {
    const { code, redirectUri } = await req.json();
    if (!code || !redirectUri) {
      return new Response(JSON.stringify({ error: 'code and redirectUri required' }), { status: 400 });
    }
    const tokenRes = await exchangeKakaoCode(code, redirectUri);
    const profile = await fetchKakaoProfile(tokenRes.access_token);
    const session = await upsertSupabaseUser(profile.id);

    return new Response(
      JSON.stringify({ access_token: session.access_token, refresh_token: session.refresh_token }),
      { headers: { 'Content-Type': 'application/json' } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
```

- [ ] **Step 3: 단위 테스트 (카카오 API mock — 진짜 카카오 코드 불필요)**

```ts
// supabase/functions/kakao-custom-token/index.test.ts
import { assertEquals } from 'jsr:@std/assert';
import { exchangeKakaoCode, fetchKakaoProfile } from './index.ts';

Deno.test('exchangeKakaoCode는 정상 응답을 파싱한다', async () => {
  const mockFetch = () =>
    Promise.resolve(
      new Response(JSON.stringify({ access_token: 'fake-token', token_type: 'bearer', expires_in: 3600 }), {
        status: 200,
      }),
    );
  const result = await exchangeKakaoCode('fake-code', 'sanchaeknyang://oauthredirect', mockFetch as typeof fetch);
  assertEquals(result.access_token, 'fake-token');
});

Deno.test('exchangeKakaoCode는 카카오가 에러를 주면 throw한다', async () => {
  const mockFetch = () => Promise.resolve(new Response('invalid_grant', { status: 400 }));
  let threw = false;
  try {
    await exchangeKakaoCode('bad-code', 'sanchaeknyang://oauthredirect', mockFetch as typeof fetch);
  } catch {
    threw = true;
  }
  assertEquals(threw, true);
});

Deno.test('fetchKakaoProfile은 카카오 유저 id를 파싱한다', async () => {
  const mockFetch = () => Promise.resolve(new Response(JSON.stringify({ id: 123456 }), { status: 200 }));
  const profile = await fetchKakaoProfile('fake-token', mockFetch as typeof fetch);
  assertEquals(profile.id, 123456);
});
```

- [ ] **Step 4: 로컬 서빙 + 테스트 실행**

Run: `npx supabase functions serve kakao-custom-token --env-file supabase/functions/.env.local` — 이 전에 `supabase/functions/.env.local` 생성하고 `KAKAO_REST_KEY=<사용자가 이미 가진 카카오 REST API 키>`, `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`/`SUPABASE_ANON_KEY`는 `npx supabase status` 출력에서 가져와 채운다. (`supabase/functions/.env.local`은 시크릿이므로 반드시 gitignore 대상인지 확인 — 안 돼있으면 `supabase/.gitignore`에 추가할 것.)

Run (별도 터미널/백그라운드): `deno test --allow-net supabase/functions/kakao-custom-token/index.test.ts`
Expected: 3 passed.

- [ ] **Step 5: 커밋**

```
git add supabase/functions supabase/.gitignore
git commit -m "feat(supabase): add kakao-custom-token edge function"
```

---

## Task 3: 카카오 로그인 화면 (클라이언트 OAuth 플로우)

**Files:**
- Create: `mobile/src/features/auth/useKakaoLogin.ts`
- Create: `mobile/src/app/login.tsx`
- Test: `mobile/src/features/auth/__tests__/useKakaoLogin.test.ts`

**Interfaces:**
- Consumes: 없음(Edge Function 호출은 Task 4에서 연결 — 이 태스크는 카카오 authorization `code`를 얻는 것까지만).
- Produces: `useKakaoLogin()` 훅 — `{ request, response, promptAsync }`를 반환(`response.type === 'success'`일 때 `response.params.code`에 authorization code가 들어있음). 같은 파일에서 `export const KAKAO_REDIRECT_URI: string`도 내보낸다. Task 4가 훅과 이 상수를 둘 다 import한다.

- [ ] **Step 1: 의존성 설치**

Run: `cd mobile && npx expo install expo-auth-session expo-web-browser expo-crypto`

구현 전 `https://docs.expo.dev/versions/v57.0.0/sdk/auth-session/` 확인(이 프로젝트 Expo 버전은 57 — `mobile/AGENTS.md` 규칙대로).

- [ ] **Step 2: 훅 작성**

```ts
// mobile/src/features/auth/useKakaoLogin.ts
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';

WebBrowser.maybeCompleteAuthSession();

const discovery = {
  authorizationEndpoint: 'https://kauth.kakao.com/oauth/authorize',
};

export const KAKAO_REDIRECT_URI = AuthSession.makeRedirectUri({
  scheme: 'sanchaeknyang',
  path: 'oauthredirect',
});

export function useKakaoLogin() {
  const [request, response, promptAsync] = AuthSession.useAuthRequest(
    {
      clientId: process.env.EXPO_PUBLIC_KAKAO_REST_KEY ?? '',
      redirectUri: KAKAO_REDIRECT_URI,
      responseType: AuthSession.ResponseType.Code,
      scopes: [],
    },
    discovery,
  );

  return { request, response, promptAsync };
}
```

- [ ] **Step 3: 로그인 화면**

```tsx
// mobile/src/app/login.tsx
import { View, Button, Text } from 'react-native';
import { useKakaoLogin } from '@/features/auth/useKakaoLogin';

export default function LoginScreen() {
  const { request, promptAsync } = useKakaoLogin();

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <Text>산책냥</Text>
      <Button title="카카오로 시작하기" disabled={!request} onPress={() => promptAsync()} />
    </View>
  );
}
```
(`@/` 경로 별칭이 `mobile/tsconfig.json`에 이미 있는지 확인 — 없으면 상대경로 `../features/auth/useKakaoLogin`으로.)

- [ ] **Step 4: 테스트**

```ts
// mobile/src/features/auth/__tests__/useKakaoLogin.test.ts
import { KAKAO_REDIRECT_URI } from '../useKakaoLogin';

test('redirect URI가 정확히 등록된 값과 일치한다', () => {
  expect(KAKAO_REDIRECT_URI).toBe('sanchaeknyang://oauthredirect');
});
```

- [ ] **Step 5: 실행**

Run: `cd mobile && npx jest src/features/auth/__tests__/useKakaoLogin.test.ts`
Expected: 1 passed.

Run: `cd mobile && npx tsc --noEmit && npx expo lint`
Expected: 둘 다 0.

- [ ] **Step 6: 커밋**

```
git add mobile
git commit -m "feat(mobile): add Kakao OAuth login screen via expo-auth-session"
```

---

## Task 4: 세션 연결 + authStore + 프로필 화면 (RLS 왕복 증명)

**Files:**
- Create: `mobile/src/features/auth/useAuthSession.ts`
- Create: `mobile/src/stores/authStore.ts`
- Create: `mobile/src/app/profile.tsx`
- Modify: `mobile/src/app/login.tsx` (성공 시 Edge Function 호출 + 세션 세팅 + 라우팅)
- Test: `mobile/src/stores/__tests__/authStore.test.ts`

**Interfaces:**
- Consumes: Task 1의 `supabase`(`mobile/src/services/supabase.ts`), Task 2의 `kakao-custom-token` 계약(`{kakaoAccessToken} → {access_token, refresh_token}`), Task 3의 `loginWithKakao()`.
- Produces: `useAuthSession()` — `{ session, loading, signOut }`. 이후 모든 화면은 이 훅 하나로 로그인 상태를 읽는다(원칙: 화면에서 `supabase.auth` 직접 호출 금지).

- [ ] **Step 1: authStore**

```ts
// mobile/src/stores/authStore.ts
import { create } from 'zustand';
import type { Session } from '@supabase/supabase-js';

interface AuthState {
  session: Session | null;
  setSession: (session: Session | null) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  setSession: (session) => set({ session }),
}));
```

- [ ] **Step 2: useAuthSession 훅**

```ts
// mobile/src/features/auth/useAuthSession.ts
import { useEffect, useState } from 'react';
import { supabase } from '@/services/supabase';
import { useAuthStore } from '@/stores/authStore';

export function useAuthSession() {
  const session = useAuthStore((s) => s.session);
  const setSession = useAuthStore((s) => s.setSession);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });
    return () => sub.subscription.unsubscribe();
  }, [setSession]);

  const signOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
  };

  return { session, loading, signOut };
}
```

- [ ] **Step 3: 로그인 화면에서 Edge Function 연결**

`loginWithKakao()`로 받은 카카오 액세스 토큰을 Edge Function에 POST하고, 받은 세션을 `supabase.auth.setSession(...)`으로 심은 뒤 `router.replace('/profile')`:

```tsx
// mobile/src/app/login.tsx (수정)
import { View, Button, Text } from 'react-native';
import { router } from 'expo-router';
import { loginWithKakao } from '@/features/auth/kakaoLogin';
import { supabase } from '@/services/supabase';

const EDGE_FUNCTION_URL = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/kakao-custom-token`;

export default function LoginScreen() {
  const onPress = async () => {
    const kakaoAccessToken = await loginWithKakao();
    const res = await fetch(EDGE_FUNCTION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kakaoAccessToken }),
    });
    const body = await res.json();
    if (!res.ok) {
      console.error('kakao-custom-token 실패', body);
      return;
    }
    await supabase.auth.setSession({ access_token: body.access_token, refresh_token: body.refresh_token });
    router.replace('/profile');
  };

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <Text>산책냥</Text>
      <Button title="카카오로 시작하기" onPress={onPress} />
    </View>
  );
}
```
(실기기에서는 `EXPO_PUBLIC_SUPABASE_URL`이 `127.0.0.1`이면 폰이 PC에 못 닿는다 — 같은 와이파이의 PC 내부 IP로 바꿔야 함.)

- [ ] **Step 4: 프로필 화면 (RLS 왕복 증명)**

```tsx
// mobile/src/app/profile.tsx
import { useEffect, useState } from 'react';
import { View, Text, Button } from 'react-native';
import { useAuthSession } from '@/features/auth/useAuthSession';
import { supabase } from '@/services/supabase';

export default function ProfileScreen() {
  const { session, signOut } = useAuthSession();
  const [nickname, setNickname] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    supabase
      .from('profiles')
      .select('nickname')
      .eq('user_id', session.user.id)
      .single()
      .then(({ data, error }) => {
        if (error) console.error('profile fetch failed (RLS?)', error);
        else setNickname(data?.nickname ?? null);
      });
  }, [session]);

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <Text>{nickname ? `안녕, ${nickname}` : '불러오는 중...'}</Text>
      <Button title="로그아웃" onPress={signOut} />
    </View>
  );
}
```
이 화면이 `nickname`을 실제로 보여주면, RLS(`profiles_select_authenticated`)를 통과해서 진짜 인증된 세션으로 DB를 읽은 것 — 이 플랜의 핵심 증명.

- [ ] **Step 5: authStore 테스트**

```ts
// mobile/src/stores/__tests__/authStore.test.ts
import { useAuthStore } from '../authStore';

test('setSession이 상태를 갱신한다', () => {
  const fakeSession = { user: { id: 'abc' } } as any;
  useAuthStore.getState().setSession(fakeSession);
  expect(useAuthStore.getState().session).toBe(fakeSession);
});
```

- [ ] **Step 6: 실행**

Run: `cd mobile && npx jest src/stores/__tests__/authStore.test.ts`
Expected: 1 passed.

Run: `cd mobile && npx tsc --noEmit && npx expo lint && npx jest --ci`
Expected: 전부 0/통과(기존 스모크 테스트 포함).

- [ ] **Step 7: 커밋**

```
git add mobile
git commit -m "feat(mobile): wire Kakao login to Supabase session, add profile screen"
```

---

## 마지막 — 사람이 직접 확인해야 하는 것 (자동화 불가)

서브에이전트가 여기까지 마치면, **사람이 실기기 또는 Expo Go/시뮬레이터에서 직접**:
1. `supabase functions serve kakao-custom-token`이 켜진 상태에서 `npx expo start`
2. 로그인 화면에서 "카카오로 시작하기" 탭 → 실제 카카오 계정으로 로그인
3. 프로필 화면에 "안녕, 고양이집사..." 문구가 뜨는지 확인 (뜨면 성공, 콘솔에 RLS 에러 뜨면 실패)

이걸 통과해야 이 플랜이 진짜로 끝난 것 — 4개 태스크의 리뷰가 전부 통과해도 이 수동 확인 전엔 "완료"라고 보고하지 말 것.

## Self-Review 메모 (다음 플랜 — 여기 범위 아님)

- 지도 홈 화면(카카오맵 WebView 브리지), 온보딩 플로우, `submit-checkin` 등은 별도 "핵심 루프" 플랜.
- 구글/애플 로그인은 카카오와 같은 패턴을 재사용하되 별도 플랜(또는 이 플랜 완료 후 추가 태스크).
- 실제 호스팅 Supabase 프로젝트 배포·EAS 빌드는 출시 준비 플랜.
