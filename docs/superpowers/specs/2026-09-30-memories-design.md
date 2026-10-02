# 순간 남기기 📷 — 설계

> 2026-09-30 · 서브프로젝트 ⑥-3 (⑥-1 도착 알림 ✓ → ⑥-2 오프라인 큐 ✓ → **⑥-3 순간 남기기** → ⑥-4 프로필 설정 → ⑥-5 위시리스트·코스)
> 근거: `기획-기능명세-v1.md` §2.4·§2.5·§3.4·§4.2, `기술-아키텍처-v1.md`(`attach-memory`, Storage 트랜잭션 업로드), `고양이-세계관-설계-v1.md`("고양이가 그곳에서 남긴 추억"), `기획-카피톤-v1.md` §3.3·§3.5, 대기열 `2026-09-29-offline-queue-design.md`

## 목표

아지트에 사진을 붙여 **아지트 상세 = 고양이의 추억**을 만든다. 사진은 발자국과 별개의 선택 기능이고, 그 아지트 근처(150m)에 있을 때만 남길 수 있다. 끊겨도 사진을 잃지 않고, 파일만 올라가고 기록은 없는 "고아" 사진이 남지 않는다.

**성공 기준**
- 발자국 축하 화면에서 [순간 남기기 📷] → 찍거나 고르면 → 그 아지트 상세에 사진이 보인다.
- 지도 카드 [추억 보기] → 아지트 상세: 이름·등급·발자국 수·다음 단계 힌트 + "여기서의 순간들"(최신 순). 사진이 없으면 긍정 빈 상태.
- 상세의 [순간 남기기 📷]는 150m 안에서만 눌린다. 서버도 위치를 다시 검사한다.
- 비행기 모드에서 남긴 사진은 연결되면 올라가고, 도중에 끊겨도 한 장이 두 번 기록되지 않는다.
- 서버가 거절한 사진은 저장소에서도 지워진다.

## 결정 사항

| 결정 | 값 | 이유 |
|---|---|---|
| 사진 출처 | 카메라 + 앨범(`expo-image-picker`) | 사용자 선택. 근처에서만 누를 수 있어 "여기서의 순간"은 지켜진다 |
| 크기 | 긴 변 **1280px**, JPEG 품질 0.7(`expo-image-manipulator`) — 약 200KB | Supabase 무료 저장 1GB에서 넉넉하게 |
| 남기는 곳 | 축하 화면 버튼 + 아지트 상세 버튼(150m 안에서만) | 기획 §2.4·§2.5 |
| 근처 검사 | 사진 고를 때의 위치(`Fix`)를 함께 보내고 서버가 `checkin_radius_m`·`gps_accuracy_max_m`로 검사 | 체크인과 같은 규칙. 대기열에서 나중에 올려도 그때 위치로 검사 |
| 저장소 | Supabase Storage **비공개** 버킷 `memories`, 경로 `{uid}/{사진 id}.jpg`, 1MB·`image/jpeg`만 | 본인만 보기(기존 정책과 같음) |
| 고아 방지 | 파일 먼저 올리고 → `attach_memory(p_aidut, p_path, 위치)`가 파일 존재·소유를 확인하고 기록. 경로에 유일 제약 → 같은 요청을 다시 보내도 한 번만 기록 | 끊긴 뒤 다시 보내도 안전(멱등). 거절되면 클라가 파일을 지운다 |
| 기록 컬럼 | `aidut_memories.photo_url`에 **저장 경로**를 넣는다(이름은 그대로 둠) | 비공개라 주소가 고정되지 않는다. 볼 때 임시 링크 |
| 보기 | `createSignedUrls`로 1시간 임시 링크 | 비공개 버킷 |
| 대기열 | ⑥-2와 같은 방식(`jsonFile`), 같은 시점(포커스·앞으로·재연결·남긴 직후)에 올린다 | 코드 재사용 |
| 오프라인 새 아지트 | 사진 버튼 없음(서버에 올라가기 전엔 아지트 id가 없다) | 단순 |
| 한 번에 | 한 장 | 단순 |
| 빼는 것 | 사진 지우기·설명·여러 장 고르기·테넌트 목록 | v1 범위(테넌트=다른 사람, 범위 밖) |

## 흐름

