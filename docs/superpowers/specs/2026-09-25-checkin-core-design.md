# 체크인 코어 (서버) — 설계

> 2026-09-25 · 서브프로젝트 ① / 핵심 루프 분해: ①체크인 코어(서버) → ②지도 홈 → ③체크인 UX → ④안개·고양이 상주 → ⑤온보딩 → ⑥나머지(지오펜스 알림·오프라인·사진·위시리스트·코스)
> 근거: `기획-기능명세-v1.md` §2.5·§3.3·§4, `고양이-세계관-설계-v1.md` §2~3, `기술-아키텍처-v1.md` §4~6
> 범위: **서버 규칙과 데이터만.** 화면(지도·체크인 시트·축하 연출·안개 렌더)은 ②③④.

## 목표

사용자가 실제로 간 곳에 발자국을 찍으면, 그 장소의 **내 아지트**가 5단계로 자라고 주변 안개 한 칸이 걷힌다. 규칙은 전부 서버가 판정하고(클라이언트는 믿지 않음), 한 번의 트랜잭션으로 기록된다.

**용어:** 아지트 = 내가 발자국을 찍은 장소. 발자국 수에 따라 🐾발자국(1) → 📦박스(2~4) → 🛖작은 집(5~9) → 🗼캣타워(10~19) → 🏰캣 팰리스(20+).

**성공 기준**
- 150m 밖·GPS 약함·쿨다운 중·남의 아지트 → 거절, DB 변화 없음.
- 성공 시 발자국 1건 + 아지트 카운트/등급 갱신 + 안개 셀 기록이 **전부 또는 전무**.
- 같은 자리 "새로 만들기" 반복·연타 → 아지트 중복 없음, 발자국 1건.
- 카카오 API 장애여도 체크인 가능.
- 폰 없이 로컬 스택 + 자동 테스트로 전부 검증.

## 결정 사항

| 결정 | 값 | 출처 |
|---|---|---|
| 아지트 소유 | **사용자별.** 같은 장소도 사람마다 별개, 내 발자국만 내 아지트를 키움. 본인 것만 조회 | 사용자 결정 |
| 장소 판정 | 좌표로 후보를 찾고 **"여기 ○○ 맞냥?"** 확인. 아니면 **주변 후보 목록(최대 5)** 에서 선택, 맨 끝은 "여기에 새로 만들기" | 사용자 결정 |
| 근접 반경 | 150m | 명세 §3.3 |
| GPS 정확도 게이트 | accuracy > 150m → 보류 | 명세 §3.3 |
| 재방문 쿨다운 | 같은 아지트 6시간 (아지트별) | 명세 §4.2 "6h 또는 1일" 중 6h, `app_config`로 조정 |
| 아지트 합치기 | 같은 사용자 아지트 15m 이내면 같은 아지트 | 명세 §4.4 |
| 안개 셀 | 약 100m × 100m 격자(EPSG:5179 기준), 발자국 좌표가 속한 셀 1칸 | 설계 결정, `app_config`로 조정 |
| 구조 | 후보 조회 = Edge Function `suggest-place`(카카오 키 은닉), 기록 = Postgres 함수 `submit_checkin`(RPC, 단일 트랜잭션) | 설계 결정 — 아키텍처 문서의 "`submit-checkin` Edge Function"을 RPC로 바꿈: 여러 쓰기를 한 트랜잭션에 묶고 pgTAP으로 직접 검증하기 위함 |

## 서버 인터페이스

### `suggest-place` (Edge Function, 로그인 필요)

입력 `{ lat, lng, accuracy }` →

- `accuracy > 150` → `{ status: 'weak_gps' }` (후보 없음)
- 그 외 → `{ status: 'ok', hereAddress: string | null, candidates: Candidate[] }` — `hereAddress`는 현재 좌표의 도로명주소(카카오 좌표→주소, 실패 시 null), 후보는 거리순 최대 5개:
  - 내 아지트 150m 이내: `{ kind: 'mine', aidutId, name, grade, distanceM }` — 항상 먼저
  - 카카오 주변 장소(로컬 API, 반경 150m): `{ kind: 'kakao', placeId, name, lat, lng, roadAddress, distanceM }`
  - 첫 번째 = "여기 ○○ 맞냥?"에 쓸 후보
- 카카오 호출은 2초 타임아웃. 실패하면 내 아지트만 돌려주고 `hereAddress: null`(체크인은 계속 가능).
- "여기에 새로 만들기"는 후보 목록에 넣지 않고 앱이 항상 표시한다(서버는 `target: { kind: 'new' }`로 받음).

### `submit_checkin` (Postgres 함수, `security definer`, 사용자 = `auth.uid()`)

`submit_checkin(lat, lng, accuracy, target jsonb)` — `target`:
- `{ kind: 'mine', aidutId }`
- `{ kind: 'kakao', placeId, name, lat, lng, roadAddress }`
- `{ kind: 'new', roadAddress?: string }` — 앱이 `suggest-place`의 `hereAddress`를 그대로 넘긴다. 이름 = 그 주소, 없으면 "이름 없는 골목".

