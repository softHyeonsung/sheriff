# 지오펜스 도착 알림 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 내 아지트 150m 안에 2분 머물면 앱이 꺼져 있어도 로컬 알림이 오고, 누르면 체크인이 시작된다.

**Architecture:** OS 지오펜스(`expo-location` + `expo-task-manager`)가 진입/이탈을 백그라운드 태스크로 넘기고, 태스크가 순수 규칙(`decideArrival`)으로 판단해 2분 뒤 로컬 알림을 예약(이탈 시 취소)한다. 감시 목록·알림 기록은 `expo-file-system` JSON 파일 하나. 지도에서 아지트를 불러올 때마다 가까운 20곳을 재등록한다. 서버는 `my_hideouts`에 `last_visited_at`만 추가.

**Tech Stack:** Expo SDK 57, expo-location / expo-task-manager / expo-notifications / expo-file-system(`File`, `Paths`), jest + @testing-library/react-native, Supabase Postgres + pgTAP.

**Spec:** `docs/superpowers/specs/2026-09-29-arrival-alert-design.md`

## Global Constraints

- 반경 150m · 체류 2분 · 장소별 6시간 · 하루 8번(기기 시간 자정 기준) · 야간 22:00~08:00 · 최대 20곳 — 앱 코드 상수(`ARRIVAL`).
- 규칙 판단은 알림 **발송 예정 시각**(진입 + 2분) 기준.
- 알림 identifier `arrival:<아지트 id>`, 안드로이드 채널 `arrival`(온보딩에서 이미 만듦), `data: { hideoutId }`.
- 문구(카피톤 §3.2): 기본 `"{이름} 오셨네요. 발자국 남길까요?"`, 등급 `hut`/`tower`/`palace`면 `"또 왔네요, {이름}. 여기 자주 오시네요 :)"`.
- 권한 카드 문구: 제목 `"다음에 여기 오면 제가 알려드릴까요?"`, 보조 `"앱을 안 켜도 알려드리려면 위치를 '항상 허용'으로 바꿔주세요."`, 버튼 `[좋아요]` `[괜찮아요]`. 평생 한 번.
- 태스크 안 오류는 전부 잡아 `console.error`만. 저장 파일이 없거나 깨지면 빈 값.
- 서버·FCM·기기 토큰 없음.
- 한국어 주석은 주변 코드처럼 짧게. 파일 첫 줄에 경로 주석(`// mobile/src/...`).

## Review Focus

- 이미 예약된 아지트에 OS가 진입 이벤트를 두 번 보냄 → 알림 1개만(같은 id 6시간 규칙이 예약도 셈) — Task 2 테스트.
- 21:59 진입(발송 22:01) → 안 보냄, 07:59 진입(발송 08:01) → 보냄 — Task 2 테스트.
- 이탈 시 **이미 울린** 알림 기록은 지우지 않음(하루 8번에 계속 셈) — Task 4 테스트.
- 같은 알림 응답으로 지도 화면이 다시 마운트돼도 체크인이 두 번 시작되지 않음 — Task 6 테스트.
- 저장 파일이 깨진 JSON → 빈 값으로 시작, 앱/태스크가 죽지 않음 — Task 3 테스트.

---

### Task 1: `my_hideouts`에 `last_visited_at`

**Files:**
- Create: `supabase/migrations/20260929000004_my_hideouts_last_visit.sql`
- Modify: `supabase/tests/database/my_hideouts.test.sql`

**Interfaces:**
- Produces: `my_hideouts()` 행에 `last_visited_at timestamptz | null` (본인 발자국 중 최신 `checkins.created_at`).

- [ ] **Step 1: 실패하는 테스트** — `my_hideouts.test.sql`의 `insert into public.aidut ...` 다음 줄(역할 바꾸기 전)에 추가:

```sql
insert into public.checkins (user_id, aidut_id, coord, created_at)
select 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', a.id, a.coord, t
from public.aidut a, (values ('2026-09-01 10:00+09'::timestamptz), ('2026-09-02 10:00+09'::timestamptz)) v(t)
where a.name = 'A 카페';
insert into public.aidut (owner_uid, name, coord, footprint_count, grade) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'A 빈집', st_setsrid(st_makepoint(126.97, 37.56), 4326)::geography, 0, 'paw');
```

기존 `'my_hideouts는 본인 것만'` 기대값을 `2`로 바꾸고, 좌표 테스트의 `from public.my_hideouts()` 뒤에 `where name = 'A 카페'`를 붙인다. `finish()` 앞에 추가:

```sql
select is((select last_visited_at from public.my_hideouts() where name = 'A 카페'),
  '2026-09-02 10:00+09'::timestamptz, 'last_visited_at = 가장 최근 발자국');
select is((select last_visited_at from public.my_hideouts() where name = 'A 빈집'),
  null, '발자국 없으면 null');
```

- [ ] **Step 2: 실패 확인** — Docker Desktop 켜고 `npx supabase start` 후 `npx supabase test db` (저장소 루트). Expected: `last_visited_at` 컬럼 없음 오류로 FAIL.

- [ ] **Step 3: 마이그레이션**

```sql
-- supabase/migrations/20260929000004_my_hideouts_last_visit.sql
-- 도착 알림: "6시간 안에 발자국 남긴 곳"을 폰이 판단하도록 마지막 발자국 시각을 같이 준다.
drop function public.my_hideouts();
create function public.my_hideouts()
returns table (id uuid, name text, grade text, footprint_count int, lat float8, lng float8, last_visited_at timestamptz)
language sql stable security invoker set search_path = public, extensions as $$
  select a.id, a.name, a.grade, a.footprint_count, st_y(a.coord::geometry), st_x(a.coord::geometry),
    (select max(c.created_at) from public.checkins c where c.aidut_id = a.id and c.user_id = auth.uid())
  from public.aidut a
  where a.owner_uid = auth.uid()
  order by a.created_at
$$;
```

