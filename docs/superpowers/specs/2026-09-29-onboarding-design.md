# 온보딩 — 설계

> 2026-09-29 · 서브프로젝트 ⑤ (①체크인 코어 ✓ → ②지도 홈 ✓ → ③체크인 UX ✓ → ④안개·고양이 ✓ → **⑤온보딩** → ⑥나머지)
> 근거: `기획-기능명세-v1.md` §2.2, `고양이-세계관-설계-v1.md` §4, `기획-카피톤-v1.md` §3.1, 체크인 흐름 `2026-09-28-checkin-ux-design.md`, 고양이·안개 `2026-09-29-fog-cat-design.md`

## 목표

처음 로그인한 사람이 2분 안에 **내 고양이를 정하고, 권한을 켜고, 내 동네를 확인하고, 루프를 배우고, 첫 발자국을 찍은 채** 지도에 도착한다. 끝나는 순간 지도가 비어 있지 않다.

**성공 기준**
- 온보딩을 마치지 않은 로그인 사용자는 지도 대신 온보딩으로 간다. 마치면 다시 안 나온다.
- 권한을 거절해도, GPS가 실패해도 막다른 화면 없이 끝까지 간다.
- 중간에 앱을 끄면 다시 켤 때 저장된 상태로 판단한 단계부터 이어간다.
- 고른 털색의 고양이가 지도에서 걷는다.
- 저장·검증은 서버가 한다(이름·색·동네 값 검사).

## 결정 사항

| 결정 | 값 | 이유 |
|---|---|---|
| 범위 | 기획 그대로 8단계(알림 권한·내 동네 포함) | 사용자 선택 |
| 털색 | `cheese` 치즈 · `gray` 회색 · `black` 까망, 무늬 없음 | 사용자 선택. 그림 한 장 → 스크립트가 색만 바꿔 3장 |
| 이름 | 앞뒤 공백 제거 후 1~10자 | 말풍선·배지에 들어갈 길이 |
| 알림 권한 | 권한만 받는다(`expo-notifications` 추가). 토큰 등록·발송은 ⑥ | 기획 순서 유지. iOS "항상 허용"(위치) 강요 없음 |
| 내 동네 | 카카오 `coord2regioncode`(행정동 H) 추정 + 카카오 주소 검색으로 수정. `users.home_address`에 "시군구 동" 텍스트로 저장 | 경계 데이터(④) 없이도 동작. 좌표 저장은 쓰는 곳이 생길 때 |
| 완료 표시 | `users.onboarded_at timestamptz` | 기획의 `profile_complete` |
| 이어하기 | 단계 기록을 따로 두지 않고 **상태에서 판단** | 서버 값·OS 권한이 곧 진행 상황 — 어긋날 일이 없음 |
| 뒤로가기 | 없음(앞으로만). 하드웨어 뒤로가기는 무시 | 2분짜리 흐름. 수정은 ⑥ 프로필 설정 |

## 흐름

| # | 화면 | 카피(카피톤 §3.1) | 버튼 | 건너뛰는 조건(이어하기) |
|---|---|---|---|---|
| 1 | 환영 | "안녕하냥! 나랑 같이 우리 동네를 누벼볼까냥?" | [시작할게요] | 없음(항상) |
| 2 | 고양이 정하기 | "이 친구, 이름을 지어줄래냥? 털색도 골라보라냥." | 이름 입력, 털색 3칸, [이 친구로 할게요] | 고양이 이름이 이미 있음 |
| 3 | 위치 권한 | "어디를 다녀왔는지 알아야 발자국을 남길 수 있다냥. 위치를 켜줄래냥?" | [켜기] [나중에] | 위치 권한을 이미 물어봄(허용·거절 모두) |
| 4 | 알림 권한 | "도착하면 내가 살짝 알려줄게냥. 알림만 켜두면 된다냥." | [켜기] [나중에] | 알림 권한을 이미 물어봄 |
| 5 | 내 동네 | "여기가 우리 동네가 맞냥?" + **사직동** | [맞아요] [다른 동네예요] | 동네가 이미 저장됨 |
| 6 | 튜토리얼 3컷 | ① "다녀온 곳에 발자국을 남기고" ② "발자국이 쌓이면 아지트가 자란다냥" ③ "안개가 걷히면 내가 뛰어놀 곳이 넓어진다냥." | 좌우로 넘기기, 마지막에 [알겠어요] | 없음 |
| 7 | 첫 발자국 | "자, 지금 여기. 첫 발자국을 남겨볼까냥?" | [발자국 남기기] [나중에 할게요] | 아지트가 이미 있음 |
| 8 | (완료) | — | — | `complete_onboarding()` 후 지도로 |

