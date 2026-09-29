# 오프라인 큐 — 설계

> 2026-09-29 · 서브프로젝트 ⑥-2 (⑥-1 도착 알림 ✓ → **⑥-2 오프라인 큐** → ⑥-3 순간 남기기 📷 → ⑥-4 프로필 설정 → ⑥-5 위시리스트·코스)
> 근거: `기획-기능명세-v1.md` §2.5·§3.4, `기술-아키텍처-v1.md` §6.2·§7, `출시용-v1-범위정의.md` DoD 2, 체크인 흐름 `2026-09-28-checkin-ux-design.md`, 저장 방식 `2026-09-29-arrival-alert-design.md`

## 목표

네트워크가 끊겨도 발자국을 남길 수 있고, 연결되면 저절로 서버에 올라간다. 끊긴 동안 지도는 빈 화면 대신 마지막으로 본 모습을 보여준다.

**성공 기준**
- 비행기 모드에서 내 아지트 근처 → [발자국 남기기] → 후보(내 아지트·새로 만들기) → 고르면 "챙겨뒀어요". 앱은 멈추지 않는다.
- 연결이 돌아오면(앱을 켜 둔 채든, 나중에 켜든) 챙긴 발자국이 올라가고 축하가 뜬다.
- 서버가 거절한 발자국은 대기열에서 빠지고 한 줄로 알린다. 네트워크 오류는 다음에 다시 시도한다.
- 오프라인에서 앱을 켜도 마지막으로 본 아지트·안개가 보이고, 끊겨 있다는 배지가 있다.

## 결정 사항

| 결정 | 값 | 이유 |
|---|---|---|
| 오프라인 순간 반응 | "발자국을 챙겨뒀어요. 연결되면 남길게요 🐾" 안내만. **축하는 서버 확정 뒤** | 사용자 선택. 되돌릴 일이 없다(기획의 낙관 UI+롤백을 대체) |
| 연결 감지 | `expo-network`(`getNetworkStateAsync`, `addNetworkStateListener`) | 재연결 순간 바로 올릴 수 있다. ⑥-1로 dev build 재생성이 이미 필요 |
| 오프라인 판정 | `isConnected === false` 또는 `isInternetReachable === false` | `null`(모름)은 온라인으로 보고 평소처럼 시도 — 실패하면 기존 오류 안내 |
| 오프라인 후보 | 저장본의 내 아지트 중 150m 안(가까운 순) + "여기 새로 만들기"(`{kind:'new', roadAddress:null}`) | 카카오 후보는 네트워크 필요. 새 아지트 이름은 서버 기존 규칙("이름 없는 골목") |
| 발자국 시각 | **올라간 시각**(서버 `now()`). 서버 변경 없음 | 폰 시각을 믿으면 쿨다운을 우회할 수 있다. 한계: 늦게 기록될 수 있음 |
| 대기열 보관 | 7일 넘으면 버린다 | 서버 오류가 계속되는 항목이 영원히 남지 않게 |
| 저장소 | ⑥-1의 "JSON 파일 + 순서대로 쓰기"를 공용 도구로 빼서 도착 알림·대기열·지도 저장본이 같이 쓴다 | 같은 코드 세 번 쓰지 않기 |
| 사진 대기열 | ⑥-3에서 | 사진 기능이 아직 없다 |
| 대기 중 마커 | 없음. 개수 배지만 | 배지로 충분 |

## 흐름

### 1. 오프라인 발자국 (`useCheckin`)
`start()`:
1. 위치 잡기는 지금과 같다(권한·시간 제한·GPS 약함 안내 그대로). 오프라인에서도 GPS는 된다.
2. 오프라인이면 `suggestPlace` 대신 `offlineCandidates(fix, 저장본 아지트)` → `choosing` 상태(`hereAddress: null`, `offline: true`). 정확도가 `gps_accuracy_max_m`(150m)보다 나쁘면 GPS 약함 처리와 같게 한 번 더 잡고, 그래도 나쁘면 기존 안내.
3. 온라인인데 `suggestPlace`가 네트워크 오류(`FunctionsFetchError`)로 실패해도 오프라인 경로로 넘어간다(연결 감지가 늦는 경우).