- [ ] **Step 4: 통과 확인** — `npx supabase db reset` 후 `npx supabase test db`. Expected: 전체 PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260929000004_my_hideouts_last_visit.sql supabase/tests/database/my_hideouts.test.sql
git commit -m "feat(db): my_hideouts returns last_visited_at"
```

---

### Task 2: 규칙 — `rules.ts`

**Files:**
- Create: `mobile/src/features/arrival/rules.ts`
- Test: `mobile/src/features/arrival/__tests__/rules.test.ts`

**Interfaces:**
- Consumes: `Grade` from `@/map/grades`.
- Produces:
  - `ARRIVAL = { radiusM: 150, dwellMs: 120000, cooldownMs: 21600000, dailyMax: 8, quietStart: 22, quietEnd: 8, maxRegions: 20, keepMs: 604800000 }`
  - `type ArrivalRegion = { name: string; grade: Grade; lastVisitedAt: string | null }`
  - `type ArrivalLogEntry = { id: string; at: number }` (`at` = 발송 예정 시각 ms)
  - `decideArrival(now: number, id: string, region: ArrivalRegion, log: ArrivalLogEntry[]): boolean`
  - `pickNearest<T extends { lat: number; lng: number }>(items: T[], origin: { lat: number; lng: number }, n: number): T[]`
  - `arrivalMessage(name: string, grade: Grade): string`

- [ ] **Step 1: 실패하는 테스트**

```ts
// mobile/src/features/arrival/__tests__/rules.test.ts
import { ARRIVAL, arrivalMessage, decideArrival, pickNearest, type ArrivalRegion } from '../rules';

const at = (h: number, m = 0, d = 29) => new Date(2026, 8, d, h, m).getTime();
const region: ArrivalRegion = { name: '동네 빵집', grade: 'box', lastVisitedAt: null };

test('낮에 처음 오면 보낸다', () => {
  expect(decideArrival(at(14), 'a', region, [])).toBe(true);
});

test('야간 경계는 발송 시각(진입+2분) 기준', () => {
  expect(decideArrival(at(21, 57), 'a', region, [])).toBe(true); // 21:59 발송
  expect(decideArrival(at(21, 59), 'a', region, [])).toBe(false); // 22:01 발송
  expect(decideArrival(at(7, 57), 'a', region, [])).toBe(false); // 07:59 발송
  expect(decideArrival(at(7, 59), 'a', region, [])).toBe(true); // 08:01 발송
});

test('6시간 안에 발자국 남긴 곳은 안 보낸다', () => {
  const visited = (h: number) => ({ ...region, lastVisitedAt: new Date(at(h)).toISOString() });
  expect(decideArrival(at(14), 'a', visited(9), [])).toBe(false); // 발송 14:02, 5시간 2분 전
  expect(decideArrival(at(14), 'a', visited(8), [])).toBe(true); // 6시간 2분 전
});

test('같은 곳에 6시간 안에 보냈거나 예약돼 있으면 안 보낸다(진입 이벤트 중복 포함)', () => {
  expect(decideArrival(at(14), 'a', region, [{ id: 'a', at: at(14, 2) }])).toBe(false);
  expect(decideArrival(at(14), 'a', region, [{ id: 'a', at: at(9) }])).toBe(false);
  expect(decideArrival(at(14), 'a', region, [{ id: 'a', at: at(8) }])).toBe(true);
  expect(decideArrival(at(14), 'a', region, [{ id: 'b', at: at(14, 2) }])).toBe(true);
});

test('오늘 8번 보냈으면 안 보낸다, 어제 것은 안 센다', () => {
  const today = Array.from({ length: 8 }, (_, i) => ({ id: `x${i}`, at: at(9 + i % 4, i) }));
  expect(decideArrival(at(14), 'a', region, today)).toBe(false);
  expect(decideArrival(at(14), 'a', region, today.slice(1))).toBe(true);
  const yesterday = today.map((e) => ({ ...e, at: e.at - 24 * 3600 * 1000 }));
  expect(decideArrival(at(14), 'a', region, yesterday)).toBe(true);
});

test('pickNearest는 가까운 순으로 n개', () => {
  const origin = { lat: 37.5, lng: 127 };
  const items = [
    { id: 'far', lat: 37.6, lng: 127 },
    { id: 'near', lat: 37.5001, lng: 127 },
    { id: 'mid', lat: 37.51, lng: 127 },
  ];
  expect(pickNearest(items, origin, 2).map((i) => i.id)).toEqual(['near', 'mid']);
  expect(pickNearest(items, origin, ARRIVAL.maxRegions)).toHaveLength(3);
});

test('문구: 작은 집 이상은 단골 문구', () => {
  expect(arrivalMessage('동네 빵집', 'paw')).toBe('동네 빵집 오셨네요. 발자국 남길까요?');
  expect(arrivalMessage('동네 빵집', 'box')).toBe('동네 빵집 오셨네요. 발자국 남길까요?');
  expect(arrivalMessage('동네 빵집', 'hut')).toBe('또 왔네요, 동네 빵집. 여기 자주 오시네요 :)');
  expect(arrivalMessage('동네 빵집', 'palace')).toBe('또 왔네요, 동네 빵집. 여기 자주 오시네요 :)');
});
```

- [ ] **Step 2: 실패 확인** — `cd mobile && npx jest src/features/arrival/__tests__/rules.test.ts`. Expected: FAIL, 모듈 없음.

- [ ] **Step 3: 구현**

```ts
// mobile/src/features/arrival/rules.ts
// 도착 알림을 보낼지, 어디를 감시할지, 뭐라고 말할지 — 전부 순수 함수.
import type { Grade } from '@/map/grades';

const HOUR = 3600 * 1000;
export const ARRIVAL = {
  radiusM: 150,
  dwellMs: 2 * 60 * 1000,
  cooldownMs: 6 * HOUR,
  dailyMax: 8,
  quietStart: 22,
  quietEnd: 8,
  maxRegions: 20, // iOS 지오펜스 한도
  keepMs: 7 * 24 * HOUR,
};

export type ArrivalRegion = { name: string; grade: Grade; lastVisitedAt: string | null };
// at = 알림이 울리는(울릴) 시각. 이탈로 취소된 예약은 기록에서 빠진다.
export type ArrivalLogEntry = { id: string; at: number };