처리(한 트랜잭션, 사용자별 advisory lock으로 직렬화):
1. 로그인 확인, lat/lng 범위 확인, `accuracy ≤ 150` 아니면 `weak_gps`.
2. 대상 좌표 결정: mine → 그 아지트(내 것 아니면 `not_yours`) / kakao → 전달 좌표 / new → 내 좌표.
3. `ST_DWithin(내 좌표, 대상 좌표, 150m)` 아니면 `too_far`.
4. kakao/new면: 대상 좌표 15m 안에 내 아지트가 있으면 그걸 사용, 없으면 새로 생성(이름 ≤ 60자).
5. 그 아지트의 마지막 발자국이 6시간 안이면 `cooldown` (+ `nextAt`).
6. `checkins` 1건, `footprint_count + 1`, 등급 재계산.
7. 내 좌표가 속한 안개 셀을 `fog_cells`에 (이미 있으면 무시).
8. 반환 `{ aidutId, name, footprintCount, grade, gradeChanged, newCellsCleared }` — ③의 축하 연출 재료.

거절은 Postgres 예외(`too_far` | `weak_gps` | `cooldown` | `not_yours` | `not_authenticated`)로, 앱이 코드로 구분한다.

## 데이터 변경

- `aidut`: `name text not null`, `kakao_place_id text` 추가, `road_address` nullable. 읽기 정책을 **본인 것만**(`owner_uid = auth.uid()`)으로 좁힘.
- `aidut_memories`: 읽기를 본인 아지트 것만으로 좁힘(사용자별 아지트와 일관). `aidut_tenants`는 v1 미사용(이웃 고양이 방문용으로 남겨둠).
- 신규 `fog_cells (user_id, cell_x int, cell_y int, explored_at)`, PK `(user_id, cell_x, cell_y)`, 본인 것만 읽기.
- 신규 `app_config (key text pk, value jsonb)` — `checkin_radius_m 150`, `gps_accuracy_max_m 150`, `revisit_cooldown_hours 6`, `merge_radius_m 15`, `fog_cell_m 100`, `grade_thresholds {box:2, hut:5, tower:10, palace:20}`. 로그인 사용자 읽기 허용, 쓰기는 service role만.
- `aidut`·`checkins`·`fog_cells`의 직접 insert/update/delete는 `authenticated`에 **권한 없음** — 쓰기는 `submit_checkin`만.
- 등급 계산은 SQL 함수 하나(`aidut_grade(count)`)로 두고 임계값은 `app_config`에서 읽는다.
- PostGIS는 `extensions` 스키마에 있음 — 함수는 `search_path`를 명시한다.
- 서버 env: `supabase/functions/.env.local`에 `KAKAO_REST_KEY` 다시 필요(카카오 로컬 API).

## 엣지 처리

- 카카오 장애/지연 → 내 아지트만 후보, "새로 만들기" 가능.
- 연타/동시 요청 → advisory lock으로 직렬화 → 두 번째는 `cooldown`.
- 같은 자리 "새로 만들기" 반복 → 15m 합치기가 lock 안에서 판정 → 중복 없음.
- 조작된 후보(좌표·이름) → 거리 재검증 + 이름 길이·좌표 범위 제한. 영향은 본인 데이터뿐.
- 이미 걷힌 셀 재방문 → `newCellsCleared: 0`, 발자국은 정상.
- 쿨다운은 아지트별 — 다른 아지트는 바로 가능.
- 기존 `rls.test.sql`의 "aidut 인증 전체 읽기" 가정은 새 정책에 맞게 갱신한다.

## 테스트

- **pgTAP (`submit_checkin`)**: 새로 만들기 / 기존 키우기 / 15m 합치기 / `too_far` / `weak_gps` / `cooldown`(과거 시각 발자국 삽입) / `not_yours` / 등급 경계 1·2·5·10·20 + `gradeChanged` / 같은 셀 2회 → 1칸 / 직접 insert 차단 / 남의 아지트·셀 조회 불가 / `app_config` 읽기 가능·쓰기 불가.
- **Deno (`suggest-place`)**: 카카오 fetch·DB 조회 주입 — 정렬(내 것 → 카카오, 거리순), 최대 5개, `weak_gps`, 카카오 실패 시 폴백, 카카오 응답 파싱.
- **통합(로컬 스택)**: 실제 GoTrue 세션으로 suggest → submit 한 바퀴 → 발자국 1 / `paw` / 셀 1.

## 범위 밖

지도·체크인 시트·축하 연출(②③), 안개 렌더·개척률·동 단위 진화·고양이 상주(④), 온보딩(⑤), 지오펜스 알림·오프라인 큐·사진 업로드·위시리스트·코스(⑥), 위치 조작 방지(명세상 v1 제외), `app_config` Realtime 구독(값을 쓰는 화면이 생길 때).
