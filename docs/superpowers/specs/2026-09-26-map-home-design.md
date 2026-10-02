# 지도 홈 — 설계

> 2026-09-26 · 서브프로젝트 ② (①체크인 코어(서버) 완료 → **②지도 홈** → ③체크인 UX → ④안개·고양이 상주 → ⑤온보딩 → ⑥나머지)
> 근거: `기획-기능명세-v1.md` §1(IA: 탭=지도/프로필)·§2.3·§3.5, `기술-아키텍처-v1.md` §1(지도=카카오맵 JS SDK → WebView)·§3(`src/map/` 단일 브리지, `protocol.ts` union+가드), `DESIGN.md`, `기획-카피톤-v1.md`

## 목표

앱을 열면 홈이 **내 영역 지도**다. 카카오맵 위에 내 위치와 **내 아지트 마커**(5단계 그림)가 보이고, 마커를 탭하면 아래 카드로 그 아지트 이야기를 본다.

**성공 기준**
- 로그인 후 첫 화면 = 지도 탭. 탭은 **지도 / 프로필** 2개.
- 내 아지트가 등급별 그림·크기로 제자리에 뜬다. 남의 아지트는 안 뜬다(①의 RLS).
- 마커 탭 → 카드: 이름 · 등급 그림 · "지금까지 N번 다녀왔다냥" · 다음 단계 힌트.
- 위치 권한 거부·지도 로드 실패·아지트 0개·아지트 조회 실패 어느 경우에도 막다른/빈 슬픈 화면이 없다.
- WebView로 들어가는 모든 데이터는 타입 검사된 메시지로만, 아지트 이름은 HTML이 아니라 텍스트로만 그려진다(XSS 방지).

## 결정 사항

| 결정 | 값 | 출처 |
|---|---|---|
| 지도 엔진 | 카카오맵 JavaScript SDK를 `react-native-webview`에 주입. `react-native-maps` 안 씀 | 아키텍처 §1 |
| WebView 출처 | `baseUrl: 'http://localhost'` 고정 — 카카오 콘솔 웹 플랫폼에 이 도메인 등록 | 설계 결정 |
| 키 | `EXPO_PUBLIC_KAKAO_JS_KEY`(JavaScript 키, 공개 식별자) | 설계 결정 |
| 탭 | `(tabs)` = 지도(홈) · 프로필. 템플릿 Home/Explore 제거, 기존 `/profile`(RLS 증명 화면)을 프로필 탭으로 | 명세 §1 |
| 위치 | `expo-location` 포그라운드만. 백그라운드·지오펜스는 ⑥ | 설계 결정 |
| 마커 탭 | 하단 카드(이름·등급·N번·다음 단계 힌트). 카카오 장소 정보(영업시간·사진·리뷰)는 공식 API에 없어 넣지 않음 | 사용자 결정 |
| 마커 그림 | 🐾발자국·📦박스·🛖작은 집 = 사용자 제공 이미지. 🗼캣타워·🏰캣 팰리스 = 사용자가 추후 제공, 그전엔 임시 그림 | 사용자 결정 |

## 마커 이미지

- 원본: `고양이집.png`(작은 집, 검은 배경+빛번짐), `박스.png`(크림 배경), `1084899.png`(발자국, 흰 배경 검은 실루엣).
- 가공(한 번, 결과물을 `mobile/assets/markers/`에 커밋):
  - 작은 집·박스: 배경 제거 → 투명 PNG. 작은 집의 빛번짐 가장자리가 남지 않게 확인.
  - 발자국: 모양 유지, 색만 `color.primary` 앰버 `#E6A552`로.
  - 전부 여백 잘라 정사각형 128×128.
- 파일: `paw.png`, `box.png`, `hut.png`, `tower.png`, `palace.png`(뒤 둘은 임시 — 교체 시 파일만 바꾸면 됨).
- 지도 표시 크기(px): paw 36 · box 44 · hut 52 · tower 60 · palace 68.
- WebView는 앱 파일에 접근하지 않으므로 이미지를 data URI로 HTML에 넣는다(각 128px라 작음).
- 라이선스: 발자국·박스 이미지는 출처 확인 필요 — 스토어 출시 전 상업적 사용 가능 여부를 사용자가 확인.

## 구조

### 지도 브리지 `mobile/src/map/` (지도를 만지는 유일한 곳)

- `protocol.ts` — 메시지 타입과 검사기.
  - 앱 → 지도: `{ type: 'setHideouts', hideouts: { id, lat, lng, grade }[] }` · `{ type: 'setMyLocation', lat, lng, accuracy }` · `{ type: 'panTo', lat, lng }`
  - 지도 → 앱: `{ type: 'ready' }` · `{ type: 'hideoutTap', id }` · `{ type: 'error', reason }`
  - `parseMapMessage(raw: string): MapToApp | null` — JSON 아니거나, 모르는 `type`이거나, 필드 타입이 틀리면 `null`(버림).
