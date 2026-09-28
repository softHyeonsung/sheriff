# 체크인 UX — 설계

> 2026-09-28 · 서브프로젝트 ③ (①체크인 코어(서버) ✓ → ②지도 홈 ✓ → **③체크인 UX** → ④안개·고양이 상주 → ⑤온보딩 → ⑥나머지)
> 근거: `기획-기능명세-v1.md` §2.5, `기획-카피톤-v1.md` §3.1·§3.3·§3.4·§3.7, `DESIGN.md` §3(모션: 성장 축하=정점), 서버 계약 `docs/superpowers/specs/2026-09-25-checkin-core-design.md`

## 목표

지도에서 "발자국 남기기"를 누르면, 지금 있는 곳이 어디인지 확인하고("여기 ○○ 맞나요?"), 발자국을 찍고, 아지트가 자라는 순간을 축하한다. 이게 붙으면 **걸어가서 → 찍고 → 자라는** 첫 핵심 루프가 폰에서 돈다.

**성공 기준**
- 버튼 → 후보 확인 → 발자국 → 축하 → 지도 마커 갱신까지 막힘 없이 이어진다.
- 서버 거절(멂·GPS 약함·쿨다운)은 전부 해요체 안내로 바뀌고, 막다른 화면이 없다.
- 연타해도 발자국은 한 번만 요청된다.
- 규칙 판정은 전부 서버(①). 앱은 위치를 보내고 결과를 보여줄 뿐이다.

## 흐름

1. 지도 하단 가운데 **"발자국 남기기"** 버튼(항상 보임). 지오펜스·근접 자동 진입은 ⑥.
2. 탭 → **그 순간의 정확한 위치**(`expo-location` `getCurrentPositionAsync`, 높은 정확도)를 새로 받는다. 지도의 위치 점(오래됐을 수 있음)은 쓰지 않는다.
   - 위치 권한 없음 → ②의 권한 배너와 같은 안내 + 설정 열기.
   - 정확도가 나빠 `weak_gps` → "잠깐, 위치를 확인하고 있어요…"로 **자동 1회 재시도**, 그래도 약하면 그 문구 + [다시 시도].
3. `suggest-place` → 체크인 시트(바텀시트, 약관 시트와 같은 모양):
   - **확인 화면:** "여기 **○○** 맞나요?"(첫 후보). 내 아지트면 등급 그림 + "지금까지 N번 다녀왔어요".
     - [발자국 남기기] → 그 장소로 기록.
     - [다른 곳이에요] → 목록 화면.
   - **목록 화면:** 후보 최대 5곳(이름·거리 "약 40m") + 맨 아래 **"여기에 새로 만들기"**(이름 = 현재 도로명주소, 없으면 "이름 없는 골목").
   - 후보가 하나도 없으면 바로 목록 화면(새로 만들기만).
4. `submit_checkin` → 성공 → **축하 화면** → 닫으면 아지트 목록 새로고침(지도 마커 갱신).
5. 실패 → 시트 안에 안내, 시트는 열린 채(다른 후보 고르기·다시 시도 가능).

## 보내는 target

| 선택 | `p_target` |
|---|---|
| 내 아지트 | `{ kind: 'mine', aidutId }` |
| 카카오 장소 | `{ kind: 'kakao', placeId, name, lat, lng, roadAddress }` |
| 여기에 새로 만들기 | `{ kind: 'new', roadAddress: hereAddress }` |

## 문구

| 상황 | 문구 |
|---|---|
| 버튼 | 발자국 남기기 |
| 확인 질문 | 여기 ○○ 맞나요? |
| 다른 곳 | 다른 곳이에요 |
| 새로 만들기 | 여기에 새로 만들기 |
| 위치 확인 중 / GPS 약함 | 잠깐, 위치를 확인하고 있어요… |
| 너무 멂 | 조금만 더 가까이 가면 발자국을 남길 수 있어요. |
| 쿨다운 | 여긴 아까 다녀왔어요. H시 M분부터 다시 남길 수 있어요. (현지 시각) |
| 그 외 | 앗, 잠깐 문제가 생겼어요. 다시 해볼까요? |
| 첫 발자국(새 아지트) | 🐾 첫 발자국이 찍혔어요. 여기서부터 시작이에요. |
| 등급업 → box | 여기 박스가 생겼어요 📦 마음에 드나 봐요. |
| 등급업 → hut | 작은 집이 됐어요 🛖 자주 오시는군요. |
| 등급업 → tower | 캣타워예요 🗼 여긴 우리 단골이네요. |
| 등급업 → palace | 🏰 캣 팰리스. 여긴 당신의 인생 장소예요. |
| 같은 등급 | 🐾 발자국을 남겼어요 + (다음 단계 힌트, ②의 `nextStageHint`) |
| 축하 닫기 | 좋아요 |

"첫 발자국" 판정: 결과 `footprintCount === 1`.

## 구조 (`mobile/src/features/checkin/`)

- `checkinApi.ts` — 서버와 말하는 유일한 곳.
  - `suggestPlace(lat, lng, accuracy)` → `supabase.functions.invoke('suggest-place', { body })`(로그인 세션 자동 첨부). 반환 = ①의 `SuggestResult`.
  - `submitCheckin(lat, lng, accuracy, target)` → `supabase.rpc('submit_checkin', …)`. 반환 = `{ aidutId, name, footprintCount, grade, gradeChanged, newCellsCleared }`.
  - 거절 → `CheckinError` `{ code: 'too_far' | 'weak_gps' | 'cooldown' | 'not_yours' | 'unknown', nextAt?: string }`. `cooldown`의 `nextAt`은 Postgres 예외의 `details`(ISO 문자열).
- `useCheckin()` — 상태 기계 `idle → locating → choosing → submitting → celebrating | failed`. 진행 중엔 새 요청을 받지 않는다(연타 방지).
- `celebrationCopy(result, thresholds)` — 축하 문구 선택(순수 함수).
- `CheckinSheet.tsx` — 확인/목록 화면.
- `Celebration.tsx` — 새 등급 그림 스프링 팝(~600ms) + 소프트 파티클 + 햅틱(`expo-haptics`, 신규 설치). 모션 줄이기 설정이면 애니메이션 없이 최종 상태.
- 지도 화면 `(tabs)/index.tsx` — 버튼·시트·축하 조립, 축하 닫힘 → `useMyHideouts().retry()`.

## 테스트 (jest, 폰 불필요)

- `checkinApi`: 각 서버 에러 → 코드, 쿨다운 `nextAt`, 성공 결과 형태, suggest 응답 전달.
- `useCheckin`: GPS 약함 1회 자동 재시도 → 안내, 후보 0개 → 목록(새로 만들기만), 성공 → celebrating, 거절별 문구, 진행 중 두 번째 요청 무시.
- `celebrationCopy`: 첫 발자국, 등급업 4종, 같은 등급(+힌트).
- `CheckinSheet`: 첫 후보 확인 → 그 target, 다른 곳 → 목록, 카카오/내 아지트/새로 만들기 각 target 형태, 거리 표기.
- `Celebration`: 문구, 햅틱 호출, 모션 줄이기.
- 지도 화면: 버튼 → 시트, 축하 닫기 → 새로고침.

실기기에서만: 실제로 걸어가 찍기, 축하 모션·햅틱의 느낌.

## 범위 밖

순간 남기기 📷(사진), 오프라인 큐, 지오펜스 알림·근접 자동 진입(⑥), 안개 걷힘 연출(④ — `newCellsCleared`는 받아만 둠), 아지트 상세 화면.