export function decideArrival(now: number, id: string, region: ArrivalRegion, log: ArrivalLogEntry[]): boolean {
  const fireAt = now + ARRIVAL.dwellMs;
  const hour = new Date(fireAt).getHours();
  if (hour >= ARRIVAL.quietStart || hour < ARRIVAL.quietEnd) return false;
  if (region.lastVisitedAt && fireAt - Date.parse(region.lastVisitedAt) < ARRIVAL.cooldownMs) return false;
  if (log.some((e) => e.id === id && Math.abs(fireAt - e.at) < ARRIVAL.cooldownMs)) return false;
  const dayStart = new Date(fireAt);
  dayStart.setHours(0, 0, 0, 0);
  return log.filter((e) => e.at >= dayStart.getTime()).length < ARRIVAL.dailyMax;
}

export function pickNearest<T extends { lat: number; lng: number }>(items: T[], origin: { lat: number; lng: number }, n: number): T[] {
  // 순서만 필요하니 평면 근사로 충분하다.
  const k = Math.cos((origin.lat * Math.PI) / 180);
  const d2 = (p: { lat: number; lng: number }) => (p.lat - origin.lat) ** 2 + ((p.lng - origin.lng) * k) ** 2;
  return [...items].sort((a, b) => d2(a) - d2(b)).slice(0, n);
}

const REGULAR: Grade[] = ['hut', 'tower', 'palace'];

export function arrivalMessage(name: string, grade: Grade): string {
  return REGULAR.includes(grade) ? `또 왔네요, ${name}. 여기 자주 오시네요 :)` : `${name} 오셨네요. 발자국 남길까요?`;
}
```

- [ ] **Step 4: 통과 확인** — 같은 명령. Expected: 7 PASS.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/features/arrival/rules.ts mobile/src/features/arrival/__tests__/rules.test.ts
git commit -m "feat(arrival): alert rules, nearest regions, copy"
```

---

### Task 3: 저장 파일 — `store.ts` (+ 의존성)

**Files:**
- Modify: `mobile/package.json` (expo install로)
- Create: `mobile/src/features/arrival/store.ts`
- Test: `mobile/src/features/arrival/__tests__/store.test.ts`

**Interfaces:**
- Consumes: `ARRIVAL`, `ArrivalRegion`, `ArrivalLogEntry` (Task 2).
- Produces:
  - `type ArrivalData = { regions: Record<string, ArrivalRegion>; log: ArrivalLogEntry[]; offerSeen: boolean }`
  - `readArrival(): Promise<ArrivalData>`
  - `writeArrival(data: ArrivalData, now?: number): Promise<void>` — 7일 넘은 기록은 버린다.

- [ ] **Step 1: 의존성** — `cd mobile && npx expo install expo-task-manager expo-file-system` (PowerShell에서). `package.json` dependencies에 두 줄이 생겼는지 확인.

- [ ] **Step 2: 실패하는 테스트**

```ts
// mobile/src/features/arrival/__tests__/store.test.ts
import { readArrival, writeArrival } from '../store';

const disk: Record<string, string> = {};
jest.mock('expo-file-system', () => ({
  Paths: { document: 'doc' },
  File: class {
    uri: string;
    constructor(dir: string, name: string) { this.uri = `${dir}/${name}`; }
    get exists() { return this.uri in disk; }
    create() { disk[this.uri] = ''; }
    async text() { return disk[this.uri]; }
    write(s: string) { disk[this.uri] = s; }
  },
}));

beforeEach(() => { for (const k in disk) delete disk[k]; });

const EMPTY = { regions: {}, log: [], offerSeen: false };

test('파일이 없으면 빈 값', async () => {
  expect(await readArrival()).toEqual(EMPTY);
});

test('깨진 파일이면 빈 값', async () => {
  disk['doc/arrival.json'] = '{oops';
  expect(await readArrival()).toEqual(EMPTY);
});

test('쓰고 읽으면 그대로, 7일 넘은 기록은 버린다', async () => {
  const now = Date.UTC(2026, 8, 29);
  const day = 24 * 3600 * 1000;
  await writeArrival(
    {
      regions: { a: { name: 'A', grade: 'box', lastVisitedAt: null } },
      log: [{ id: 'a', at: now - 8 * day }, { id: 'a', at: now - day }],
      offerSeen: true,
    },
    now,
  );
  expect(await readArrival()).toEqual({
    regions: { a: { name: 'A', grade: 'box', lastVisitedAt: null } },
    log: [{ id: 'a', at: now - day }],
    offerSeen: true,
  });
});
```

- [ ] **Step 3: 실패 확인** — `npx jest src/features/arrival/__tests__/store.test.ts`. Expected: FAIL, 모듈 없음.

- [ ] **Step 4: 구현**

```ts
// mobile/src/features/arrival/store.ts
// 감시 목록·알림 기록·카드 본 적 있음을 파일 하나에. 백그라운드 태스크에서도 읽혀야 해서 파일로 둔다.
import { File, Paths } from 'expo-file-system';
import { ARRIVAL, type ArrivalLogEntry, type ArrivalRegion } from './rules';

export type ArrivalData = { regions: Record<string, ArrivalRegion>; log: ArrivalLogEntry[]; offerSeen: boolean };

const file = () => new File(Paths.document, 'arrival.json');
const empty = (): ArrivalData => ({ regions: {}, log: [], offerSeen: false });

// ponytail: 읽고-고쳐-쓰기에 잠금 없음. 태스크와 지도 재등록이 같은 순간에 쓰면 한쪽 변경이 사라질 수 있다
// (최악: 알림 한 번 더). 문제가 되면 regions와 log를 파일 둘로 나눈다.
export async function readArrival(): Promise<ArrivalData> {
  try {
    const f = file();
    if (!f.exists) return empty();
    return { ...empty(), ...JSON.parse(await f.text()) };
  } catch {
    return empty(); // 깨진 파일: 알림 한 번 더 가는 게 앱이 멈추는 것보다 낫다
  }
}

export async function writeArrival(data: ArrivalData, now = Date.now()): Promise<void> {
  const f = file();
  if (!f.exists) f.create();
  f.write(JSON.stringify({ ...data, log: data.log.filter((e) => now - e.at < ARRIVAL.keepMs) }));
}
```