- `markers.ts` — `markerFor(grade) → { uri, size }`.
- `webview-template.ts` — `buildMapHtml({ jsKey, markers, center })` → HTML 문자열. 카카오 SDK 로드, 앱 메시지 수신, 마커 탭 시 `hideoutTap` 전송. 아지트 이름은 지도로 보내지 않는다(카드는 앱이 그림) → 이름이 HTML로 해석될 경로 자체가 없음.
- `MapBridge.tsx` — WebView 래퍼. props: `hideouts`, `myLocation`, `onHideoutTap(id)`, `onError(reason)`; ref로 `panTo`.

### 기능·화면

- `features/map/useMyHideouts()` — 내 아지트(`id, name, grade, footprint_count, lat, lng`) 조회. 화면 포커스마다 새로고침. `{ hideouts, status: 'loading' | 'ready' | 'error', retry }`.
  - 좌표는 `aidut.coord`(geography)라 그대로 못 읽음 → ①처럼 SQL 함수 `my_hideouts()`(security invoker, 본인 것만, `st_y/st_x`로 lat/lng)를 하나 추가해 RPC로 읽는다.
- `features/map/useMyLocation()` — 권한 요청 + 현재 위치. `{ location, permission: 'granted' | 'denied' | 'undetermined' }`.
- `features/map/nextStageHint(grade, footprintCount, thresholds)` — 다음 단계 문구. 임계값은 `app_config.grade_thresholds`에서 읽는다(서버와 같은 값).
- `app/(tabs)/index.tsx` — 지도 화면: 훅 + `MapBridge` + 하단 카드 + "내 위치로" 버튼 + 상태 배너.
- `app/(tabs)/profile.tsx` — 기존 프로필 화면 이동.

## 문구

| 상황 | 문구 |
|---|---|
| 카드 발자국 수 | "지금까지 N번 다녀왔다냥" |
| 다음 단계 힌트 | "N번 더 오면 ○○이 된다냥" (한 번 남았으면 "한 번 더 오면 여기가 ○○이 된다냥") |
| 최고 단계 | "🏰 캣 팰리스다냥. 여긴 네 인생 장소냥." |
| 아지트 0개 | "아직 발자국이 없다냥. 가까운 곳부터 같이 가볼까냥?" |
| 위치 권한 거부 | "위치를 켜두면 지금 있는 곳을 보여줄게냥" + [설정 열기] |
| 지도 로드 실패 | "지도를 불러오지 못했다냥. 다시 해볼까냥?" + [다시 시도] |
| 아지트 조회 실패 | "아지트를 불러오지 못했다냥" + [다시 시도] |

등급 이름: paw 발자국 · box 박스 · hut 작은 집 · tower 캣타워 · palace 캣 팰리스. (조사 "이/가"는 받침에 맞춤: "박스가", "작은 집이".)

## 상태·엣지

- 위치 권한 거부 → 지도는 열림. 중심 = 내 아지트들(있으면) 또는 서울시청(37.5665, 126.978). 배너 + 설정 열기.
- 위치 조회 실패/느림 → 지도 막지 않음. 위치 점은 잡히면 표시.
- 지도(WebView) 로드 실패(오프라인, JS 키·도메인 오류) → 재시도 화면. 원인은 로그로만.
- 아지트 조회 실패 → 지도는 열리고 상단 한 줄 + 다시 시도.
- 잘못된/알 수 없는 WebView 메시지 → 조용히 버림.

## 테스트 (jest, 폰 불필요)

- `protocol.ts`: 정상 메시지 통과, 이상한 `type`·필드 누락·틀린 타입·JSON 아닌 문자열 → `null`.
- `markers.ts`: 5등급 → 그림·크기.
- `webview-template.ts`: JS 키가 HTML에 들어감, 템플릿에 아지트 이름이 들어갈 자리가 없음(이름 필드 미전송 확인).
- `nextStageHint`: 경계(1→box까지 1번, 4→hut까지 1번, 19→palace 1번, 20+ 최고 단계), 조사.
- `useMyHideouts` / `useMyLocation`: 성공·실패·권한 거부.
- 지도 화면: 마커 탭 → 카드, 아지트 0개 문구, 권한 거부 배너, 지도 로드 실패 → 재시도.
- pgTAP: `my_hideouts()`가 본인 것만, lat/lng 정확.

실기기에서만 확인되는 것: 지도가 실제로 그려지는지, 카카오 JS 키·도메인 등록.

## 사용자가 할 일

1. 카카오 디벨로퍼스 → 플랫폼 → **Web** → 사이트 도메인에 `http://localhost` 등록.
2. `mobile/.env.local`에 `EXPO_PUBLIC_KAKAO_JS_KEY=<JavaScript 키>`.
3. 새 네이티브 모듈(WebView·Location) → dev build 다시 빌드.
4. 🗼캣타워·🏰캣 팰리스 이미지 제공(그전엔 임시 그림). 발자국·박스 이미지 라이선스 확인.

## 범위 밖

안개·고양이 상주·개척률(④), 체크인 버튼·시트·축하(③), 탐색 모드·검색·위시리스트·코스(⑥), 아지트 상세 화면(사진·추억), 오프라인 지도 캐시, 백그라운드 위치.
