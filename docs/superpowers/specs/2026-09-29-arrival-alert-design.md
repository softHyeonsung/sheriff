# 지오펜스 도착 알림 — 설계

> 2026-09-29 · 서브프로젝트 ⑥-1 (⑥ = 도착 알림 → 오프라인 큐 → 순간 남기기 📷 → 프로필 설정 → 위시리스트·코스)
> 근거: `기획-기능명세-v1.md` §3.1, `기술-아키텍처-v1.md` §6.1, `기획-카피톤-v1.md` §3.2, 체크인 흐름 `2026-09-28-checkin-ux-design.md`, 알림 권한 `2026-09-29-onboarding-design.md`

## 목표

내 아지트 근처에 도착해 잠깐 머물면, 앱이 꺼져 있어도 알림이 온다. 알림을 누르면 바로 체크인 흐름이 열린다. 핵심 루프 "도착 → 알림 → 체크인"의 빈칸을 채운다.

**성공 기준**
- 아지트 반경 150m 안에 2분 머물면 알림 1개. 스쳐 지나가면(2분 안에 나감) 알림 없음.
- 6시간 안에 발자국을 남긴 곳·이미 알림 받은 곳, 하루 8번 초과, 밤 10시~아침 8시엔 알림 없음.
- 알림을 누르면 지도 탭이 열리고 체크인이 시작된다.
- "항상 허용"을 거절해도, 알림 권한이 없어도 앱은 그대로 돈다.
- 서버·FCM·기기 토큰 없이 폰 안에서 끝난다(오프라인에서도 알림).

## 결정 사항

| 결정 | 값 | 이유 |
|---|---|---|
| 방식 | **폰 안에서 처리**: OS 지오펜스(`expo-location` + `expo-task-manager`) → 로컬 알림(`expo-notifications`) | 도착은 폰이 먼저 안다. 서버 푸시(FCM)는 토큰·키·위치 전송만 늘림. 기술 문서 §6.1의 FCM 경로를 대체 |
| "항상 허용" 요청 시점 | 축하 화면 뒤, 그 아지트 발자국이 **2개 이상**이 된 첫 순간에 카드 한 번 | 다시 올 이유를 막 느낀 순간. 온보딩 강요 금지(기획 §3.1) |
| 카드 노출 | 답과 상관없이 **평생 한 번**(폰에 기록) | 조르지 않는다. 다시 켜는 길은 ⑥-4 프로필 설정 |
| 감시 대상 | 등록할 때 내 위치에서 가까운 아지트 **20곳**, 반경 150m(`checkin_radius_m`와 같은 값) | iOS 한도 20개. 찜은 ⑥-5에서 합류 |
| 재등록 시점 | 지도에서 아지트를 불러올 때마다(포커스) | 쓰면 쓸수록 가까운 20곳으로 갱신 |
| 체류 | 진입 시 **2분 뒤** 알림 예약, 이탈 시 취소 | OS 진입 이벤트만으로 체류 흉내. 백그라운드에서 타이머를 돌리지 않음 |
| 규칙 값 | 체류 2분 · 장소별 6시간 · 하루 8번 · 야간 22~08시 — **앱 코드 상수** | 서버에서 바꿀 일 생기면 그때 `app_config`로 |
| 서버 변경 | `my_hideouts`에 `last_visited_at`(마지막 발자국 시각) 추가 | "6시간 안에 발자국" 판단용 |
| 저장소 | `expo-file-system`에 JSON 파일 하나(감시 목록 + 알림 기록) | SecureStore는 값 2KB 한도, 백그라운드에서도 읽혀야 함 |

## 흐름

### 1. 권한 카드
체크인 축하 화면이 닫힐 때, 아래가 모두 참이면 카드를 띄운다.
- 결과 `footprintCount >= 2`
- 카드를 본 적 없음(`arrivalOfferSeen` 기록 없음)
- 백그라운드 위치 권한이 아직 허용 아님

카피: **"다음에 여기 오면 제가 알려드릴까요?"** · 보조 "앱을 안 켜도 알려드리려면 위치를 '항상 허용'으로 바꿔주세요." · [좋아요] [괜찮아요]

- [좋아요] → 알림 권한이 없으면 먼저 요청 → `requestBackgroundPermissionsAsync()` → 허용되면 바로 등록(아래 2).
- 어느 버튼이든 `arrivalOfferSeen` 기록. 거절해도 안내 문구 없이 닫는다.

### 2. 등록 (`syncArrivalRegions`)
지도에서 아지트 목록을 불러온 뒤 호출한다. 백그라운드 위치 권한이 없으면 아무것도 안 한다.
1. 기준점 = 마지막으로 알고 있는 내 위치(`getLastKnownPositionAsync`), 없으면 목록 첫 아지트.
2. `pickNearest(hideouts, 기준점, 20)` → 가까운 순 20곳.
3. 저장 파일의 `regions`를 `{id: {name, grade, lastVisitedAt}}`로 덮어쓴다.
4. `Location.startGeofencingAsync(TASK, regions)` — 같은 태스크 이름으로 다시 부르면 목록이 교체된다. 아지트가 0곳이면 `stopGeofencingAsync`.

### 3. 백그라운드 태스크 (`arrival-geofence`)
`TaskManager.defineTask`는 앱 진입점(`_layout.tsx`) 최상단에서 import되는 모듈에서 정의한다(앱이 꺼진 채 깨어나도 정의돼 있어야 함).

