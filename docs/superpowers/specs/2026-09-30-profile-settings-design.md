# 프로필 설정 — 설계

> 2026-09-30 · 서브프로젝트 ⑥-4 (⑥-1 도착 알림 ✓ → ⑥-2 오프라인 큐 ✓ → ⑥-3 순간 남기기 ✓ → **⑥-4 프로필 설정** → ⑥-5 위시리스트·코스)
> 근거: `기획-기능명세-v1.md` §2.8("고양이(이름/외형 변경) · 내 동네 · 알림 설정 · 로그아웃 · 계정(탈퇴/약관)"), `기획-카피톤-v1.md` §4(로그아웃·탈퇴 문구), `출시용-v1-범위정의.md` DoD 5(스토어 제출), 온보딩 `2026-09-29-onboarding-design.md`, 도착 알림 `2026-09-29-arrival-alert-design.md`

## 목표

온보딩에서 닉네임을 정하게 하고(랜덤 추천), 프로필 탭(지금은 개발용 확인 화면)을 실제 설정 화면으로 바꾼다. 닉네임·고양이·동네를 바꾸고, 도착 알림을 켜고 끄고, 약관을 보고, 로그아웃·탈퇴할 수 있다. 탈퇴는 앱 안에서 즉시 모든 데이터를 지운다(스토어 규칙).

**성공 기준**
- 닉네임을 바꾸면 규칙(2~12자, 한글·영문·숫자·밑줄)과 중복(대소문자 무시)을 서버가 검사하고, 겹치면 "다른 집사가 쓰고 있다냥"를 보여준다.
- 고양이 이름·털색을 바꾸면 지도 고양이 색이 바로 바뀐다. 동네를 바꾸면 프로필에 바로 보인다.
- 도착 알림 스위치: 켜면 권한을 차례로 묻고 감시를 등록, 끄면 감시·예약 알림을 멈추고 지도를 열어도 다시 켜지지 않는다.
- 탈퇴하면 서버의 내 모든 데이터(아지트·발자국·사진 기록·사진 파일·안개·동의·프로필)와 로그인 계정이 지워지고, 폰 데이터도 지워지고, 로그인 화면으로 간다.
- 온보딩에서 닉네임을 정한다. [🎲 다른 이름]을 누를 때마다 단어를 조합한 새 추천이 나온다(몇 번이든).
- 카카오 회원번호도, 앱 내부 id도 닉네임으로 드러나지 않는다(자동으로 만든 기본 닉네임 자체를 없앤다).

## 결정 사항

| 결정 | 값 | 이유 |
|---|---|---|
| 닉네임 규칙 | 앞뒤 공백 제거 후 2~12자, 한글(완성형)·영문·숫자·`_`만 | 짧고 부르기 좋게, 나중에 SNS에서 검색 가능하게 |
| 닉네임 중복 | 겹치지 않게(`lower(nickname)` 유일) | 사용자 선택. SNS 단계 대비 |
| 기본 닉네임 | **없음.** 가입 때 닉네임을 비워 두고(`profiles.nickname` null 허용) 온보딩에서 정한다. 기존 `고양이집사{카카오번호}`는 null로 바꾼다 | 카카오 번호·내부 id 노출 방지 |
| 온보딩 닉네임 단계 | 환영 다음, 고양이 앞. 닉네임이 이미 있으면 건너뜀(이어하기 규칙) | 사용자 요청 |
| 랜덤 추천 | 폰에서 "형용사 + 명사" 조합(고양이·골목 말투, 띄어쓰기 없음, 규칙 안 길이). 형용사 30개 × 명사 30개 = 900가지. 누를 때마다 새로(직전과 다르게). 겹치는지는 저장할 때 서버가 본다 → 겹치면 안내 + 새 추천을 자동으로 채움 | 단순. 서버 왕복 없이 계속 뽑을 수 있다 |
| 프로필 사진 | 없음 | SNS 단계에서 |
| 탈퇴 | **즉시 삭제**(유예 없음) | 사용자 선택. 단순, 스토어 규칙 충족 |
| 탈퇴 방식 | Edge Function `delete-account`(서비스 키): 사진 파일 비우기 → 로그인 계정 삭제 → DB는 연쇄 삭제 | 계정 삭제는 서비스 키가 필요 |
| 연쇄 삭제 | `aidut.owner_uid` 외래키를 `on delete restrict` → `cascade`로 | 지금은 아지트가 있으면 계정 삭제가 막힌다 |
| 카카오 연결 | 탈퇴 뒤 `unlink()` 시도(실패해도 진행) | 다시 가입할 때 동의부터 새로 |
| 알림 끔 기록 | 도착 알림 저장 파일에 `disabled: true` | 지도 재등록이 다시 켜지 않게 |
| 화면 재사용 | 온보딩 `CatStep`·`HomeDongStep`에 처음 값 prop과 버튼 문구 prop을 더해 설정에서도 쓴다 | 같은 규칙·같은 화면 |

