# 위시리스트 · 공유로 찜하기 — 설계

> 2026-09-30 · 서브프로젝트 ⑥-5 (⑥-1~⑥-4 ✓ → **⑥-5 위시리스트** · 코스는 다음 단계)
> 근거: `기획-기능명세-v1.md` §2.7("앱 내 검색 → 찜 → 별도 색 핀. 방문 시 아지트 성장 = 달성"), `출시용-v1-범위정의.md` §3("고양이가 찜한 곳"), `기획-카피톤-v1.md` §3.2·§4(찜 첫 방문·빈 상태), 도착 알림 `2026-09-29-arrival-alert-design.md`, 지도 저장본 `2026-09-29-offline-queue-design.md`

## 목표

가고 싶은 곳을 **검색하거나, 다른 앱(네이버지도·카카오맵·인스타 등)에서 공유해서** "고양이가 찜한 곳"으로 모은다. 찜한 곳은 지도에 별도 핀으로 보이고, 근처에 오면 알림이 오고, 발자국을 남기면 "달성"이 된다.

**성공 기준**
- 찜 화면에서 장소를 검색해 [⭐ 찜]하면 지도에 ⭐ 핀이 생긴다. 찜 해제하면 사라진다.
- 네이버지도·카카오맵에서 [공유 → 산책냥]하면 그 가게가 후보로 뜨고 한 번에 찜할 수 있다. 공유 링크·글을 검색창에 **붙여넣어도** 같다.
- 찜한 곳 근처에 2분 머물면 "가고 싶다던 ○○, 드디어 왔다냥!" 알림.
- 찜한 곳에서 발자국을 남기면 축하 화면에 같은 문구 한 줄, 찜은 "달성 ✓"가 되고 ⭐ 핀은 아지트 마커로 바뀐다.
- 오프라인에서도 ⭐ 핀이 보인다.

## 결정 사항

| 결정 | 값 | 이유 |
|---|---|---|
| 범위 | 위시리스트 + 공유로 찜하기. **코스 추천은 다음 단계** | 사용자 선택 |
| SNS 자동 수집(크롤링) | 안 한다 | 공개 API 없음·약관 위반·자주 깨짐. 공유(사용자가 보낼 때만)로 대체 |
| 장소 출처 | 카카오 로컬 키워드 검색(서버 `search-place`) | 체크인 후보와 같은 카카오 장소 id → 달성 판정이 정확 |
| 공유 받기 | `expo-share-intent`(설정 플러그인: iOS 공유 확장 + 안드로이드 텍스트 공유). **SDK 57 지원을 설치 전에 확인**, 안 되면 붙여넣기만 | 정식 공유 통로 |
| 붙여넣기 | 찜 화면 검색창에 링크·글이 들어오면(`http` 포함 또는 여러 줄) 공유와 같은 해석기로 | 공유 모듈 없이도 동작 |
| 공유 해석 | 서버 `parse-shared`: 글의 줄에서 장소 이름 후보, 허용된 지도 링크(`naver.me`, `map.naver.com`, `m.place.naver.com`, `kko.to`, `place.map.kakao.com`, `map.kakao.com`)는 따라가서 제목(`og:title`/`<title>`)을 이름 후보로, 인스타(`instagram.com`)는 `og:description` 첫 부분을 후보로 → 카카오 키워드 검색 → 후보 목록 | 네이버·카카오 링크는 정확, 인스타는 최선 노력 |
| 링크 따라가기 제한 | 허용 목록 호스트만, 리다이렉트 3번·3초·응답 200KB까지 | 서버가 아무 주소나 부르지 않게(SSRF 방지) |
| 핀 | ⭐ 모양, 아지트 마커와 따로. 달성한 찜은 핀 없음(이미 아지트) | 기획 §2.7 |
| 달성 | `submit_checkin`이 아지트의 카카오 장소 id와 내 찜을 비교해 `achieved_at` 기록, 결과에 `wishAchieved` | 서버 한 곳에서 판단 |
| 도착 알림 | 달성 안 한 찜도 감시 목록에(아지트와 합쳐 가까운 20곳) | 기획 §3.1 "내 아지트/찜 진입" |
| 찜 개수 | 제한 없음 | YAGNI |

## 화면

### 지도
- 오른쪽 위 [⭐ 찜] 버튼 → 찜 화면.
- ⭐ 핀을 누르면 카드: 이름 · 주소 · "고양이가 찜한 곳" · [찜 해제] · [닫기].
- 축하 화면: 결과에 `wishAchieved`면 "가고 싶다던 {이름}, 드디어 왔다냥!" 한 줄.

### 찜 화면 (`app/wishlist.tsx`)
- 위: 검색창 + [찾기]. 결과 최대 15곳(가까운 순, 내 위치를 알면). 각 줄: 이름·주소·거리 + [⭐ 찜] / [찜 해제].
  - 검색창에 링크·여러 줄 글을 넣으면 공유 해석(`parse-shared`)으로 후보를 찾는다.
- 아래: "고양이가 찜한 곳" 목록(최신 순). 달성한 곳은 "달성 ✓". 각 줄 [찜 해제].
- 비었을 때: "가고 싶은 곳이 있냥? 검색해서 찜해두면 지도에 표시된다냥."
- 검색 결과 없음: "음, 못 찾았다냥. 다른 이름으로 찾아볼까냥?"
- 공유 해석 결과 없음: "장소를 찾지 못했다냥. 이름으로 검색해 볼까냥?"
- 돌아가기 버튼.