- [ ] **Step 5: 통과 확인** — 같은 명령. Expected: 3 PASS.

- [ ] **Step 6: Commit**

```bash
git add mobile/package.json mobile/package-lock.json mobile/src/features/arrival/store.ts mobile/src/features/arrival/__tests__/store.test.ts
git commit -m "feat(arrival): local store for regions and alert log"
```

---

### Task 4: 백그라운드 태스크 — `task.ts` (+ 앱 설정)

**Files:**
- Create: `mobile/src/features/arrival/task.ts`
- Test: `mobile/src/features/arrival/__tests__/task.test.ts`
- Modify: `mobile/src/app/_layout.tsx:1` (import 한 줄)
- Modify: `mobile/app.json` (`expo-location` 플러그인 옵션)

**Interfaces:**
- Consumes: `readArrival`, `writeArrival` (Task 3), `ARRIVAL`, `decideArrival`, `arrivalMessage` (Task 2).
- Produces:
  - `ARRIVAL_TASK = 'arrival-geofence'`
  - `handleGeofenceEvent(e: { eventType: Location.GeofencingEventType; region: Location.LocationRegion }, now?: number): Promise<void>`

- [ ] **Step 1: 실패하는 테스트**

```ts
// mobile/src/features/arrival/__tests__/task.test.ts
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { readArrival, writeArrival } from '../store';
import { ARRIVAL_TASK, handleGeofenceEvent } from '../task';

jest.mock('expo-task-manager', () => ({ defineTask: jest.fn() }));
jest.mock('expo-location', () => ({ GeofencingEventType: { Enter: 1, Exit: 2 } }));
jest.mock('expo-notifications', () => ({
  scheduleNotificationAsync: jest.fn(),
  cancelScheduledNotificationAsync: jest.fn(),
  SchedulableTriggerInputTypes: { TIME_INTERVAL: 'timeInterval' },
}));
jest.mock('../store', () => ({ readArrival: jest.fn(), writeArrival: jest.fn() }));

const read = readArrival as jest.Mock;
const write = writeArrival as jest.Mock;
const schedule = Notifications.scheduleNotificationAsync as jest.Mock;
const cancel = Notifications.cancelScheduledNotificationAsync as jest.Mock;
const now = new Date(2026, 8, 29, 14, 0).getTime();
const region = { identifier: 'a', latitude: 37.5, longitude: 127, radius: 150 };
const data = (log: { id: string; at: number }[] = []) => ({
  regions: { a: { name: '동네 빵집', grade: 'hut', lastVisitedAt: null } },
  log,
  offerSeen: false,
});

beforeEach(() => jest.clearAllMocks());

test('태스크를 등록해 둔다', () => {
  expect(TaskManager.defineTask).toHaveBeenCalledWith(ARRIVAL_TASK, expect.any(Function));
});

test('진입하면 2분 뒤 알림을 예약하고 기록한다', async () => {
  read.mockResolvedValue(data());
  await handleGeofenceEvent({ eventType: 1, region }, now);
  expect(schedule).toHaveBeenCalledWith({
    identifier: 'arrival:a',
    content: { body: '또 왔네요, 동네 빵집. 여기 자주 오시네요 :)', data: { hideoutId: 'a' } },
    trigger: { type: 'timeInterval', seconds: 120, channelId: 'arrival' },
  });
  expect(write).toHaveBeenCalledWith({ ...data(), log: [{ id: 'a', at: now + 120000 }] }, now);
});

test('규칙이 막으면 아무것도 안 한다', async () => {
  read.mockResolvedValue(data([{ id: 'a', at: now + 60000 }])); // 이미 예약됨(진입 중복)
  await handleGeofenceEvent({ eventType: 1, region }, now);
  expect(schedule).not.toHaveBeenCalled();
  expect(write).not.toHaveBeenCalled();
});

test('모르는 곳이면 무시', async () => {
  read.mockResolvedValue(data());
  await handleGeofenceEvent({ eventType: 1, region: { ...region, identifier: 'zzz' } }, now);
  expect(schedule).not.toHaveBeenCalled();
});

test('이탈하면 예약을 취소하고 아직 안 울린 기록만 지운다', async () => {
  const rang = { id: 'a', at: now - 3600000 };
  const pending = { id: 'a', at: now + 60000 };
  const other = { id: 'b', at: now + 60000 };
  read.mockResolvedValue(data([rang, pending, other]));
  await handleGeofenceEvent({ eventType: 2, region }, now);
  expect(cancel).toHaveBeenCalledWith('arrival:a');
  expect(write).toHaveBeenCalledWith({ ...data(), log: [rang, other] }, now);
});
```

- [ ] **Step 2: 실패 확인** — `npx jest src/features/arrival/__tests__/task.test.ts`. Expected: FAIL, 모듈 없음.

- [ ] **Step 3: 구현**

```ts
// mobile/src/features/arrival/task.ts
// OS가 지오펜스 진입/이탈 때 깨우는 태스크. 앱이 꺼진 채 깨어나도 정의돼 있도록 _layout에서 import한다.
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { ARRIVAL, arrivalMessage, decideArrival } from './rules';
import { readArrival, writeArrival } from './store';

export const ARRIVAL_TASK = 'arrival-geofence';

type GeofenceEvent = { eventType: Location.GeofencingEventType; region: Location.LocationRegion };

export async function handleGeofenceEvent({ eventType, region }: GeofenceEvent, now = Date.now()): Promise<void> {
  const id = region.identifier;
  if (!id) return;
  const key = `arrival:${id}`;
  const data = await readArrival();

  if (eventType === Location.GeofencingEventType.Exit) {
    // 2분 안에 떠났다 = 스쳐 지나감. 이미 울린 기록은 하루 횟수에 계속 센다.
    await Notifications.cancelScheduledNotificationAsync(key);
    await writeArrival({ ...data, log: data.log.filter((e) => !(e.id === id && e.at > now)) }, now);
    return;
  }

  const target = data.regions[id];
  if (!target || !decideArrival(now, id, target, data.log)) return;
  await Notifications.scheduleNotificationAsync({
    identifier: key,
    content: { body: arrivalMessage(target.name, target.grade), data: { hideoutId: id } },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: ARRIVAL.dwellMs / 1000, channelId: 'arrival' },
  });
  await writeArrival({ ...data, log: [...data.log, { id, at: now + ARRIVAL.dwellMs }] }, now);
}

TaskManager.defineTask<GeofenceEvent>(ARRIVAL_TASK, async ({ data, error }) => {
  // 태스크가 던지면 OS가 다음 이벤트를 안 줄 수 있다 — 전부 잡는다.
  if (error) {
    console.error('도착 알림 태스크 오류', error);
    return;
  }
  try {
    await handleGeofenceEvent(data);
  } catch (e) {
    console.error('도착 알림 처리 실패', e);
  }
});
```