- 2: 이름이 비었거나 10자를 넘으면 버튼 비활성 + "이름은 1~10자로 지어주세요". 털색을 누르면 위쪽 고양이 미리보기가 그 색으로 바뀐다. 기본 선택은 치즈.
- 3·4: "나중에"와 거절은 같은 취급(다음 단계로). 버튼을 누를 때만 OS 팝업이 뜬다.
- 5: 위치가 있으면 GPS 한 번 → 동네 추정. 실패·권한 없음·국외 → 바로 검색 모드. 검색 모드: "우리 동네 이름을 알려주세요" + 입력(예: "사직동") → 후보 최대 10개("서울 종로구 사직동") → 탭하면 저장.
- 7: ③의 `useCheckin`·`CheckinSheet`·`Celebration`을 그대로 쓴다. 축하 문구는 이미 "🐾 첫 발자국이 찍혔다냥. 여기서부터 시작이냥."(발자국 1개일 때). 축하를 닫으면 완료 처리. 실패 안내(GPS 약함 등)가 뜨면 [나중에 할게요]로 끝낼 수 있다. 위치 권한이 없으면 7은 "위치를 켜면 첫 발자국을 남길 수 있다냥" + [설정 열기] [나중에 할게요].

## 서버

### 데이터
- `users.onboarded_at timestamptz` 추가(null = 온보딩 안 함).
- `profiles.cat_color`는 이미 있음 — 값은 `cheese|gray|black`, 체크 제약 추가. `cat_pattern`은 안 씀.
- `users.home_address`(이미 있음)에 동네 텍스트 저장 — RPC로 길이 검사(최대 40자). 검사를 우회하지 않게 `authenticated`의 `home_address` 직접 update 권한은 회수(다른 곳에서 쓰지 않음).

### RPC (security definer, 본인 행만, `authenticated`만 실행)
- `save_cat(p_name text, p_color text)` → void. 이름 trim 1~10자, 색 3종 아니면 예외 `invalid_cat`. `profiles`의 `cat_name`, `cat_color` 갱신.
- `set_home_dong(p_name text)` → void. trim 1~40자 아니면 `invalid_dong`.
- `complete_onboarding()` → void. `onboarded_at = coalesce(onboarded_at, now())`.
- `my_onboarding()` → jsonb `{ onboarded: bool, catName: text|null, catColor: text|null, homeDong: text|null, hasHideout: bool }` — 라우팅·이어하기·지도 고양이 색의 재료.

### Edge Function `home-region` (로그인 필요)
- `POST { lat, lng }` → `{ dongs: [{ name: "서울 종로구 사직동" }] }` — 카카오 `coord2regioncode`의 `region_type: "H"` 한 개. 없으면 빈 배열.
- `POST { query }` → 카카오 `search/address`(`analyze_type=similar`, size 10) 결과를 "시도 시군구 동" 문자열로, 중복 제거, 최대 10개. `query`는 trim 1~20자, 아니면 400.
- 카카오 실패·타임아웃(2초) → `{ dongs: [] }`(앱은 검색 모드/"못 찾았다냥"로).
- 이름 문자열: 카카오의 `region_1depth_name`은 "서울특별시"처럼 길어서 그대로 붙인다(짧게 줄이지 않음 — 정확성 우선).