- **진입**: 저장 파일을 읽어 `decideArrival(지금, 아지트, 기록)` → 보낼 거면 `scheduleNotificationAsync`(2분 뒤, `identifier = "arrival:<id>"`, 채널 `arrival`, `data: {hideoutId}`) 후 기록에 `예약` 남김.
- **이탈**: `cancelScheduledNotificationAsync("arrival:<id>")`, 기록에서 그 예약 제거(보낸 걸로 세지 않음).

`decideArrival`은 순수 함수. 알림 **발송 예정 시각**(진입 + 2분) 기준으로 판단한다.
- 야간(22:00 ≤ 시 또는 시 < 08:00) → 안 보냄
- `lastVisitedAt`이 6시간 안 → 안 보냄
- 그 아지트에 6시간 안에 보냈거나 예약된 알림 → 안 보냄
- 오늘(기기 시간 자정 기준) 보냈거나 예약된 알림 8개 이상 → 안 보냄

기록은 이탈로 취소되지 않은 예약을 "보냄"으로 센다. 7일 넘은 기록은 저장할 때 버린다.

### 4. 알림 문구 (카피톤 §3.2)
- 기본: **"{아지트 이름} 오셨네요. 발자국 남길까요?"**
- 단골(등급 `hut` 이상): **"또 왔네요, {아지트 이름}. 여기 자주 오시네요 :)"**
- 찜 첫 방문 문구는 ⑥-5에서.

### 5. 알림을 누르면
지도 탭(`(tabs)/index.tsx`)에서 `Notifications.useLastNotificationResponse()`를 본다. 도착 알림 응답이 새로 들어오면(같은 응답을 두 번 처리하지 않게 identifier+날짜로 기억) `checkin.start()`. 기존 흐름이 가까운 내 아지트를 첫 후보로 보여주므로 화면 추가 없음. 온보딩·로그인 화면이면 무시(지도 탭이 없으니 자연히 무시됨).

## 서버

마이그레이션 1개: `my_hideouts()`를 drop 후 재생성, 반환에 `last_visited_at timestamptz` 추가(= 그 아지트 발자국 중 가장 최근 `created_at`, 없으면 null). 권한·정렬은 그대로.

## 앱 설정

- `expo-task-manager` 추가, `expo-file-system` 직접 의존성으로 명시.
- `app.json`의 `expo-location` 플러그인: `locationAlwaysAndWhenInUsePermission` 문구 + `isIosBackgroundLocationEnabled: true`, `isAndroidBackgroundLocationEnabled: true`.
- 문구: "아지트 근처에 도착하면 알려드리려고 앱을 안 켜도 위치를 확인해요."
- **네이티브 변경 → dev build 다시 만들기 필요.**

## 파일

| 파일 | 역할 |
|---|---|
| `features/arrival/rules.ts` | `decideArrival`, `pickNearest`, `arrivalMessage` — 순수 함수 |
| `features/arrival/store.ts` | 저장 파일 읽기/쓰기(`regions`, `log`, `offerSeen`) |
| `features/arrival/task.ts` | `defineTask` + 진입/이탈 처리 |
| `features/arrival/register.ts` | `syncArrivalRegions`, 권한 확인/요청 |
| `features/arrival/ArrivalOffer.tsx` | 권한 카드 |
| `features/map/useMyHideouts.ts` | `lastVisitedAt` 받기, 로드 후 `syncArrivalRegions` |
| `app/(tabs)/index.tsx` | 카드 띄우기, 알림 탭 → `checkin.start()` |
| `app/_layout.tsx` | `task.ts` import |

## 오류 처리

- 태스크 안의 모든 오류는 잡아서 `console.error`만 — 태스크가 던지면 OS가 다음 이벤트를 안 줄 수 있다.
- 저장 파일이 없거나 깨졌으면 빈 값으로 시작(알림 한 번 더 가는 쪽이 앱이 멈추는 쪽보다 낫다).
- 등록 실패(권한 바뀜 등)는 조용히 넘어가고 다음 포커스에 다시 시도.

## 테스트

- jest: `decideArrival`(야간 경계 22:00/08:00, 6시간 경계, 하루 8번, 취소된 예약은 안 셈), `pickNearest`(20개 자르기·거리순), `arrivalMessage`(등급별 문구), 카드 노출 조건, 알림 응답 → `checkin.start()` 1번만.
- pgTAP: `my_hideouts`가 `last_visited_at`을 최근 발자국 시각으로, 발자국 없으면 null.
- 실기기(진행상황 문서에 추가): 앱 끈 채 아지트 도착 2분 → 알림, 1분 만에 떠나면 알림 없음, 알림 탭 → 체크인 시트, 야간엔 안 옴, 카드 한 번만.

## 범위 밖

- 서버 푸시(FCM)·기기 토큰 — 다른 사람 관련 알림이 생기면.
- 규칙 값 서버 조정 — 필요해지면 `app_config`로.
- 알림 켜기/끄기 스위치 — ⑥-4 프로필 설정.
- 찜한 곳 알림 — ⑥-5 위시리스트.

**알려진 한계:** 감시 목록은 앱을 열 때만 갱신된다. 앱을 오래 안 열고 먼 동네로 가면 그곳 아지트는 감시 대상이 아닐 수 있다(아지트가 20곳을 넘을 때만 해당). 필요해지면 "큰 원(내 위치 반경) 이탈 시 재등록"을 추가.