- [ ] **Step 4: 통과 확인** — 같은 명령. Expected: 5 PASS.

- [ ] **Step 5: 진입점에 연결** — `mobile/src/app/_layout.tsx` 맨 위 import 묶음 첫 줄 앞에:

```ts
import '@/features/arrival/task'; // 백그라운드에서 깨어나도 태스크가 정의돼 있어야 한다
```

- [ ] **Step 6: 앱 설정** — `mobile/app.json`의 `expo-location` 플러그인 옵션을 다음으로 교체:

```json
[
  "expo-location",
  {
    "locationWhenInUsePermission": "지금 있는 곳을 지도에 보여주고 발자국을 남기려면 위치가 필요해요.",
    "locationAlwaysAndWhenInUsePermission": "아지트 근처에 도착하면 알려드리려고 앱을 안 켜도 위치를 확인해요.",
    "isIosBackgroundLocationEnabled": true,
    "isAndroidBackgroundLocationEnabled": true
  }
]
```

- [ ] **Step 7: 전체 확인** — `npx tsc --noEmit && npx jest`. Expected: 타입 오류 없음, 전체 PASS.

- [ ] **Step 8: Commit**

```bash
git add mobile/src/features/arrival/task.ts mobile/src/features/arrival/__tests__/task.test.ts mobile/src/app/_layout.tsx mobile/app.json
git commit -m "feat(arrival): geofence background task schedules/cancels alerts"
```

---

### Task 5: 등록·권한 — `register.ts` + `useMyHideouts` 연결

**Files:**
- Create: `mobile/src/features/arrival/register.ts`
- Test: `mobile/src/features/arrival/__tests__/register.test.ts`
- Modify: `mobile/src/features/map/useMyHideouts.ts`
- Modify: `mobile/src/features/map/__tests__/useMyHideouts.test.ts`

**Interfaces:**
- Consumes: `ARRIVAL_TASK` (Task 4), `readArrival`/`writeArrival` (Task 3), `ARRIVAL`/`pickNearest` (Task 2), `askNotifications` from `@/features/onboarding/permissions`, `MyHideout` from `@/features/map/useMyHideouts` (type-only).
- Produces:
  - `MyHideout`에 `lastVisitedAt: string | null` 추가.
  - `syncArrivalRegions(hideouts: MyHideout[]): Promise<void>`
  - `shouldOfferArrival(footprintCount: number): Promise<boolean>`
  - `answerArrivalOffer(accept: boolean): Promise<boolean>` — 허용되면 true.

- [ ] **Step 1: 실패하는 테스트**