### 1. 사진 고르기 (`pickMemoryPhoto`)
[순간 남기기 📷] → 선택지 [사진 찍기] / [앨범에서 고르기] / [닫기].
1. 권한(카메라 또는 사진). 거절 → "사진을 쓰려면 권한이 필요해요." + [설정 열기].
2. 찍거나 고름(편집 없음). 취소 → 아무것도 안 함.
3. 긴 변 1280px, JPEG 0.7로 줄인다.
4. 앱 문서 폴더 `memories/{사진 id}.jpg`로 옮긴다(앨범·카메라 임시 파일이 지워져도 대기열이 산다).

### 2. 남기기 (`keepMemory`)
- 입력: 아지트 id, 사진 파일, 위치(`Fix`).
  - 축하 화면: 체크인 때 잡은 위치.
  - 상세 화면: 버튼을 누를 때 새로 잡은 위치(`getFreshFix`).
- 대기열에 `{ id, aidutId, fix, localUri, at }`를 넣고 바로 한 번 올려 본다.
- 화면: "순간을 남겼어요 📷" (올라가면 상세에 보인다). 대기 중이면 상세 목록 끝에 "올라가는 중" 자리표시.

### 3. 올리기 (`flushMemories`, `useCheckinQueue`가 발자국 다음에 부른다)
오래된 순으로 하나씩:
1. 7일 넘었으면 저장소 파일 지우기를 시도하고(실패해도 무시) 로컬 파일도 지우고 뺀다.
2. `storage.from('memories').upload('{uid}/{id}.jpg', 파일, { contentType: 'image/jpeg', upsert: true })`
3. `rpc('attach_memory', { p_aidut, p_path, p_lat, p_lng, p_accuracy })`
   - 성공(새로 기록 또는 이미 기록됨) → 로컬 파일 지우고 뺀다.
   - `too_far`·`weak_gps`·`not_yours`·`no_photo` → 저장소 파일을 지우고(`remove`), 로컬 파일도 지우고 뺀다. 거절 수 +1.
   - 네트워크·서버 오류 → 멈추고 남긴다.
4. 하나라도 올라가면 결과(`aidutId` 목록)를 알려 상세 화면이 새로 불러오게.
- 거절 안내: "남긴 순간 N개는 올리지 못했다냥. 너무 멀었거나 위치가 흐렸다냥."

### 4. 아지트 상세 (`app/aidut/[id].tsx`)
- 들어오는 길: 지도 카드 [추억 보기].
- 헤더: 등급 그림·이름·등급 이름·"지금까지 N번 다녀왔다냥"·다음 단계 힌트(지도 카드와 같은 문구).
- "여기서의 순간들": 사진 격자(3열), 최신 순. `my_memories(p_aidut)` → 경로 목록 → `createSignedUrls(경로들, 3600)`.
- 사진이 없으면 "아직 남긴 순간이 없다냥. 다음에 오면 하나 남겨볼까냥?"
- [순간 남기기 📷]: 내 위치(`useMyLocation`)가 150m 안일 때만 활성. 밖이면 비활성 + "가까이 가면 순간을 남길 수 있다냥."
- 사진을 누르면 크게 보기(모달, 닫기).
- 오프라인: 저장본 아지트로 헤더는 보이고, 사진 목록은 "연결되면 순간들을 보여줄게냥."

## 서버

마이그레이션 1개:
- 버킷: `insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('memories', 'memories', false, 1048576, array['image/jpeg']) on conflict do nothing`
- `storage.objects` 정책(버킷 `memories`, `(storage.foldername(name))[1] = auth.uid()::text`): insert·select·update(upsert용)·delete 본인만.
- `aidut_memories`: `unique (photo_url)`. 기존 `aidut_memories_insert_own` 정책은 지운다(쓰기는 함수로만).
- `attach_memory(p_aidut uuid, p_path text, p_lat float8, p_lng float8, p_accuracy float8) returns uuid` — `security definer`:
  1. 로그인 확인, 좌표·정확도 검사(`weak_gps`), 아지트가 내 것인지(`not_yours`).
  2. `p_path`가 `{uid}/`로 시작하는지, `storage.objects`에 버킷 `memories`·이름 `p_path`·소유자 `uid`로 있는지(`no_photo`).
  3. 아지트와의 거리 ≤ `checkin_radius_m`(`too_far`).
  4. `insert … on conflict (photo_url) do nothing`, 기존/새 id 반환.
- `my_memories(p_aidut uuid) returns table(id uuid, path text, created_at timestamptz)` — 본인 것, 최신 순.
- 권한: 두 함수 모두 `authenticated`만.

## 파일

