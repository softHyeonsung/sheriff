# 약관 동의 (명세 2.1) — 설계

> 2026-09-25 · 근거: `기획-기능명세-v1.md` §2.1, `기능명세-재개발기준.md` AUTH-06, `기술-아키텍처-v1.md` §4(`kakao-custom-token`: 유저 upsert + 약관 재검증), `DESIGN.md`, `기획-카피톤-v1.md`
> 전제: 카카오 네이티브 SDK → `kakao-custom-token` → Supabase 세션 파이프라인(`docs/superpowers/plans/2026-09-23-auth-kakao-login.md`) 완료 상태.

## 목표

신규 가입자는 필수 약관에 동의하기 전에는 **계정이 만들어지지 않는다.** 동의는 서버가 재검증하고, 언제 어느 버전에 동의했는지 기록한다. 이미 동의한 사용자는 새 기기에서도 다시 보지 않는다.

**성공 기준**
- 동의 없는 신규 요청 → `auth.users`/`public.users`/`profiles`에 아무 행도 생기지 않는다.
- 동의 후 재요청 → 세션 발급 + `users.terms_agreed_at`, `users.terms_version` 기록.
- 동의 완료 사용자의 재로그인(새 기기 포함) → 시트 없이 바로 세션.
- 앱은 약관 버전을 모른다 — 서버가 준 버전을 되돌려줄 뿐. 버전 불일치 요청은 거절.

## 동의 항목 (전부 필수)

1. 만 14세 이상이에요 — 14세 미만은 가입 불가(법정대리인 동의 플로우 없음). 개인정보보호법 §22의2, 위치정보법 §25 대응. 출시 전 법무 확인 권장.
2. 이용약관
3. 개인정보 수집·이용
4. 위치기반서비스 이용약관

## 서버

### 계약 (`kakao-custom-token`)

`POST { kakaoAccessToken: string, agreedTermsVersion?: string }`

| 상황 | 응답 |
|---|---|
| 토큰 무효/다른 앱 | `500 { error }` (기존과 동일) |
| 동의 필요 + `agreedTermsVersion` 없음 또는 현재 버전과 다름 | `412 { error: 'terms_required', termsVersion: <현재 버전> }` — 아무것도 생성하지 않음 |
| 동의 불필요, 또는 현재 버전으로 동의 | `200 { access_token, refresh_token }` |

"동의 필요" = `public.users`에 해당 `kakao_id` 행이 없거나, 있어도 `terms_agreed_at IS NULL`.

현재 약관 버전은 Edge Function 안의 상수 하나(`TERMS_VERSION = '2026-09-25'`)가 유일한 출처.

### 순서

1. 카카오 토큰 검증(`access_token_info`, `app_id` 일치) → `kakaoId` (기존)
2. `select uid, terms_agreed_at from users where kakao_id = $kakaoId` (service role)
3. 동의 필요한데 버전이 맞지 않음 → 412, 종료
4. 기존 흐름: createUser(app_metadata.kakao_id) → generateLink → `assertKakaoOwner` → verifyOtp
5. `users` upsert에 `kakao_id` 포함, 이번 요청에서 동의했다면 `terms_agreed_at = now()`, `terms_version = TERMS_VERSION`
6. `profiles` 기본 닉네임 1회 시드(기존)

판정은 순수 함수 `termsDecision(userRow, agreedVersion, currentVersion) → 'ok' | 'record' | 'required'`로 뽑아 단위 테스트한다.

### 마이그레이션 (`public.users`)

- `kakao_id bigint unique` — 합성 이메일 대신 쓰는 직접 조회 키. 계정을 만들기 **전에** 동의 여부를 확인하려면 필요.
- `terms_version text` — 동의한 약관 버전(나중에 약관이 바뀌면 이전 버전 동의자만 재동의 대상으로 가려내기 위함).
- 컬럼 권한 변경 없음: 본인 행 읽기만, `authenticated`의 update는 `home_address`만. 새 컬럼은 service role(Edge Function)만 쓴다.

## 앱

### 로그인 로직 (`features/auth/kakaoLogin.ts`)

- `loginWithKakao(): Promise<string>` — 그대로.
- `signInWithKakao()` 대신 `exchangeKakaoToken(kakaoAccessToken, agreedTermsVersion?)`:
  - 200 → `setSession` 후 `{ status: 'signed_in' }`
  - 412 `terms_required` → `{ status: 'terms_required', termsVersion }`
  - 그 외 → throw
- 로그인 화면은 동의 대기 중 카카오 토큰과 `termsVersion`을 state로 들고 있다가 재요청한다(카카오 재로그인 없음).

### 약관 시트 (`features/auth/TermsSheet.tsx`)

- 로그인 화면 위 바텀시트(radius 24, 안개 아트는 위에 보이게). 제목 "시작하기 전에 확인해 주세요".
- "모두 동의할게요" 전체 토글 + 필수 4개 체크박스. 약관 3개 항목은 "보기" → `expo-web-browser`로 인앱 열기.
- "동의하고 시작하기" — 4개 모두 체크 전엔 비활성, 처리 중엔 스피너.
- 닫기(백버튼/바깥 탭) = 조용히 취소. 계정 없음, 로그인 화면 유지.
- 재요청 실패 → 기존 오류 문구("앗, 잠깐 문제가 생겼어요. 다시 해볼까요?"), 체크 상태 유지.
- 토큰: 체크 = `color.primary`, 탭 타깃 ≥ 44pt, 체크박스 `accessibilityRole="checkbox"` + checked 상태.
- 링크 URL 3개는 `constants/terms.ts` 한 곳. **지금은 임시 주소** — 스토어 제출 전 실제 페이지로 교체.

## 테스트

- Deno: `termsDecision` 4경우(행 없음 / 미동의 / 동의 완료 / 버전 불일치).
- Jest:
  - `exchangeKakaoToken`: 200 → setSession, 412 → `terms_required`, 그 외 → throw.
  - `TermsSheet`: 4개 모두 체크 전 버튼 비활성, 전체 동의가 전부 토글.
  - 로그인 화면: 412 → 시트 표시, 동의 → 버전 포함 재요청 → `/profile`.
- 로컬 스택에서 수동: 신규 카카오 계정으로 412 확인 후 동의 → `users` 행의 `kakao_id`/`terms_agreed_at`/`terms_version` 확인.

## 범위 밖

- 선택(마케팅) 동의 — v1엔 마케팅 알림 없음.
- 14세 미만 법정대리인 동의 플로우.
- 약관 개정 시 재동의 플로우(`terms_version`으로 대상 판별만 가능하게 해 둠).
- 약관 원문 작성·호스팅.