```ts
// mobile/src/features/arrival/__tests__/register.test.ts
import * as Location from 'expo-location';
import { askNotifications } from '@/features/onboarding/permissions';
import { readArrival, writeArrival } from '../store';
import { answerArrivalOffer, shouldOfferArrival, syncArrivalRegions } from '../register';

jest.mock('expo-location', () => ({
  getBackgroundPermissionsAsync: jest.fn(),
  requestForegroundPermissionsAsync: jest.fn(),
  requestBackgroundPermissionsAsync: jest.fn(),
  getLastKnownPositionAsync: jest.fn(),
  startGeofencingAsync: jest.fn(),
  stopGeofencingAsync: jest.fn(),
  hasStartedGeofencingAsync: jest.fn(),
}));
jest.mock('../task', () => ({ ARRIVAL_TASK: 'arrival-geofence' }));
jest.mock('../store', () => ({ readArrival: jest.fn(), writeArrival: jest.fn() }));
jest.mock('@/features/onboarding/permissions', () => ({ askNotifications: jest.fn() }));

const L = Location as jest.Mocked<typeof Location>;
const read = readArrival as jest.Mock;
const write = writeArrival as jest.Mock;
const EMPTY = { regions: {}, log: [], offerSeen: false };
const bg = (status: string) => L.getBackgroundPermissionsAsync.mockResolvedValue({ status } as never);
const h = (id: string, lat: number) => ({ id, name: id, grade: 'box' as const, footprintCount: 2, lat, lng: 127, lastVisitedAt: null });

beforeEach(() => {
  jest.clearAllMocks();
  read.mockResolvedValue(EMPTY);
});

test('항상 허용이 아니면 등록하지 않는다', async () => {
  bg('denied');
  await syncArrivalRegions([h('a', 37.5)]);
  expect(L.startGeofencingAsync).not.toHaveBeenCalled();
});

test('내 위치에서 가까운 20곳을 150m로 등록하고 목록을 저장한다', async () => {
  bg('granted');
  L.getLastKnownPositionAsync.mockResolvedValue({ coords: { latitude: 37.5, longitude: 127 } } as never);
  const many = Array.from({ length: 25 }, (_, i) => h(`h${i}`, 37.5 + i * 0.001)).reverse();
  await syncArrivalRegions(many);
  const regions = L.startGeofencingAsync.mock.calls[0][1]!;
  expect(L.startGeofencingAsync.mock.calls[0][0]).toBe('arrival-geofence');
  expect(regions).toHaveLength(20);
  expect(regions[0]).toEqual({ identifier: 'h0', latitude: 37.5, longitude: 127, radius: 150 });
  expect(Object.keys(write.mock.calls[0][0].regions)).toHaveLength(20);
  expect(write.mock.calls[0][0].regions.h0).toEqual({ name: 'h0', grade: 'box', lastVisitedAt: null });
});

test('위치를 모르면 첫 아지트 기준', async () => {
  bg('granted');
  L.getLastKnownPositionAsync.mockResolvedValue(null);
  await syncArrivalRegions([h('a', 37.5), h('b', 37.6)]);
  expect(L.startGeofencingAsync.mock.calls[0][1]![0].identifier).toBe('a');
});

test('아지트가 없으면 감시를 끈다', async () => {
  bg('granted');
  L.hasStartedGeofencingAsync.mockResolvedValue(true);
  await syncArrivalRegions([]);
  expect(L.stopGeofencingAsync).toHaveBeenCalledWith('arrival-geofence');
});

test('카드는 발자국 2개 이상 + 본 적 없음 + 항상 허용 아님일 때만', async () => {
  bg('denied');
  expect(await shouldOfferArrival(1)).toBe(false);
  expect(await shouldOfferArrival(2)).toBe(true);
  read.mockResolvedValue({ ...EMPTY, offerSeen: true });
  expect(await shouldOfferArrival(2)).toBe(false);
  read.mockResolvedValue(EMPTY);
  bg('granted');
  expect(await shouldOfferArrival(2)).toBe(false);
});

test('괜찮아요: 본 것으로 기록만', async () => {
  expect(await answerArrivalOffer(false)).toBe(false);
  expect(write).toHaveBeenCalledWith({ ...EMPTY, offerSeen: true });
  expect(L.requestBackgroundPermissionsAsync).not.toHaveBeenCalled();
});

test('좋아요: 알림 → 위치 → 항상 허용 순서로 묻는다', async () => {
  L.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' } as never);
  L.requestBackgroundPermissionsAsync.mockResolvedValue({ status: 'granted' } as never);
  expect(await answerArrivalOffer(true)).toBe(true);
  expect(write).toHaveBeenCalledWith({ ...EMPTY, offerSeen: true });
  expect((askNotifications as jest.Mock).mock.invocationCallOrder[0])
    .toBeLessThan(L.requestBackgroundPermissionsAsync.mock.invocationCallOrder[0]);
});

test('좋아요인데 위치를 거절하면 항상 허용은 안 묻는다', async () => {
  L.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'denied' } as never);
  expect(await answerArrivalOffer(true)).toBe(false);
  expect(L.requestBackgroundPermissionsAsync).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: 실패 확인** — `npx jest src/features/arrival/__tests__/register.test.ts`. Expected: FAIL, 모듈 없음.

- [ ] **Step 3: 구현**

```ts
// mobile/src/features/arrival/register.ts
// 감시할 아지트 등록과 "항상 허용" 권한 카드.
import * as Location from 'expo-location';
import type { MyHideout } from '@/features/map/useMyHideouts';
import { askNotifications } from '@/features/onboarding/permissions';
import { ARRIVAL, pickNearest } from './rules';
import { readArrival, writeArrival } from './store';
import { ARRIVAL_TASK } from './task';

async function backgroundGranted(): Promise<boolean> {
  return (await Location.getBackgroundPermissionsAsync()).status === 'granted';
}

// ponytail: 앱을 열 때만 갱신 — 아지트 20곳 초과 + 오래 안 연 채 먼 동네면 거기선 알림이 없다.
// 필요해지면 "내 위치 큰 원 이탈 시 재등록"을 추가.
export async function syncArrivalRegions(hideouts: MyHideout[]): Promise<void> {
  if (!(await backgroundGranted())) return;
  if (hideouts.length === 0) {
    if (await Location.hasStartedGeofencingAsync(ARRIVAL_TASK)) await Location.stopGeofencingAsync(ARRIVAL_TASK);
    return;
  }
  const last = await Location.getLastKnownPositionAsync();
  const origin = last ? { lat: last.coords.latitude, lng: last.coords.longitude } : hideouts[0];
  const picked = pickNearest(hideouts, origin, ARRIVAL.maxRegions);
  const data = await readArrival();
  await writeArrival({
    ...data,
    regions: Object.fromEntries(picked.map((h) => [h.id, { name: h.name, grade: h.grade, lastVisitedAt: h.lastVisitedAt }])),
  });
  await Location.startGeofencingAsync(
    ARRIVAL_TASK,
    picked.map((h) => ({ identifier: h.id, latitude: h.lat, longitude: h.lng, radius: ARRIVAL.radiusM })),
  );
}

export async function shouldOfferArrival(footprintCount: number): Promise<boolean> {
  if (footprintCount < 2) return false;
  if ((await readArrival()).offerSeen) return false;
  return !(await backgroundGranted());
}

// 어떤 답이든 카드는 다시 안 띄운다. 허용까지 가면 true.
export async function answerArrivalOffer(accept: boolean): Promise<boolean> {
  const data = await readArrival();
  await writeArrival({ ...data, offerSeen: true });
  if (!accept) return false;
  await askNotifications();
  if ((await Location.requestForegroundPermissionsAsync()).status !== 'granted') return false;
  return (await Location.requestBackgroundPermissionsAsync()).status === 'granted';
}
```

- [ ] **Step 4: 통과 확인** — 같은 명령. Expected: 8 PASS.

- [ ] **Step 5: `useMyHideouts` 테스트 먼저 고치기** — `useMyHideouts.test.ts`에서:
  - mock 추가: `jest.mock('@/features/arrival/register', () => ({ syncArrivalRegions: jest.fn().mockResolvedValue(undefined) }));` 와 `import { syncArrivalRegions } from '@/features/arrival/register';`
  - 첫 테스트 rpc 데이터 `a1` 행에 `last_visited_at: '2026-09-29T01:00:00Z'`, 기대값 객체에 `lastVisitedAt: '2026-09-29T01:00:00Z'` 추가, 끝에 `expect(syncArrivalRegions).toHaveBeenCalledWith(result.current.hideouts);`
  - 테스트 추가:

```ts
test('등록이 실패해도 지도는 ready', async () => {
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  (syncArrivalRegions as jest.Mock).mockRejectedValueOnce(new Error('perm'));
  rpc.mockResolvedValue({ data: [], error: null });
  const { result } = await renderHook(() => useMyHideouts());
  await waitFor(() => expect(result.current.status).toBe('ready'));
  await waitFor(() => expect(console.warn).toHaveBeenCalled());
});
```

Run: `npx jest src/features/map/__tests__/useMyHideouts.test.ts`. Expected: FAIL (`lastVisitedAt` 없음, sync 안 불림).

- [ ] **Step 6: `useMyHideouts` 구현** — `useMyHideouts.ts`:
  - import 추가: `import { syncArrivalRegions } from '@/features/arrival/register';`
  - `MyHideout`에 `lastVisitedAt: string | null`, `Row`에 `last_visited_at: string | null`.
  - map에 `lastVisitedAt: r.last_visited_at` 추가.
  - `setHideouts(...)` 부분을 다음으로:

```ts
      const list = ((rows.data ?? []) as Row[])
        // an unknown grade has no marker art — skip it rather than crash the map
        .filter((r) => isGrade(r.grade))
        .map((r) => ({
          id: r.id,
          name: r.name,
          grade: r.grade as Grade,
          footprintCount: r.footprint_count,
          lat: r.lat,
          lng: r.lng,
          lastVisitedAt: r.last_visited_at,
        }));
      setHideouts(list);
      // 도착 알림 감시 목록도 같이 갱신. 실패해도 지도는 그대로(다음 포커스에 다시).
      syncArrivalRegions(list).catch((e) => console.warn('도착 알림 등록 실패', e));