`choose(target)`:
- `offline: true`면 `enqueueCheckin({ fix, target, name })` → 상태 `queued`(`{ name: 'queued' }`) → 지도에 "발자국을 챙겨뒀어요. 연결되면 남길게요 🐾" + [닫기].
- 온라인이면 지금과 같다. 단 `submitCheckin`이 네트워크 오류로 실패하면 그 발자국을 대기열에 넣고 `queued`로 간다(시트에서 고른 걸 잃지 않게).

시트(`CheckinSheet`)는 그대로 쓴다. 오프라인이면 목록 위에 "연결이 끊겨 있어서 내 아지트만 보여드려요" 한 줄.

### 2. 올리기 (`useCheckinQueue`, 지도 화면)
- 호출 시점: 지도 포커스, 앱이 앞으로 나올 때(`AppState` active), 연결이 돌아올 때(`addNetworkStateListener`에서 온라인으로 바뀜).
- 동시에 두 번 돌지 않게 한 번에 하나(`flushing` 플래그).
- 오래된 순으로 하나씩 `submitCheckin(item.fix, item.target)`:
  - 성공 → 대기열에서 빼고 결과를 `celebrations` 목록 끝에 추가.
  - `too_far`·`weak_gps`·`not_yours` → 빼고 `dropped` 카운트 +1.
  - `cooldown` → 조용히 뺀다(이미 다녀간 곳, 응답이 끊겨 다시 보낸 경우 포함).
  - 그 밖(네트워크·서버 오류) → 멈추고 남겨 둔다(다음 시점에 다시).
- 7일 넘은 항목은 올리기 전에 뺀다.
- 하나라도 성공하면 끝나고 아지트·안개·동을 새로 불러온다.
- 지도: `celebrations[0]`이 있으면 `Celebration`을 띄우고, 닫으면 다음 것. 닫을 때 기존 처리(⑥-1 권한 카드 확인 포함)를 그대로 한다. `dropped > 0`이면 한 줄 안내 "챙겨둔 발자국 N개는 남기지 못했어요. 너무 멀었거나 위치가 흐렸어요." + [닫기].
- 사용자가 직접 체크인 중이면(`checkin.state`가 `idle`이 아니면) 축하를 미뤘다가 끝나면 띄운다.

### 3. 오프라인 지도
- `useMyHideouts`·`useMyFog`: 불러오기 성공 때마다 저장본(`map-cache.json`: `{ hideouts, thresholds, fog }`)에 쓴다. 실패하면 저장본이 있으면 그걸 쓰고 `status: 'offline'`. 저장본도 없으면 지금처럼 `error`.
- 지도 위 배지(오프라인일 때): "연결이 끊겨 있어요. 마지막으로 본 지도예요." 대기열이 있으면 "챙겨둔 발자국 N개"를 같이.
- 동 배지: 오프라인이면 숨긴다.
- 도착 알림 등록(⑥-1)은 저장본으로는 하지 않는다(서버에서 받은 목록으로만).

## 데이터

대기열 항목:
```ts
type QueuedCheckin = {
  id: string;          // 폰에서 만든 무작위 id
  fix: Fix;            // { lat, lng, accuracy }
  target: CheckinTarget; // 보통 'mine'·'new'. 온라인 중 보내다 끊기면 'kakao'도
  name: string;        // 안내용(아지트 이름 또는 "새 아지트")
  at: number;          // 챙긴 시각(ms) — 7일 판단용, 서버로는 안 보낸다
};
```

## 파일

