# 안개 + 고양이 상주 + 동네 단계 — 설계

> 2026-09-29 · 서브프로젝트 ④ (①체크인 코어 ✓ → ②지도 홈 ✓ → ③체크인 UX ✓ → **④안개·고양이 상주** → ⑤온보딩 → ⑥나머지)
> 근거: `기획-기능명세-v1.md` §2.3·§4.3, `고양이-세계관-설계-v1.md` §3, `기획-카피톤-v1.md` §3.1·§3.4, `기술-아키텍처-v1.md` §6.3, 서버 계약 `2026-09-25-checkin-core-design.md`

## 목표

지도가 처음엔 안개로 덮여 있고, 발자국을 찍은 칸만 걷힌다. 걷힌 칸 사이를 내 고양이가 어슬렁거린다. 지도 가운데 동네의 **개척률 %**와 **동네 단계**(🌫️→👑)가 보이고, 발자국으로 단계가 오르면 축하한다. 이게 붙으면 "집에서 앱을 열 이유"(걷힌 내 영역을 고양이가 도는 걸 보는 즐거움)와 거시 성장 축이 생긴다.

**성공 기준**
- 발자국 찍은 칸만 안개가 걷히고, 찍은 직후 지도에서 바로 걷힌다.
- 고양이는 걷힌 칸 안에서만 움직인다. 걷힌 칸이 없으면 안 보인다.
- 지도를 멈추면 가운데 동의 "○○동 · 단계 · 개척률 N%"가 뜬다. 동 경계 밖이면 배지를 숨긴다.
- 발자국으로 동네 단계가 오르면 축하 화면에 거시 문구가 함께 나온다.
- 모든 집계는 서버가 한다(클라이언트는 표시만).

## 결정 사항

| 결정 | 값 | 이유 |
|---|---|---|
| 범위 | 안개 + 고양이 + 동네 단계 + 개척률 전부 | 사용자 선택 |
| 기준 동 | **지도 가운데** 좌표가 속한 행정동 | 사용자 선택. 온보딩 "내 동네" 없이도 동작 |
| 동 경계 | 통계청 행정동 경계 GeoJSON(공개 가공본 `vuski/admdongkor` 최신판) → `admin_dongs` | 카카오 API는 경계를 안 줌 |
| 개척률 | `걷힌 칸 수(칸 중심이 그 동 안) ÷ ceil(동 면적 ÷ 칸 면적)`, 0~100% 상한 | 동을 칸으로 쪼개지 않고 면적으로 나눔 — 결과 거의 같고 가벼움 |
| 동네 단계 | 그 동 안의 **내 아지트 수**: 0~2 `fog` 🌫️ 안개 낀 골목 · 3~7 `sprout` 🌱 개척지 · 8~15 `cozy` 🏘️ 아늑한 동네 · 16~30 `cat` 🐾 고양이 영역 · 31+ `kingdom` 👑 고양이 왕국 | 명세 §4.3 초안. 임계값은 `app_config.dong_stage_thresholds` |
| 안개 렌더 | 카카오 `Polygon` 한 개 = 한국 전체를 덮는 사각형 + 걷힌 칸마다 구멍 | 지도 SDK 기본 기능, 줌·이동 자동 추종 |
| 고양이 | WebView 안 `CustomOverlay` 이미지, JS로 칸 사이 걷기/쉬기 | 지도 좌표와 같이 움직여야 해서 WebView 안에서 처리 |
| 고양이 그림 | 사용자가 이미지를 주면 교체, 그전엔 앰버 임시 그림 | 🏰 때와 같은 방식 |
| 칸 크기 | `fog_cell_m` 100 — **데이터가 쌓인 뒤엔 바꾸지 않는다** | 칸 ID가 크기에 묶여 있어 바꾸면 기존 칸이 어긋남 |

## 서버

### 데이터