### 공유로 들어왔을 때
- 다른 앱에서 [공유 → 산책냥] → 앱이 열리고(로그인·온보딩이 끝난 경우) 찜 화면이 **공유된 글로 채워진 채** 열려 해석 결과를 보여준다.
- 로그인 전·온보딩 중이면 공유 내용을 기억해 뒀다가 지도에 도착하면 찜 화면을 연다.

## 서버

마이그레이션 1개:
- `wishlist`에 `name text not null`, `road_address text`, `lat float8 not null`, `lng float8 not null`, `achieved_at timestamptz` 추가(기존 행은 없다고 보고 `not null`은 기본값 없이 — 개발 데이터만 있음, 비우고 시작).
- 쓰기는 함수로만(직접 insert 정책 삭제):
  - `add_wish(p_place_id text, p_name text, p_road_address text, p_lat float8, p_lng float8)` — 이름 1~60자, 좌표 범위 검사, 이미 있으면 그대로(`on conflict do nothing`). 이미 그 장소가 내 아지트면 바로 `achieved_at = now()`.
  - `remove_wish(p_place_id text)`.
  - `my_wishes()` → `place_id, name, road_address, lat, lng, achieved_at, created_at`(최신 순).
- `submit_checkin`: 끝에서 `update wishlist set achieved_at = now() where user_id = v_uid and place_id = v_aidut.kakao_place_id and achieved_at is null` → 결과 JSON에 `wishAchieved: true/false`.

Edge Functions:
- `search-place`: POST `{ query, lat?, lng? }`(검색어 1~40자) → 카카오 키워드 검색(좌표가 있으면 거리순) → `{ places: [{ placeId, name, roadAddress, lat, lng, distanceM | null }] }` 최대 15. 로그인 필요.
- `parse-shared`: POST `{ text, lat?, lng? }`(1~2000자) → 이름 후보 최대 3개 → 각각 키워드 검색 → 합쳐서 중복 제거 → `{ places: [...], query }`(`query`는 가장 그럴듯한 이름, 앱 검색창에 채움). 로그인 필요.

## 앱

| 파일 | 역할 |
|---|---|
| `features/wishlist/wishlistApi.ts` | `searchPlaces`, `parseShared`, `addWish`, `removeWish`, `myWishes` |
| `features/wishlist/useWishes.ts` | 내 찜 목록(포커스마다, 실패 시 지도 저장본) |
| `features/wishlist/sharedText.ts` | 붙여넣은 글이 공유 글인지 판단(`http` 포함 또는 줄바꿈) |
| `features/wishlist/useIncomingShare.ts` | 공유 받기(`expo-share-intent`) → 기억 → 지도에서 찜 화면 열기 |
| `app/wishlist.tsx` | 찜 화면 |
| `map/protocol.ts`·`webview-template.ts`·`MapBridge.tsx` | `setWishes` 메시지, ⭐ 핀, `wishTap` |
| `app/(tabs)/index.tsx` | [⭐ 찜] 버튼, ⭐ 핀 카드, 공유 들어오면 찜 화면 |
| `features/map/mapCache.ts` | 저장본에 `wishes` |
| `features/arrival/*` | 찜도 감시 목록에(문구 구분) |
| `features/checkin/Celebration.tsx`·`copy.ts` | 달성 한 줄 |
| `app.json` | `expo-share-intent` 플러그인(지원 확인 뒤) |

## 오류 처리

- 검색·해석 실패(네트워크) → "연결이 끊겨 있다냥. 잠시 뒤에 다시 해볼까냥?", 그 밖 공통 문구.
- 찜 추가·해제 실패 → 버튼 원래대로 + 공통 문구.
- 링크 따라가기 실패·차단 호스트 → 그 링크는 건너뛰고 글의 다른 후보로.
- 공유가 로그인 전에 오면 기억만(로그아웃하면 버림).

## 테스트

- pgTAP: `add_wish`(검사·중복·이미 아지트면 달성), `remove_wish`, `my_wishes` 본인 것만, 직접 insert 막힘, `submit_checkin` 달성 표시(카카오 id 일치 시만, 한 번만).
- Deno: `search-place`(로그인·입력 검사·거리순·15개), `parse-shared`(줄에서 이름 후보, 네이버·카카오 링크 제목, 인스타 설명, 허용 목록 밖 링크는 안 부름, 리다이렉트 제한, 후보 합치기·중복 제거).
- jest: API 래퍼, 공유 글 판단, 찜 화면(검색·찜 토글·목록·달성 표시·빈 상태·붙여넣기 해석·공유로 채워짐), 지도(⭐ 버튼·핀·카드·찜 해제), 지도 브리지 메시지, 도착 알림(찜 문구·20곳 합치기), 축하 달성 줄, 공유 받기(기억·지도에서 열기), 저장본.
- 실기기: 네이버지도·카카오맵·인스타에서 공유, 찜 핀, 찜한 곳 도착 알림, 발자국 뒤 달성.

## 범위 밖

- 코스 추천·길 찾기 — 다음 단계.
- SNS 자동 수집(크롤링).
- 찜 메모·폴더·공유하기(내 찜을 남에게).
