# 기획 산출물 — 지표 정의·측정 이벤트 & Definition of Done 운영 (출시용 v1)

> 작성일: 2026-09-22 (고양이 세계관 반영) · From: 기획팀 · 상태: 초안 v0.2
> 근거: `핸드오프-기획팀-v1.md`(⑤⑥), `출시용-v1-범위정의.md` §1(DoD), `고양이-세계관-설계-v1.md`, `v1-제품방향-결정기록.md` §9
> 짝: `기획-기능명세-v1.md`(①②③), `기획-카피톤-v1.md`(④)

---

# 파트 A — ⑤ 지표 정의 & 측정 이벤트

## A0. 무엇을 왜 재는가
- **가설 #1 (생사):** 안 조를 때 다시 와서 또 아지트를 세우는가? → **재방문·재성장**.
- **가설 #2 (소셜 연료):** 체크인 중 몇 %가 사진까지? → **체크인→사진 전환율**.
- 보조: 온보딩 2분 내 첫 발자국 도달 → **온보딩 완료율/시간**.

허영 지표(설치 수 단독) 지양. **재성장(반복 행동)** 초점.

## A1. 핵심 지표
| 구분 | 지표 | 정의 | 목표(초안) |
|---|---|---|---|
| ⭐ North Star | 주간 재성장 유저 비율 | 주 1회+ 발자국 유저 / 활성 유저 | 파일럿 baseline |
| 리텐션 | D1/D7/D30 재방문율 | N일차 앱 열고 발자국 | D7 재성장 = go/no-go |
| 재성장 | 유저당 주간 발자국 수 | — | — |
| 재성장 | 재방문 아지트 비율 | 2회+ 발자국 아지트 / 전체 | 단골 신호 |
| 전환(#2) | 체크인→사진 전환율 | 사진 발자국 / 전체 발자국 | 낮으면 소셜 공허 |
| 온보딩 | 완료율 / 소요 중앙값 | 첫 발자국까지 | **2분 이내** |
| 탐험 | 개척률(안개) | 걷힌 영역 / 접근 가능 | 탐험 진행 |
| 권한 | 위치·알림·iOS Always 승낙률 | 허용/요청 | iOS Always 병목 |
| 안정성 | 크래시 프리 / 체크인 성공률 | 성공/시도 | DoD §2 게이트 |

## A2. 측정 이벤트 (개발 스펙, snake_case, PII 금지)

**온보딩:** `onboarding_start` · `cat_created`(color,pattern) · `permission_prompt`(type) · `permission_result`(type,granted) · `home_area_set`(method) · `tutorial_complete`(skipped) · `first_aidut_created`(elapsed_sec) · `onboarding_complete`(total_elapsed_sec)

**핵심 루프:** `geofence_enter`(aidut_id,dwell_ok) · `arrival_notification_sent`(aidut_id,is_wishlist) · `arrival_notification_open` · `checkin_sheet_open`(source) · `proximity_gate_result`(passed,gps_accuracy_m) · `footstep_created`(aidut_id,footstep_count_after,grade[paw/box/hut/tower/palace],graded_up) · `aidut_graded_up`(from,to) · `fog_cleared`(dong,cleared_ratio_after) · `territory_evolved`(dong,from_stage,to_stage) · `moment_added`(photo_count) · `checkin_failed`(reason[gate_out/gps_fail/offline/write_fail])

**위시/코스/훅:** `wishlist_add` · `wishlist_fulfilled`(days_since_add) · `course_view`(candidate_count,has_route) · `course_started` · `app_open`(has_pending_growth) · `passive_view`(session_sec — 수동적 즐거움 신호)

**안정성:** `error_shown`(screen,code) · `offline_queue`(action) · `sync_result`(success,retries)

## A3. go/no-go 판정선
| 가설 | 지표 | 임계선(초안) |
|---|---|---|
| #1 재성장 | D7 재성장 비율 | 파일럿 baseline 후 CEO 확정 |
| #2 사진 연료 | 체크인→사진 전환율 | <15%면 소셜 로드맵 재검토 |
| 온보딩 | 완료율 / 2분 내 | 모니터 |

---

# 파트 B — ⑥ Definition of Done 운영

## B0. 원칙
- **완성도 = 깊이.** 5개 기준 **전부 "예"**일 때만 출시.
- 기획팀이 게이트 오너. OUT 위반은 자동 실패.

## B1. DoD 5대 게이트
| # | 기준 | 검증 | 책임 |
|---|---|---|---|
| 1 | 2분 내 온보딩 + 첫 아지트 + 루프 이해 | 미사용자 5명 테스트, `first_aidut_created.elapsed_sec`≤120s, "뭐하는 앱?" 정답률 | 기획+디자인 |
| 2 | 핵심 루프 안정, GPS/권한/오프라인 우아 처리 | 엣지케이스 체크리스트 전수, 크래시 프리, `checkin_failed` 분포 | 개발+기획 |
| 3 | 무행동 시에도 볼 맛(수동적 즐거움) | 빈 화면 없음, 고양이 상주, `passive_view` 존재 | 디자인+기획 |
| 4 | 막다른/슬픈 화면·버벅임 없음 | 빈 상태 규칙 전 화면, 성능 점검 | 디자인+개발 |
| 5 | 스토어 제출 가능 | 약관·심사물·iOS 애플 로그인·처리방침 | 개발+기획 |

## B2. 운영
상시 트래킹(초록/노랑/빨강) → 전부 초록 시 게이트 리뷰 소집 → 통과 시 `DoD-판정기록.md` 기록. 부분 통과로 출시 금지.

## B3. 범위 게이트 (OUT 위반 자동 실패)
모임 · 점수판/랭킹/월간뱃지 · DM/채팅/팔로우 · 남의 영역 보기 · SNS 크롤 · 다묘/꾸미기 경제 · 퀘스트/스토리/프로필사진 · 지도 3분할 · (지오펜스 외) 소셜/마케팅 알림.

## B4. 체크리스트
- [ ] ① 온보딩 2분 + 첫 아지트 + 루프 이해
- [ ] ② 핵심 루프 안정 + 엣지케이스 전수 + 크래시 프리
- [ ] ③ 수동적 즐거움 확보
- [ ] ④ 빈/막다른 화면·버벅임 없음
- [ ] ⑤ 스토어 제출물 완비
- [ ] 범위(OUT) 위반 없음
- [ ] 측정 이벤트 심어져 데이터 수집 시작

---

## 부록 — 다음
범위·세계관 확정 → 런칭·유통 계획(비치헤드 상도동). 파일럿 운영 계획은 유통과 별도 트랙.