## 화면

### 온보딩 닉네임 단계 (`features/onboarding/NicknameStep.tsx`)
- 카피: "뭐라고 불러줄까냥?" · 보조 "2~12자, 한글·영문·숫자·_"
- 입력칸(처음부터 랜덤 추천이 채워져 있음) + [🎲 다른 이름] + [이걸로 할게요].
- 저장 오류는 아래 "닉네임 바꾸기"와 같은 문구. `nickname_taken`이면 새 추천을 채워 준다.
- 순서: 환영 → **닉네임** → 고양이 → 위치 → 알림 → 동네 → 튜토리얼 → 첫 발자국.

### 프로필 탭 (`app/(tabs)/profile.tsx`)
위에서부터:
1. **닉네임** — 닉네임 크게 + [바꾸기]. 없으면(온보딩 전에 가입한 계정) "아직 닉네임이 없다냥" + [정하기].
2. **내 고양이** — 털색 그림, 이름, 털색 이름 + [바꾸기].
3. **내 동네** — 동 이름(없으면 "아직 정하지 않았다냥") + [바꾸기].
4. **도착 알림** — 스위치 + 설명 "아지트 근처에 도착하면 알려줄게냥". 권한이 영구 거절이면 "설정에서 위치를 '항상 허용'으로 바꿔주세요" + [설정 열기].
5. **약관** — 이용약관 · 개인정보 처리방침 · 위치정보 이용약관(각각 링크, `TERMS_LINKS`).
6. **로그아웃** — 확인 창 "로그아웃할까냥?" [로그아웃] [취소] → 로그아웃(폰 데이터 정리 포함).
7. **계정 탈퇴** — 작은 글씨 버튼. 확인 창 "정말 떠나냥? 그동안 함께 누빈 동네와 순간들이 모두 지워진다냥." [떠나기(파괴적)] [취소].
   - 진행 중 "떠나는 중…", 실패하면 "지금은 떠날 수 없다냥. 잠시 뒤 다시 해볼까냥?"(데이터는 그대로).

### 닉네임 바꾸기 (`app/settings/nickname.tsx`)
온보딩 닉네임 단계와 같은 화면(`NicknameStep`, 처음 값 = 지금 닉네임, 버튼 "저장할게요"). [🎲 다른 이름]도 그대로. 저장 오류:
- `invalid_nickname` → "2~12자의 한글·영문·숫자·_ 로 지어주세요."
- `nickname_taken` → "다른 집사가 쓰고 있다냥. 다른 이름은 어때냥?"
- 그 밖 → 기존 공통 문구.
성공하면 뒤로.

### 고양이·동네 바꾸기 (`app/settings/cat.tsx`, `app/settings/home.tsx`)
`CatStep`(`initialName`, `initialColor`, `cta="저장할게요"`) / `HomeDongStep`(`cta="이 동네로 할게요"` 등 기존 흐름 그대로). 저장 성공 → `meStore` 갱신 → 뒤로.

세 화면 모두 로그인·온보딩 끝난 사용자만(`tabs`와 같은 가드).

## 도착 알림 스위치

- 켜져 보이는 조건: 백그라운드 위치 권한 `granted` **그리고** `disabled`가 아님.
- 켜기: `disabled: false`로 기록 → `answerArrivalOffer(true)`와 같은 순서로 권한 요청(알림 → 위치 → 항상 허용) → 허용되면 지도 저장본 아지트로 `syncArrivalRegions` → 스위치 켜짐. 권한 팝업이 더 안 뜨는 상태(`canAskAgain === false`)면 설정 안내.
- 끄기: `disabled: true` 기록 → 감시 멈춤 + 예약된 도착 알림 취소.
- `syncArrivalRegions`는 `disabled`면 아무것도 안 한다. 축하 뒤 권한 카드(`shouldOfferArrival`)도 `disabled`면 안 띄운다.
- 화면으로 돌아올 때마다(포커스) 상태를 다시 읽는다(폰 설정에서 권한을 바꿨을 수 있음).

## 서버

마이그레이션 1개:
- `aidut.owner_uid` 외래키: drop 후 `references public.users(uid) on delete cascade`로 다시.
- 닉네임:
  - `profiles.nickname`의 `not null`을 뗀다. 기존 `고양이집사%` 닉네임은 null로.
  - `create unique index profiles_nickname_lower_key on public.profiles (lower(nickname))`.
  - `set_nickname(p_name text) returns void` — `security definer`. 앞뒤 공백 제거, `^[가-힣A-Za-z0-9_]{2,12}$` 아니면 `invalid_nickname`, 유일 위반이면 `nickname_taken`(자기 자신과 같으면 통과).