| 파일 | 역할 |
|---|---|
| `lib/jsonFile.ts` | 공용: `jsonFile(name, parse)` → `{ read, update }` (파일 하나 + 순서대로 쓰기) |
| `features/arrival/store.ts` | `jsonFile`로 바꾼다(동작 그대로) |
| `lib/network.ts` | `isOffline()`, `onOnline(cb)` |
| `features/checkin/queue.ts` | `enqueueCheckin`, `readQueue`, `flushQueue(submit, now)` — 순수 판단 + 파일 |
| `features/checkin/offlineCandidates.ts` | 저장본 아지트 → 150m 안 `MineCandidate[]` |
| `features/checkin/useCheckin.ts` | 오프라인 분기, `queued` 상태 |
| `features/checkin/useCheckinQueue.ts` | 올리기 시점·축하 목록·거절 수 |
| `features/map/mapCache.ts` | 지도 저장본 읽기/쓰기 |
| `features/map/useMyHideouts.ts`, `features/territory/useMyFog.ts` | 저장본 쓰기·읽기, `offline` 상태 |
| `app/(tabs)/index.tsx` | 배지, 챙김 안내, 축하 이어 띄우기, 거절 안내 |

## 오류 처리

- 네트워크 오류 판정: `FunctionsFetchError`, 또는 PostgREST 오류 메시지에 `Network request failed`/`fetch` 포함. `lib/network.ts`의 `isNetworkError(e)` 하나로.
- 파일이 깨졌으면 빈 대기열·빈 저장본(⑥-1과 같은 원칙).
- 올리기 중 예외는 잡아서 `console.warn`, 대기열은 그대로.

## 테스트

- jest: `offlineCandidates`(150m 경계·가까운 순·등급 전달), `flushQueue`(성공→축하, 거절→dropped, cooldown→조용히, 네트워크 오류→멈춤·남김, 7일), `jsonFile`(⑥-1 store 테스트를 옮김), `useCheckin` 오프라인 분기(후보·챙김·온라인 중 네트워크 실패 → 오프라인/대기열), `useCheckinQueue`(재연결·앞으로 나옴·중복 실행 방지), 지도(배지·축하 이어짐·거절 안내·체크인 중 미룸), `useMyHideouts`/`useMyFog` 저장본.
- 서버 변경 없음 → pgTAP 그대로.
- 실기기(진행상황 문서에 추가): 비행기 모드 발자국 → 챙김 → 비행기 모드 끄기 → 축하, 비행기 모드로 앱 켜기 → 저장본 지도+배지, 멀리서 챙긴 발자국 → 연결 후 "남기지 못했어요".

## 검토 뒤 보완 (2026-09-29)

- 온라인 소식마다 올리기를 시도한다(안드로이드는 처음 상태를 안 보내서 "끊김→연결" 변화만 보면 놓친다). 챙기자마자 한 번 올려 본다.
- 오프라인 후보로 골랐어도 고르는 순간 연결돼 있으면 바로 보낸다(느린 서버 때문에 오프라인 후보가 뜬 경우).
- `Network request timed out`도 연결 실패로 본다.
- "끊겨 있어요" 배지는 정말 연결 문제일 때만. 서버 오류면 저장본을 보여주되 오류 배너·다시 시도. 저장본을 보다가 다시 연결되면 지도를 새로 불러온다.
- 챙기거나 올라간 아지트의 예약 도착 알림을 거둔다.
- 파일 읽기 자체가 실패하면(깨진 게 아니라) 빈 값으로 덮어쓰지 않는다.
- 로그아웃하면 대기열·지도 저장본·도착 알림 기록을 지우고 감시를 멈춘다.

**알려진 한계:** 서버가 받았는데 응답만 끊긴 발자국은 대기열에 남는다. 6시간 안에 다시 올리면 서버 쿨다운으로 걸러지지만, 6시간이 넘은 뒤 올리면 한 번 더 세진다. 막으려면 발자국마다 폰이 만든 id를 서버가 기억해야 한다(서버 변경 — 필요해지면).

## 범위 밖

- 사진 대기열 — ⑥-3.
- 대기 중 발자국을 지도에 마커로 — 필요해지면.
- 발자국 시각을 챙긴 시각으로 기록 — 서버가 폰 시각을 검증할 방법이 생기면.
- 오프라인에서 카카오 장소 후보 — 불가.