## 앱

### 라우팅 (`src/app/_layout.tsx`)
- 로그인 후 `my_onboarding()`을 한 번 읽어 `onboarded`로 가드:
  - `session && !onboarded` → `onboarding` 화면
  - `session && onboarded` → `(tabs)`
- 읽는 동안은 스플래시 유지(깜빡임 방지). 실패 → "앗, 잠깐 문제가 생겼다냥. 다시 해볼까냥?" + [다시 시도].
- 완료 시 상태를 `onboarded: true`로 바꾸면 가드가 지도로 보낸다.

### 온보딩 (`src/app/onboarding.tsx` + `src/features/onboarding/`)
- `firstStep(state)`: 순수 함수. 서버 상태 + 권한 상태 → 시작 단계. `nextStep(step, state)`: 다음 단계(건너뛰기 조건 반영). 이 둘이 이어하기 규칙의 전부 — 테스트 대상.
- 화면 조각: `Welcome`, `CatStep`, `PermissionStep`(위치·알림 공용: 카피·요청 함수만 다름), `HomeDongStep`, `Tutorial`, `FirstFootprintStep`. 각 조각은 `onDone()`만 부른다.
- 서버와의 대화는 `onboardingApi.ts` 하나(`myOnboarding`, `saveCat`, `setHomeDong`, `completeOnboarding`, `regionAt`, `searchRegion`).

### 고양이 털색
- `make_cat.py`가 `CAT_IMAGES: Record<CatColor, string>`를 만든다: 원본 = 치즈, 흑백 = 회색, 흑백을 어둡게 = 까망. 그림 없을 땐 임시 그림으로 3종.
- 지도: `MapBridge`에 `catColor` prop → `buildMapHtml`의 `cat`에 그 색 그림. 값은 `my_onboarding().catColor`, 없으면 치즈.

## 엣지

- 이름에 공백만/이모지만 → trim 후 길이 검사(이모지 1개 = 1자로 셈: `Array.from(name).length`, 서버는 `char_length`).
- 저장 실패(네트워크) → 그 화면에 "앗, 잠깐 문제가 생겼다냥. 다시 해볼까냥?", 입력 유지, 버튼 다시 누를 수 있음.
- 동네 검색 결과 0 → "음, 못 찾았다냥. 다른 이름으로 찾아볼까냥?"(카피톤).
- 온보딩 중 로그아웃/세션 만료 → 기존 가드가 로그인으로.
- 이미 아지트가 있는 기존 계정 → 2·5단계만 하고 7 건너뜀.

## 테스트

- **pgTAP** `onboarding.test.sql`: `save_cat` 정상/이름 0·11자/공백만/잘못된 색 → `invalid_cat`, 남의 프로필 안 바뀜; `set_home_dong` 길이; `complete_onboarding` 두 번 불러도 처음 시각 유지; `my_onboarding` 값; 직접 `profiles` update 불가.
- **Deno** `home-region`: 좌표 → H 행정동 이름, 검색 → 중복 제거·10개 제한, 잘못된 query 400, 카카오 실패 → 빈 배열.
- **jest**: `firstStep`/`nextStep`(각 건너뛰기 조건), `CatStep`(검증·색 미리보기·저장 실패), `PermissionStep`(허용/거절 모두 다음으로), `HomeDongStep`(추정 성공/실패→검색/0건), 첫 발자국 완료→`completeOnboarding`, 라우팅 가드, `MapBridge`가 털색 그림을 싣는지.
- **실기기**: 권한 팝업 순서, 키보드가 이름 입력을 가리지 않는지, 튜토리얼 넘기기.

## 범위 밖

무늬, 온보딩 뒤로가기, 프로필에서 고양이·동네 바꾸기(⑥), 알림 토큰 등록·발송(⑥), 동네 좌표 저장, 튜토리얼 애니메이션(정적 그림+카피).