- `my_onboarding()`에 `nickname` 추가(프로필 화면이 같이 읽는다).

`kakao-custom-token`: 프로필 행은 만들되 닉네임은 넣지 않는다(null).

Edge Function `delete-account`(POST, 본문 없음):
1. `Authorization` 헤더의 사용자 토큰으로 사용자 확인. 없거나 틀리면 401.
2. 서비스 키로 `storage.from('memories').list(uid)` → 전부 `remove`(100개씩 반복).
3. `auth.admin.deleteUser(uid)` → `public.users` 이하 연쇄 삭제.
4. `{ ok: true }`. 실패하면 500(앱은 데이터 그대로라고 안내).

## 앱 흐름: 탈퇴

1. 확인 → `functions.invoke('delete-account')`.
2. 성공 → `clearLocalData()`(대기열·지도 저장본·도착 알림·사진) → 카카오 `unlink()` 시도 → `supabase.auth.signOut({ scope: 'local' })`(서버 세션은 이미 없음) → 로그인 화면(가드가 자동으로).
3. 실패 → 안내, 아무것도 안 지움.

## 파일

| 파일 | 역할 |
|---|---|
| `supabase/migrations/2026093000000x_profile_settings.sql` | 연쇄 삭제·닉네임 규칙·`set_nickname`·`my_onboarding` |
| `supabase/functions/delete-account/index.ts` (+ `index.test.ts`) | 탈퇴 |
| `supabase/functions/kakao-custom-token/index.ts` | 기본 닉네임 |
| `features/profile/profileApi.ts` | `setNickname`, `deleteAccount` |
| `features/profile/nickname.ts` | 닉네임 규칙(서버와 같음) + `randomNickname()`(단어 목록) |
| `features/onboarding/NicknameStep.tsx` | 닉네임 정하기(온보딩·설정 공용) |
| `features/onboarding/steps.ts`·`app/onboarding.tsx` | 닉네임 단계 추가 |
| `features/profile/useArrivalSwitch.ts` | 스위치 상태·켜기·끄기 |
| `features/arrival/store.ts`·`register.ts` | `disabled` 기록·존중, `setArrivalEnabled` |
| `features/auth/useAuthSession.ts` | `deleteAccount` 흐름(정리·unlink·로그아웃) |
| `features/onboarding/CatStep.tsx`·`HomeDongStep.tsx` | 처음 값·버튼 문구 prop |
| `stores/meStore.ts`·`onboardingApi.ts` | `nickname` |
| `app/(tabs)/profile.tsx` | 설정 화면 |
| `app/settings/{nickname,cat,home}.tsx` | 바꾸기 화면 |
| `app/_layout.tsx` | 설정 화면 가드 |

## 오류 처리

- 저장 실패(네트워크 등) → 화면에 공통 문구, 입력값 유지.
- 스위치 켜기 중 권한 거절 → 스위치 꺼진 채, 설정 안내.
- 탈퇴 실패 → 데이터 그대로, 안내. 탈퇴 성공 뒤 폰 정리·unlink 실패는 로그만(이미 계정은 없다).

## 테스트

- pgTAP: `set_nickname`(규칙·중복·대소문자·자기 자신), 닉네임 null 허용·기존 기본 닉네임 null로, 사용자 삭제 시 아지트·발자국·사진 기록·안개·프로필 연쇄 삭제, `my_onboarding`의 `nickname`.
- Deno: `delete-account` — 토큰 없음 401, 사진 파일 목록 비우기(여러 번), 계정 삭제 호출, 실패 500.
- Deno: `kakao-custom-token`이 닉네임을 넣지 않는다.
- jest: 닉네임 규칙, `randomNickname`(항상 규칙 통과·직전과 다름·여러 번 뽑으면 다양), 닉네임 화면(처음 추천·🎲 다른 이름·오류 문구별·겹치면 새 추천), 온보딩 순서(닉네임 있으면 건너뜀), 고양이·동네 화면(처음 값·저장 후 meStore·뒤로), 스위치(켜기 권한 순서·거절·설정 안내·끄기·disabled면 재등록 안 함·카드 안 띄움), 프로필 화면(표시·로그아웃 확인·탈퇴 확인·진행·실패 안내), 탈퇴 흐름(순서: 서버 → 정리 → unlink → 로그아웃, 실패 시 아무것도 안 함).
- 실기기(진행상황 문서에 추가): 닉네임 중복, 고양이 색 바꾸고 지도 확인, 스위치 끄고 아지트 근처에서 알림 없는지, 탈퇴 후 같은 카카오로 다시 가입하면 약관부터.

## 범위 밖

- 프로필 사진 — SNS 단계.
- 탈퇴 유예 기간.
- 앱 버전 표시.
- 약관 원문(임시 주소) — 출시 전 사람이 작성·호스팅.