- 신규 `admin_dongs (code text pk, name text, sido text, sigungu text, geom geometry(MultiPolygon, 5179), area_m2 float8)`, GIST 인덱스. 로그인 사용자 읽기 허용, 쓰기는 service role만.
  - 적재: `supabase/scripts/load_admin_dongs.py <geojson>` — 4326 GeoJSON을 읽어 `ST_Transform(…, 5179)`로 넣는다(upsert, 재실행 안전). 로컬·배포 공용. 마이그레이션엔 데이터 안 넣음(수십 MB).
- `app_config`에 `dong_stage_thresholds {sprout:3, cozy:8, cat:16, kingdom:31}` 추가.
- 칸 ID → 칸 중심/사각형 계산 함수 `fog_cell_geom(cell_id) returns geometry(Polygon, 5179)` — `"x:y"`와 `fog_cell_m`로 사각형 생성.

### 함수 (전부 RPC, invoker 권한 → RLS가 본인 것만)

**`my_fog()`** → `table (cell_id text, sw_lat, sw_lng, ne_lat, ne_lng float8)` — 걷힌 칸마다 4326 경계 사각형(남서·북동 모서리). 5179 정사각형을 4326으로 바꾸면 살짝 기울지만 100m에서 무시할 수준.

**`dong_at(p_lat, p_lng)`** → jsonb 또는 null(경계 밖):
```
{ code, name, stage, hideoutCount, exploredCells, totalCells, ratio }  // ratio = 0~100 정수(내림)
```
- 동 판정: `ST_Contains(geom, 점)`.
- `hideoutCount`: 내 `aidut` 중 좌표가 그 동 안.
- `exploredCells`: 내 `fog_cells` 중 칸 중심이 그 동 안.

**`dong_stage(p_count int)`** → text, `aidut_grade`처럼 `app_config`에서 임계값을 읽고 키가 빠지면 예외.

**`submit_checkin` 변경** — 반환에 `dong` 추가:
```
dong: { name, stage, stageChanged } | null   // 아지트 좌표가 동 경계 밖이면 null
```
`stageChanged` = 이번 발자국으로 **새 아지트가 생겨** 그 동의 아지트 수가 임계값을 넘었을 때. (기존 아지트 재방문은 수가 안 바뀌므로 항상 false.)

## 앱

### 지도 프로토콜 (`protocol.ts`)

- App→Map: `{ type: 'setFog', cells: FogCell[] }` (`FogCell = { sw: LatLng, ne: LatLng }`), `{ type: 'catSay', text: string }`.
- Map→App: `{ type: 'idle', center: LatLng }` (지도 이동/줌이 멈출 때), `{ type: 'catTap' }`.
- 새 메시지도 `parseMapMessage`의 검증을 거친다(숫자 범위 체크 포함).

### 안개 (`webview-template.ts`)

- 바깥 경로 = 한국 전체를 넉넉히 덮는 사각형(위도 32~39.5, 경도 124~132). 구멍 = 걷힌 칸 사각형들. 채움 앰버-회색 반투명(토큰 `fog`), 테두리 없음.
- `setFog`가 오면 폴리곤을 통째로 새로 그린다. 마커·내 위치 점·고양이는 안개 위(zIndex).
- ponytail: 칸마다 구멍 하나 — 수천 칸이면 느려질 수 있음. 그때 서버에서 인접 칸 합치기(`ST_Union`).

### 고양이 (`webview-template.ts` + `src/features/cat/`)

- 걷힌 칸 목록에서 무작위 칸을 골라 그 안의 무작위 점으로 **천천히 걷고**(지도 좌표 보간, 약 4초) **쉬기**(3~8초) 반복. 걷는 방향으로 좌우 반전. 칸이 바뀌면(setFog) 다음 목적지부터 새 목록을 쓴다.
- 처음 위치: 내 위치와 가장 가까운 걷힌 칸.
- 탭 → 앱에 `catTap` → 앱이 말풍선 문구를 골라 `catSay`로 보냄 → 고양이 위에 3초 말풍선.
  - 문구(`기획-카피톤-v1.md` §3.1): 개척률 < 100이면 "저쪽 골목은 아직 안개예요. 같이 가볼까요?"와 "우리 동네, 오늘도 조용하고 좋네요."를 번갈아, 100이면 후자만. 문구 고르기는 순수 함수(`pickCatLine`)로 테스트.