```

- [ ] **Step 7: 통과 확인** — `npx tsc --noEmit && npx jest`. Expected: 전체 PASS (다른 곳에서 `MyHideout`을 만드는 테스트가 타입 오류를 내면 `lastVisitedAt: null`을 넣어 고친다).

- [ ] **Step 8: Commit**

```bash
git add mobile/src/features/arrival/register.ts mobile/src/features/arrival/__tests__/register.test.ts mobile/src/features/map/useMyHideouts.ts mobile/src/features/map/__tests__/useMyHideouts.test.ts
git commit -m "feat(arrival): register nearest 20 hideouts, always-allow offer"
```

---

### Task 6: 카드·알림 탭 — `ArrivalOffer`, `useArrivalTap`, 지도 연결

**Files:**
- Create: `mobile/src/features/arrival/ArrivalOffer.tsx`
- Create: `mobile/src/features/arrival/useArrivalTap.ts`
- Test: `mobile/src/features/arrival/__tests__/ArrivalOffer.test.tsx`
- Test: `mobile/src/features/arrival/__tests__/useArrivalTap.test.ts`
- Modify: `mobile/src/app/(tabs)/index.tsx`

**Interfaces:**
- Consumes: `shouldOfferArrival`, `answerArrivalOffer` (Task 5), `useCheckin().start`.
- Produces:
  - `ArrivalOffer({ onAnswer }: { onAnswer: (accept: boolean) => void })`
  - `useArrivalTap(onArrive: () => void): void`

- [ ] **Step 1: 실패하는 테스트**

```tsx
// mobile/src/features/arrival/__tests__/ArrivalOffer.test.tsx
import { fireEvent, render, screen } from '@testing-library/react-native';
import { ArrivalOffer } from '../ArrivalOffer';

test('문구와 두 버튼', async () => {
  const onAnswer = jest.fn();
  await render(<ArrivalOffer onAnswer={onAnswer} />);
  expect(screen.getByText('다음에 여기 오면 제가 알려드릴까요?')).toBeTruthy();
  expect(screen.getByText("앱을 안 켜도 알려드리려면 위치를 '항상 허용'으로 바꿔주세요.")).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: '좋아요' }));
  fireEvent.press(screen.getByRole('button', { name: '괜찮아요' }));
  expect(onAnswer.mock.calls).toEqual([[true], [false]]);
});
```

```ts
// mobile/src/features/arrival/__tests__/useArrivalTap.test.ts
import { renderHook } from '@testing-library/react-native';
import * as Notifications from 'expo-notifications';
import { useArrivalTap } from '../useArrivalTap';

jest.mock('expo-notifications', () => ({ useLastNotificationResponse: jest.fn() }));
const last = Notifications.useLastNotificationResponse as jest.Mock;
const response = (identifier: string, date: number) => ({ notification: { date, request: { identifier } } });

beforeEach(() => jest.clearAllMocks());

test('도착 알림을 누르면 한 번만 부른다(다시 마운트돼도)', async () => {
  last.mockReturnValue(response('arrival:a', 1));
  const onArrive = jest.fn();
  const first = await renderHook(() => useArrivalTap(onArrive));
  await first.rerender({});
  first.unmount();
  await renderHook(() => useArrivalTap(onArrive));
  expect(onArrive).toHaveBeenCalledTimes(1);
});

test('새 알림 응답이면 다시 부른다', async () => {
  const onArrive = jest.fn();
  last.mockReturnValue(response('arrival:b', 2));
  const h = await renderHook(() => useArrivalTap(onArrive));
  last.mockReturnValue(response('arrival:b', 3));
  await h.rerender({});
  expect(onArrive).toHaveBeenCalledTimes(2);
});