| 파일 | 역할 |
|---|---|
| `supabase/migrations/2026093000000x_memories.sql` | 버킷·정책·제약·함수 |
| `features/memories/photo.ts` | 권한·찍기/고르기·줄이기·앱 폴더로 옮기기 |
| `features/memories/memoryQueue.ts` | 대기열(`jsonFile`), `keepMemory`, `flushMemories(upload, attach, remove)` |
| `features/memories/memoriesApi.ts` | Storage 올리기·지우기, `attach_memory`, `my_memories`+임시 링크 |
| `features/memories/MemoryButton.tsx` | [순간 남기기 📷] + 찍기/고르기 선택 |
| `features/memories/useMemories.ts` | 상세 화면 사진 목록 |
| `app/aidut/[id].tsx` | 아지트 상세 |
| `app/_layout.tsx` | 상세 화면을 로그인·온보딩 끝난 사용자에게만(`tabs`와 같은 가드) |
| `features/checkin/Celebration.tsx` | 축하에 버튼(아지트 id·위치 받음) |
| `features/checkin/useCheckinQueue.ts` | 발자국 다음에 사진도 올리기, 거절 수 |
| `app/(tabs)/index.tsx` | 카드 [추억 보기], 사진 거절 안내 |
| `features/auth/clearLocalData.ts` | 로그아웃 때 사진 대기열·로컬 사진도 지운다 |
| `app.json` | `expo-image-picker` 플러그인(카메라·사진 권한 문구) |

권한 문구: 카메라 "아지트에서의 순간을 사진으로 남기려고 카메라를 써요." · 사진 "아지트에 붙일 사진을 고르려고 앨범을 봐요."

## 오류 처리

- 권한 거절·취소는 조용히(거절은 설정 안내 한 줄).
- 줄이기·옮기기 실패 → "사진을 준비하지 못했다냥. 다시 해볼까냥?"
- 올리기 실패는 대기열에 남긴다(⑥-2 규칙과 같음: 네트워크 오류는 멈춤, 거절은 뺌, 7일 버림).
- 임시 링크 받기 실패 → 사진 자리에 회색 칸, 목록은 유지.

## 테스트

- pgTAP: `attach_memory` — 성공, 같은 경로 두 번 → 한 줄, 남의 아지트 `not_yours`, 파일 없음/남의 폴더 `no_photo`, 멀면 `too_far`, 정확도 `weak_gps`; `my_memories` 본인 것만·최신 순; 버킷 정책(남의 폴더에 insert 불가).
- jest: 대기열(성공·거절 시 저장소·로컬 삭제·네트워크 오류 멈춤·7일·도중 추가), `photo.ts`(권한 거절·취소·줄이기 인자), `MemoryButton`(선택지·설정 안내), `useMemories`(임시 링크·실패 칸), 상세 화면(헤더·빈 상태·150m 활성/비활성·크게 보기·오프라인), 축하 버튼, 지도 카드 [추억 보기], 올리기 순서(발자국 다음 사진), 로그아웃 정리.
- 실기기(진행상황 문서에 추가): 찍기/고르기, 비행기 모드에서 남기고 연결 후 올라가는지, 멀리서 상세 버튼 비활성, 사진 크게 보기.

## 검토 뒤 보완 (2026-09-30)

- 순서를 **위치 먼저 → 사진**으로 바꿨다. 상세 화면은 새로 잡은 위치의 정확도(150m)와 거리(150m)를 폰에서 먼저 보고, 흐리거나 멀면 찍기 전에 "위치가 흐리다냥. 조금 뒤에 다시 해볼까냥?" / "조금만 더 가까이 가면 순간을 남길 수 있다냥."로 알린다. 방금 찍은 사진이 서버 거절로 사라지지 않게.
- 버튼이 바로 올렸다가 서버가 거절하면 버튼 아래에 "남긴 순간을 올리지 못했다냥. 너무 멀었거나 위치가 흐렸다냥."
- 대기열: 연결 문제만 멈춘다. 그 밖의 오류(용량 초과·파일 없음 등)는 그 사진만 건너뛰고 세어 두며, 3번째 실패에서 뺀다(한 장이 줄 전체를 막지 않게).

## 범위 밖

- 사진 지우기·설명·여러 장 한 번에 — 필요해지면.
- 테넌트 목록 — 다른 사람 기능(v1 밖).
- 저장소에 남은 진짜 고아(올린 뒤 7일 넘게 기록 못 한 파일) 정리 작업 — 7일 뒤 지우기를 시도하지만 그때도 끊겨 있으면 드물게 남을 수 있다. 필요해지면 서버 정리 작업.