- 그림: `mobile/assets/cat/cat.png` → `make_markers.py`와 같은 방식으로 base64 생성(`--cat` 인자 추가). 없으면 앰버 임시 그림.
- 이름·색은 ⑤. 여기선 하나 고정.

### 동네 배지 (`src/features/territory/DongBadge.tsx`)

- 지도 위쪽 가운데 알약 모양: "**○○동** · 🌱 개척지 · 개척률 12%".
- `idle` 이벤트마다 `dong_at(center)` 호출(300ms 디바운스, 이전 요청 결과는 버림). null이면 숨김. 실패하면 이전 값 유지(조용히).
- 단계 이름·이모지 표는 `src/features/territory/stages.ts` 하나에.

### 체크인 연결

- 체크인 성공 후(축하 닫을 때 아지트 새로고침하는 그 자리) `my_fog()`도 다시 불러 `setFog`, 배지도 다시 조회.
- 축하 화면: `dong.stageChanged`면 기존 축하 아래 한 줄 추가 — "우리 동네가 이제 **아늑한 동네**가 됐어요." (카피톤 §3.4). 단계 `fog`로의 변화는 없음(시작 단계).

### 로딩

지도 `ready` 후 `my_hideouts`와 `my_fog`를 함께 불러 보낸다. `my_fog` 실패 → 안개 없이 지도는 보이게(조용히), 다음 새로고침 때 재시도.

## 엣지

- 동 경계 데이터가 아직 안 들어간 환경 → `dong_at`이 null → 배지 숨김, `submit_checkin`의 `dong`도 null. 체크인은 정상.
- 걷힌 칸 0 → 한국 전체가 안개, 고양이 없음, 배지는 "개척률 0%".
- 한국 밖 → 안개 사각형 밖이라 안개 없음. 배지 null. (v1은 한국 전용.)
- 두 동 경계에 걸친 칸 → 칸 중심이 있는 동 하나에만 센다.

## 테스트

- **pgTAP** (`fog_territory.test.sql`): 테스트용 작은 사각형 동 2개를 직접 insert해서
  - `fog_cell_geom`이 `fog_cell_id`로 만든 칸을 다시 감싼다.
  - `my_fog`가 본인 칸만, 경계 사각형이 원래 좌표를 포함.
  - `dong_at`: 안/밖/경계 밖 null, 개척률 계산, 단계 임계값, 남의 아지트·칸은 안 셈.
  - `dong_stage` 키 빠짐 → 예외.
  - `submit_checkin`: 새 아지트로 임계값 넘으면 `stageChanged` true, 재방문은 false, 경계 밖이면 `dong` null.
- **jest**: 프로토콜 파싱(새 메시지·잘못된 값 거절), `pickCatLine`, `DongBadge`(표시/숨김/실패 시 유지), 축하 화면 거시 문구, 체크인 뒤 fog 새로고침.
- **실기기**(자동 테스트로 못 봄): 안개 모양·구멍, 줌 시 따라오는지, 고양이 걷기/말풍선, 성능(칸 수백 개).

## 사람이 할 일 (진행상황.md에 추가)

- 행정동 경계 GeoJSON 받기 + 라이선스(출처 표기) 확인 → `python supabase/scripts/load_admin_dongs.py <파일>`
- 고양이 이미지 주기

## 범위 밖

밤낮·날씨 행동, 고양이 감정 상태, "여러 동" 영역 단계, 개척률 캐시 테이블(`territory` — 느려지면), 인접 칸 합치기, 고양이 이름·색(⑤), 미개척지로 안내하는 코스(⑥).