test('도착 알림이 아니거나 응답이 없으면 무시', async () => {
  const onArrive = jest.fn();
  last.mockReturnValue(null);
  const h = await renderHook(() => useArrivalTap(onArrive));
  last.mockReturnValue(response('other', 4));
  await h.rerender({});
  expect(onArrive).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: 실패 확인** — `npx jest src/features/arrival/__tests__/ArrivalOffer.test.tsx src/features/arrival/__tests__/useArrivalTap.test.ts`. Expected: FAIL, 모듈 없음.

- [ ] **Step 3: 구현**

```tsx
// mobile/src/features/arrival/ArrivalOffer.tsx
// 축하 뒤 한 번 뜨는 "항상 허용" 권한 카드.
import { StyleSheet, Text, View } from 'react-native';
import { color, radius, space, type } from '@/constants/tokens';
import { PrimaryButton, TextButton } from '@/features/onboarding/ui';

export function ArrivalOffer({ onAnswer }: { onAnswer: (accept: boolean) => void }) {
  return (
    <View style={styles.card} accessibilityViewIsModal>
      <Text style={styles.title}>다음에 여기 오면 제가 알려드릴까요?</Text>
      <Text style={styles.body}>앱을 안 켜도 알려드리려면 위치를 &apos;항상 허용&apos;으로 바꿔주세요.</Text>
      <PrimaryButton label="좋아요" onPress={() => onAnswer(true)} />
      <TextButton label="괜찮아요" onPress={() => onAnswer(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    position: 'absolute',
    left: space.gutter,
    right: space.gutter,
    bottom: 96,
    gap: 12,
    padding: 20,
    borderRadius: radius.sheet,
    backgroundColor: color.surfaceCard,
    borderWidth: 1,
    borderColor: color.line,
  },
  title: { ...type.subtitle, color: color.ink },
  body: { ...type.body, color: color.inkSub },
});
```

```ts
// mobile/src/features/arrival/useArrivalTap.ts
// 도착 알림을 누르고 들어오면 onArrive 한 번. 지도 화면이 다시 마운트돼도 같은 응답은 다시 처리하지 않는다.
import * as Notifications from 'expo-notifications';
import { useEffect } from 'react';

let handled: string | null = null; // 모듈 변수: 화면 수명보다 오래 기억해야 한다

export function useArrivalTap(onArrive: () => void): void {
  const response = Notifications.useLastNotificationResponse();
  useEffect(() => {
    if (!response) return;
    const { date, request } = response.notification;
    if (!request.identifier.startsWith('arrival:')) return;
    const key = `${request.identifier}@${date}`;
    if (handled === key) return;
    handled = key;
    onArrive();
  }, [response, onArrive]);
}
```

- [ ] **Step 4: 통과 확인** — 같은 명령. Expected: 4 PASS.

- [ ] **Step 5: 지도 연결** — `mobile/src/app/(tabs)/index.tsx`:
  - import 줄 `import { useEffect, useMemo, useRef, useState } from 'react';` → `import { useCallback, useEffect, useMemo, useRef, useState } from 'react';`
  - import 추가(알파벳 순, `@/features/checkin/...` 앞):

```ts
import { ArrivalOffer } from '@/features/arrival/ArrivalOffer';
import { answerArrivalOffer, shouldOfferArrival } from '@/features/arrival/register';
import { useArrivalTap } from '@/features/arrival/useArrivalTap';
```

  - `const centeredOn = useRef...` 줄 다음에:

```ts
  const [arrivalOffer, setArrivalOffer] = useState(false);
  const celebrated = checkin.state.name === 'celebrating' ? checkin.state.result : null;

  // 도착 알림을 누르고 들어오면 바로 체크인. 가까운 내 아지트가 첫 후보로 나온다.
  const { start } = checkin;
  useArrivalTap(
    useCallback(() => {
      setSelectedId(null);
      start();
    }, [start]),
  );
```

  - `<Celebration ... onClose={() => { ... }}` 블록을 다음으로 교체:

```tsx
      {celebrated && (
        <Celebration
          result={celebrated}
          thresholds={thresholds}
          onClose={() => {
            checkin.close();
            retry(); // the marker should show the grown hideout
            fog.refresh(); // the new footprint's cell clears
            dongAt.refresh(); // ratio and stage move with it
            shouldOfferArrival(celebrated.footprintCount)
              .then(setArrivalOffer)
              .catch((e) => console.warn('도착 알림 카드 확인 실패', e));
          }}
        />
      )}
      {arrivalOffer && (
        <ArrivalOffer
          onAnswer={(accept) => {
            setArrivalOffer(false);
            answerArrivalOffer(accept)
              .then((granted) => granted && retry()) // 다시 불러오면서 감시 목록을 등록한다
              .catch((e) => console.warn('도착 알림 켜기 실패', e));
          }}
        />
      )}
```

- [ ] **Step 6: 전체 확인** — `npx tsc --noEmit && npx expo lint && npx jest`. Expected: 오류 없음, 전체 PASS.

- [ ] **Step 7: Commit**

```bash
git add mobile/src/features/arrival/ArrivalOffer.tsx mobile/src/features/arrival/useArrivalTap.ts mobile/src/features/arrival/__tests__/ArrivalOffer.test.tsx mobile/src/features/arrival/__tests__/useArrivalTap.test.ts "mobile/src/app/(tabs)/index.tsx"
git commit -m "feat(arrival): offer card after revisit, tap alert to check in"
```

---

### Task 7: 진행 상황 문서

**Files:**
- Modify: `docs/진행상황.md`

- [ ] **Step 1: 갱신** —
  - "끝난 것" 표에 행 추가: `| ⑥-1 도착 알림 | 아지트 150m 안 2분 머물면 로컬 알림(6시간·하루 8번·야간 제외), 누르면 체크인, 재방문 축하 뒤 "항상 허용" 카드 한 번 | …/specs/2026-09-29-arrival-alert-design.md |`
  - 테스트 줄의 숫자를 실제 `npx jest`·`npx supabase test db` 결과로 교체.
  - 실기기 준비의 dev build 줄에 `**지오펜스(⑥-1에서 추가 — task-manager·백그라운드 위치, dev build 다시 필요)**` 추가.
  - "확인할 것" 끝에 추가: `7. 도착 알림: 재방문 축하 뒤 카드 한 번만, 좋아요 → 항상 허용 팝업(안드로이드는 설정 화면), 앱 끈 채 아지트 도착 2분 → 알림, 1분 만에 떠나면 알림 없음, 알림 탭 → 체크인 시트, 밤 10시 이후엔 안 옴`
  - "다음 개발 단계"를 `- ⑥ 나머지 — 오프라인 큐, 순간 남기기 📷, 프로필 설정(알림 켜기 스위치 포함), 위시리스트·코스`로.
  - 맨 위 갱신 줄을 `> 마지막 갱신: 2026-09-29 · 브랜치 main`으로(push 여부 문구 제거).

- [ ] **Step 2: Commit**

```bash
git add docs/진행상황.md
git commit -m "docs: progress after arrival alerts"
```
