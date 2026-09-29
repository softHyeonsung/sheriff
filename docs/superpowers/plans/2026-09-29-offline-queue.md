# 오프라인 큐 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 네트워크가 끊겨도 발자국을 챙겨 두었다가 연결되면 올리고 축하하며, 끊긴 동안 지도는 마지막 저장본을 보여준다.

**Architecture:** ⑥-1의 "JSON 파일 + 순서대로 쓰기"를 `lib/jsonFile.ts`로 빼서 도착 알림·체크인 대기열·지도 저장본이 같이 쓴다. `useCheckin`은 오프라인이면 저장본 아지트로 후보를 만들고 고른 발자국을 대기열에 넣는다. 지도 화면의 `useCheckinQueue`가 포커스·앞으로 나옴·재연결 때 대기열을 올리고 결과를 축하 목록으로 넘긴다. 서버 변경 없음.

**Tech Stack:** Expo SDK 57, expo-network(신규), expo-file-system(`File`/`Paths`), expo-router, jest + @testing-library/react-native.

**Spec:** `docs/superpowers/specs/2026-09-29-offline-queue-design.md`

## Global Constraints

- 오프라인 판정: `isConnected === false || isInternetReachable === false`. `null`은 온라인으로 본다.
- 오프라인 후보: 저장본 내 아지트 중 **150m 안**, 가까운 순 + "여기에 새로 만들기"(`{ kind: 'new', roadAddress: null }`). 오프라인에서 정확도가 **150m보다 나쁘면** GPS 약함으로 처리.
- 대기열 올리기 결과: 성공 → 축하, `too_far`·`weak_gps`·`not_yours` → 빼고 거절 수 +1, `cooldown` → 조용히 빼기, 그 밖 → 멈추고 남김. **7일** 넘은 항목은 버린다.
- 서버 변경 없음. 발자국 시각은 올라간 시각.
- 문구:
  - 챙김: `"발자국을 챙겨뒀어요. 연결되면 남길게요 🐾"`
  - 시트(오프라인): `"연결이 끊겨 있어서 내 아지트만 보여드려요"`
  - 지도 배지: `"연결이 끊겨 있어요. 마지막으로 본 지도예요."`
  - 대기 개수: `"챙겨둔 발자국 N개"`
  - 거절: `"챙겨둔 발자국 N개는 남기지 못했어요. 너무 멀었거나 위치가 흐렸어요."`
  - `offline` 오류 기본 문구: `"연결이 끊겨 있어요. 잠시 뒤에 다시 해볼까요?"`
- 파일 첫 줄 경로 주석, 한국어 주석은 주변처럼 짧게. 테스트는 `cd mobile` 후 `npx jest …`(PowerShell).

## Review Focus

- 올리는 도중 새 발자국을 챙김 → 둘 다 남는다(대기열 쓰기가 순서대로) — Task 6 테스트.
- 대기열 올리기가 포커스·재연결로 동시에 두 번 불림 → 같은 발자국을 두 번 보내지 않는다 — Task 8 테스트.
- 사용자가 직접 체크인 중에 대기열 결과가 옴 → 축하는 체크인이 끝난 뒤 — Task 9 테스트.
- 온라인으로 판정됐지만 요청이 네트워크 오류 → 후보는 오프라인 목록, 발자국은 대기열 — Task 5·7 테스트.
- 온보딩 첫 발자국을 오프라인에서 남김 → 막히지 않고 다음으로 — Task 7 테스트.

---

### Task 1: 공용 `jsonFile` + 도착 알림 저장소 옮기기

**Files:**
- Create: `mobile/src/lib/jsonFile.ts`
- Test: `mobile/src/lib/__tests__/jsonFile.test.ts`
- Modify: `mobile/src/features/arrival/store.ts` (전체 교체)
- Modify: `mobile/src/features/arrival/__tests__/store.test.ts` (전체 교체)

**Interfaces:**
- Produces:
  - `type JsonFile<T> = { read(): Promise<T>; update(fn: (d: T) => Promise<T | null>): Promise<void> }`
  - `jsonFile<T>(name: string, parse: (raw: unknown) => T): JsonFile<T>` — 파일 없음·깨짐이면 `parse(undefined)`. `update`는 인스턴스별로 한 줄로 처리, `null`이면 안 씀, 앞 작업 실패해도 다음은 돈다.
  - arrival: `readArrival()`, `updateArrival(fn, now?)` 이름·동작 그대로. **`writeArrival` 제거**(쓰는 곳 없음).

- [ ] **Step 1: 실패하는 테스트**

```ts
// mobile/src/lib/__tests__/jsonFile.test.ts
import { jsonFile } from '../jsonFile';

const disk: Record<string, string> = {};
jest.mock('expo-file-system', () => ({
  Paths: { document: 'doc' },
  File: class {
    uri: string;
    constructor(dir: string, name: string) {
      this.uri = `${dir}/${name}`;
    }
    get exists() {
      return this.uri in disk;
    }
    create() {
      disk[this.uri] = '';
    }
    async text() {
      await new Promise((r) => setTimeout(r, 0)); // a real read yields — lets two updates interleave
      return disk[this.uri];
    }
    write(s: string) {
      disk[this.uri] = s;
    }
  },
}));

type Box = { items: string[] };
const parse = (raw: unknown): Box =>
  raw && typeof raw === 'object' && Array.isArray((raw as Box).items) ? (raw as Box) : { items: [] };

beforeEach(() => {
  for (const k in disk) delete disk[k];
});

test('없거나 깨진 파일이면 parse(undefined)', async () => {
  const f = jsonFile('box.json', parse);
  expect(await f.read()).toEqual({ items: [] });
  disk['doc/box.json'] = '{oops';
  expect(await f.read()).toEqual({ items: [] });
});

test('동시에 고쳐도 둘 다 남는다(순서대로)', async () => {
  const f = jsonFile('box.json', parse);
  await Promise.all([
    f.update(async (d) => ({ items: [...d.items, 'a'] })),
    f.update(async (d) => ({ items: [...d.items, 'b'] })),
  ]);
  expect(await f.read()).toEqual({ items: ['a', 'b'] });
});

test('null이면 안 쓰고, 앞 작업이 실패해도 다음은 돈다', async () => {
  const f = jsonFile('box.json', parse);
  await expect(
    f.update(async () => {
      throw new Error('boom');
    }),
  ).rejects.toThrow('boom');
  await f.update(async () => null);
  expect(disk['doc/box.json']).toBeUndefined();
  await f.update(async () => ({ items: ['c'] }));
  expect(await f.read()).toEqual({ items: ['c'] });
});
```

```ts
// mobile/src/features/arrival/__tests__/store.test.ts
import { readArrival, updateArrival } from '../store';

const disk: Record<string, string> = {};
jest.mock('expo-file-system', () => ({
  Paths: { document: 'doc' },
  File: class {
    uri: string;
    constructor(dir: string, name: string) {
      this.uri = `${dir}/${name}`;
    }
    get exists() {
      return this.uri in disk;
    }
    create() {
      disk[this.uri] = '';
    }
    async text() {
      return disk[this.uri];
    }
    write(s: string) {
      disk[this.uri] = s;
    }
  },
}));

beforeEach(() => {
  for (const k in disk) delete disk[k];
});

const EMPTY = { regions: {}, log: [], offerSeen: false };

test('파일이 없거나 깨졌으면 빈 값', async () => {
  expect(await readArrival()).toEqual(EMPTY);
  disk['doc/arrival.json'] = '{oops';
  expect(await readArrival()).toEqual(EMPTY);
});

test('모양이 틀린 파일(log가 배열 아님)이면 빈 기록', async () => {
  disk['doc/arrival.json'] = '{"log":null,"regions":null}';
  expect(await readArrival()).toEqual(EMPTY);
});

test('고쳐 쓰면 그대로, 7일 넘은 기록은 버린다', async () => {
  const now = Date.UTC(2026, 8, 29);
  const day = 24 * 3600 * 1000;
  await updateArrival(
    async () => ({
      regions: { a: { name: 'A', grade: 'box', lastVisitedAt: null } },
      log: [
        { id: 'a', at: now - 8 * day },
        { id: 'a', at: now - day },
      ],
      offerSeen: true,
    }),
    now,
  );
  expect(await readArrival()).toEqual({
    regions: { a: { name: 'A', grade: 'box', lastVisitedAt: null } },
    log: [{ id: 'a', at: now - day }],
    offerSeen: true,
  });
});
```

- [ ] **Step 2: 실패 확인** — `npx jest src/lib/__tests__/jsonFile.test.ts`. Expected: FAIL, `Cannot find module '../jsonFile'`.

- [ ] **Step 3: 구현**

```ts
// mobile/src/lib/jsonFile.ts
// 폰에 두는 작은 JSON 파일 하나. 백그라운드 태스크와 화면이 같이 고쳐도 서로 덮어쓰지 않게
// 읽고-고쳐-쓰기를 파일마다 한 줄로 세운다.
import { File, Paths } from 'expo-file-system';

export type JsonFile<T> = {
  read(): Promise<T>;
  update(fn: (d: T) => Promise<T | null>): Promise<void>;
};

export function jsonFile<T>(name: string, parse: (raw: unknown) => T): JsonFile<T> {
  const file = () => new File(Paths.document, name);
  let queue: Promise<unknown> = Promise.resolve();

  async function read(): Promise<T> {
    let raw: unknown;
    try {
      const f = file();
      if (f.exists) raw = JSON.parse(await f.text());
    } catch {
      raw = undefined; // 깨진 파일: 빈 값으로 시작하는 게 앱이 멈추는 것보다 낫다
    }
    return parse(raw);
  }

  function update(fn: (d: T) => Promise<T | null>): Promise<void> {
    const run = queue.then(async () => {
      const next = await fn(await read());
      if (!next) return;
      const f = file();
      if (!f.exists) f.create();
      f.write(JSON.stringify(next));
    });
    queue = run.catch(() => {}); // 앞 작업이 실패해도 줄은 계속
    return run;
  }

  return { read, update };
}
```

```ts
// mobile/src/features/arrival/store.ts
// 감시 목록·알림 기록·카드 본 적 있음. 백그라운드 태스크에서도 읽혀야 해서 파일로 둔다.
import { jsonFile } from '@/lib/jsonFile';
import { ARRIVAL, type ArrivalLogEntry, type ArrivalRegion } from './rules';

export type ArrivalData = { regions: Record<string, ArrivalRegion>; log: ArrivalLogEntry[]; offerSeen: boolean };

const file = jsonFile<ArrivalData>('arrival.json', (raw) => {
  const d = (raw && typeof raw === 'object' ? raw : {}) as Partial<ArrivalData>;
  return {
    regions: d.regions && typeof d.regions === 'object' ? d.regions : {},
    log: Array.isArray(d.log) ? d.log : [],
    offerSeen: d.offerSeen === true,
  };
});

export const readArrival = file.read;

// 7일 넘은 기록은 쓸 때 버린다.
export function updateArrival(fn: (d: ArrivalData) => Promise<ArrivalData | null>, now = Date.now()): Promise<void> {
  return file.update(async (d) => {
    const next = await fn(d);
    return next && { ...next, log: next.log.filter((e) => now - e.at < ARRIVAL.keepMs) };
  });
}
```

- [ ] **Step 4: 통과 확인** — `npx jest src/lib src/features/arrival`. Expected: 전부 PASS.

- [ ] **Step 5: 확인 + Commit** — `npx tsc --noEmit` 오류 없음(`writeArrival`을 쓰는 곳이 남아 있으면 오류가 난다 — 없어야 정상).

```bash
git add mobile/src/lib mobile/src/features/arrival/store.ts mobile/src/features/arrival/__tests__/store.test.ts
git commit -m "refactor: shared jsonFile store; arrival store uses it"
```

---

### Task 2: 연결 감지 — `lib/network.ts`, `lib/networkError.ts`

**Files:**
- Modify: `mobile/package.json` (expo install)
- Create: `mobile/src/lib/network.ts`, `mobile/src/lib/networkError.ts`
- Test: `mobile/src/lib/__tests__/network.test.ts`, `mobile/src/lib/__tests__/networkError.test.ts`

**Interfaces:**
- Produces:
  - `isOffline(): Promise<boolean>` — 상태를 못 읽으면 `false`.
  - `onOnline(cb: () => void): () => void` — 오프라인→온라인으로 바뀔 때만 cb. 반환값은 해제 함수.
  - `isNetworkError(e: unknown): boolean` — `name === 'FunctionsFetchError'`, 또는 `message`에 `Network request failed`·`Failed to fetch`·`FetchError`·`AbortError`. (순수 — SDK import 없음)

- [ ] **Step 1: 설치·API 확인** — `npx expo install expo-network`. 그다음 `mobile/node_modules/expo-network/build/Network.d.ts`에서 `getNetworkStateAsync`, `addNetworkStateListener`(반환값에 `remove()`), `NetworkState`의 `isConnected?: boolean`·`isInternetReachable?: boolean` 이름을 확인. 다르면 아래 코드를 실제 이름에 맞추고 Ruling으로 남긴다.

- [ ] **Step 2: 실패하는 테스트**

```ts
// mobile/src/lib/__tests__/network.test.ts
import * as Network from 'expo-network';
import { isOffline, onOnline } from '../network';

jest.mock('expo-network', () => ({ getNetworkStateAsync: jest.fn(), addNetworkStateListener: jest.fn() }));
const getState = Network.getNetworkStateAsync as jest.Mock;
const addListener = Network.addNetworkStateListener as jest.Mock;

beforeEach(() => jest.clearAllMocks());

test('끊겼거나 인터넷에 못 닿으면 오프라인, 모르면 온라인', async () => {
  getState.mockResolvedValue({ isConnected: false, isInternetReachable: false });
  expect(await isOffline()).toBe(true);
  getState.mockResolvedValue({ isConnected: true, isInternetReachable: false });
  expect(await isOffline()).toBe(true);
  getState.mockResolvedValue({ isConnected: true, isInternetReachable: null });
  expect(await isOffline()).toBe(false);
  getState.mockRejectedValue(new Error('no module'));
  expect(await isOffline()).toBe(false);
});

test('onOnline은 오프라인→온라인으로 바뀔 때만 부른다', () => {
  const remove = jest.fn();
  let emit: (s: object) => void = () => {};
  addListener.mockImplementation((l: (s: object) => void) => {
    emit = l;
    return { remove };
  });
  const cb = jest.fn();
  const off = onOnline(cb);
  emit({ isConnected: true, isInternetReachable: true }); // 처음부터 온라인
  expect(cb).not.toHaveBeenCalled();
  emit({ isConnected: false, isInternetReachable: false });
  emit({ isConnected: true, isInternetReachable: true });
  expect(cb).toHaveBeenCalledTimes(1);
  emit({ isConnected: true, isInternetReachable: true });
  expect(cb).toHaveBeenCalledTimes(1);
  off();
  expect(remove).toHaveBeenCalled();
});
```

```ts
// mobile/src/lib/__tests__/networkError.test.ts
import { isNetworkError } from '../networkError';

test('연결 실패 모양을 알아본다', () => {
  expect(isNetworkError({ name: 'FunctionsFetchError', message: 'Failed to send a request to the Edge Function' })).toBe(true);
  expect(isNetworkError({ message: 'TypeError: Network request failed', code: '' })).toBe(true);
  expect(isNetworkError({ message: 'AbortError: Aborted', code: '' })).toBe(true);
});

test('서버가 답한 오류는 연결 실패가 아니다', () => {
  expect(isNetworkError({ message: 'too_far', code: 'P0001' })).toBe(false);
  expect(isNetworkError(new Error('network'))).toBe(false);
  expect(isNetworkError(null)).toBe(false);
  expect(isNetworkError('Network request failed')).toBe(false);
});
```

- [ ] **Step 3: 실패 확인** — `npx jest src/lib/__tests__/network.test.ts src/lib/__tests__/networkError.test.ts`. Expected: FAIL, 모듈 없음.

- [ ] **Step 4: 구현**

```ts
// mobile/src/lib/network.ts
// 연결 상태. 모르면(null) 온라인으로 보고 평소처럼 시도한다 — 실패하면 그때 오프라인 경로로.
import * as Network from 'expo-network';

type State = { isConnected?: boolean | null; isInternetReachable?: boolean | null };
const offline = (s: State) => s.isConnected === false || s.isInternetReachable === false;

export async function isOffline(): Promise<boolean> {
  try {
    return offline(await Network.getNetworkStateAsync());
  } catch {
    return false;
  }
}

export function onOnline(cb: () => void): () => void {
  let wasOffline = false;
  const sub = Network.addNetworkStateListener((s) => {
    const now = offline(s);
    if (wasOffline && !now) cb();
    wasOffline = now;
  });
  return () => sub.remove();
}
```

```ts
// mobile/src/lib/networkError.ts
// 서버가 답하지 못한(연결이 안 된) 오류인지. SDK import 없이 모양만 본다.
const FETCH = /Network request failed|Failed to fetch|FetchError|AbortError/;

export function isNetworkError(e: unknown): boolean {
  if (!e || typeof e !== 'object') return false;
  const { name, message } = e as { name?: unknown; message?: unknown };
  if (name === 'FunctionsFetchError') return true;
  return typeof message === 'string' && FETCH.test(message);
}
```

- [ ] **Step 5: 통과 확인** — 같은 명령. Expected: 4 PASS. `npx tsc --noEmit` 오류 없음.

- [ ] **Step 6: Commit**

```bash
git add mobile/package.json mobile/package-lock.json mobile/src/lib/network.ts mobile/src/lib/networkError.ts mobile/src/lib/__tests__/network.test.ts mobile/src/lib/__tests__/networkError.test.ts
git commit -m "feat: network state and network-error detection"
```

---

### Task 3: 체크인 API의 `offline` 오류

**Files:**
- Modify: `mobile/src/features/checkin/errors.ts`, `checkinApi.ts`, `copy.ts`
- Test: `mobile/src/features/checkin/__tests__/checkinApi.test.ts`, `copy.test.ts`

**Interfaces:**
- Consumes: `isNetworkError` (Task 2).
- Produces: `CheckinErrorCode`에 `'offline'` 추가. `suggestPlace`·`submitCheckin`이 연결 실패면 `CheckinError('offline')`(console.error 없이). `messageFor(new CheckinError('offline'))` = `"연결이 끊겨 있어요. 잠시 뒤에 다시 해볼까요?"`.

- [ ] **Step 1: 실패하는 테스트** — `checkinApi.test.ts` 끝에:

```ts
test('연결이 안 되면 offline', async () => {
  invoke.mockResolvedValue({ data: null, error: { name: 'FunctionsFetchError', message: 'Failed to send a request to the Edge Function' } });
  await expect(suggestPlace(fix)).rejects.toMatchObject({ code: 'offline' });
  rpc.mockResolvedValue({ data: null, error: { message: 'TypeError: Network request failed', code: '' } });
  await expect(submitCheckin(fix, { kind: 'new', roadAddress: null })).rejects.toMatchObject({ code: 'offline' });
});
```

`copy.test.ts` 끝에(파일 상단 import에 `CheckinError`가 없으면 `import { CheckinError } from '../errors';` 추가):

```ts
test('offline 문구', () => {
  expect(messageFor(new CheckinError('offline'))).toBe('연결이 끊겨 있어요. 잠시 뒤에 다시 해볼까요?');
});
```

- [ ] **Step 2: 실패 확인** — `npx jest src/features/checkin/__tests__/checkinApi.test.ts src/features/checkin/__tests__/copy.test.ts`. Expected: 새 테스트 2개 FAIL(`unknown`, 기본 문구).

- [ ] **Step 3: 구현**
  - `errors.ts`: `export type CheckinErrorCode = 'too_far' | 'weak_gps' | 'cooldown' | 'not_yours' | 'offline' | 'unknown';`
  - `checkinApi.ts`: import `import { isNetworkError } from '@/lib/networkError';`. `suggestPlace`의 `if (error) {` 바로 안 첫 줄에 `if (isNetworkError(error)) throw new CheckinError('offline');`. `submitCheckin`의 `if (error) {` 바로 안 첫 줄에 같은 줄.
  - `copy.ts`: `MSG`에 `offline: '연결이 끊겨 있어요. 잠시 뒤에 다시 해볼까요?',` 추가, `messageFor`의 switch에 `case 'offline': return MSG.offline;` 추가(`default` 앞).

- [ ] **Step 4: 통과 확인** — 같은 명령. Expected: 전부 PASS.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/features/checkin/errors.ts mobile/src/features/checkin/checkinApi.ts mobile/src/features/checkin/copy.ts mobile/src/features/checkin/__tests__/checkinApi.test.ts mobile/src/features/checkin/__tests__/copy.test.ts
git commit -m "feat(checkin): offline error code for unreachable server"
```

---

### Task 4: 지도 저장본 — `mapCache.ts`, `useMyHideouts`, `useMyFog`

**Files:**
- Create: `mobile/src/features/map/mapCache.ts`
- Test: `mobile/src/features/map/__tests__/mapCache.test.ts`
- Modify: `mobile/src/features/map/useMyHideouts.ts`, `mobile/src/features/territory/useMyFog.ts`
- Modify: `mobile/src/features/map/__tests__/useMyHideouts.test.ts`, `mobile/src/features/territory/__tests__/useMyFog.test.ts`

**Interfaces:**
- Consumes: `jsonFile` (Task 1).
- Produces:
  - `type MapCache = { hideouts: MyHideout[]; thresholds: GradeThresholds | null; fog: FogCell[] | null }`
  - `readMapCache(): Promise<MapCache>`, `saveHideouts(h: MyHideout[], t: GradeThresholds): Promise<void>`, `saveFog(f: FogCell[]): Promise<void>`
  - `useMyHideouts().status`: `'loading' | 'ready' | 'offline' | 'error'` — 실패했는데 저장본(thresholds 있음)이 있으면 `'offline'`.
  - `useMyFog`: 첫 불러오기 실패면 저장본 안개.

- [ ] **Step 1: 실패하는 테스트**

```ts
// mobile/src/features/map/__tests__/mapCache.test.ts
import { readMapCache, saveFog, saveHideouts } from '../mapCache';

const disk: Record<string, string> = {};
jest.mock('expo-file-system', () => ({
  Paths: { document: 'doc' },
  File: class {
    uri: string;
    constructor(dir: string, name: string) {
      this.uri = `${dir}/${name}`;
    }
    get exists() {
      return this.uri in disk;
    }
    create() {
      disk[this.uri] = '';
    }
    async text() {
      return disk[this.uri];
    }
    write(s: string) {
      disk[this.uri] = s;
    }
  },
}));

const cafe = { id: 'a1', name: 'A', grade: 'box' as const, footprintCount: 2, lat: 37.5, lng: 126.9, lastVisitedAt: null };
const T = { box: 2, hut: 5, tower: 10, palace: 20 };
const cell = { sw: { lat: 1, lng: 2 }, ne: { lat: 3, lng: 4 } };

test('비어 있으면 빈 저장본, 아지트와 안개는 따로 저장해도 같이 남는다', async () => {
  expect(await readMapCache()).toEqual({ hideouts: [], thresholds: null, fog: null });
  await Promise.all([saveHideouts([cafe], T), saveFog([cell])]);
  expect(await readMapCache()).toEqual({ hideouts: [cafe], thresholds: T, fog: [cell] });
});
```

`useMyHideouts.test.ts` 수정:
  - mock 추가: `jest.mock('@/features/map/mapCache', () => ({ readMapCache: jest.fn(), saveHideouts: jest.fn().mockResolvedValue(undefined) }));` 와 `import { readMapCache, saveHideouts } from '@/features/map/mapCache';`
  - `beforeEach` 안에 `(readMapCache as jest.Mock).mockResolvedValue({ hideouts: [], thresholds: null, fog: null });`
  - 첫 테스트 끝에 `expect(saveHideouts).toHaveBeenCalledWith(result.current.hideouts, { box: 2, hut: 5, tower: 10, palace: 20 });`
  - 테스트 추가:

```ts
test('실패했는데 저장본이 있으면 저장본을 보여주고 offline', async () => {
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  const cached = { id: 'c1', name: '저장된 곳', grade: 'hut', footprintCount: 5, lat: 37.5, lng: 126.9, lastVisitedAt: null };
  (readMapCache as jest.Mock).mockResolvedValue({ hideouts: [cached], thresholds: { box: 2, hut: 5, tower: 10, palace: 20 }, fog: null });
  rpc.mockResolvedValue({ data: null, error: new Error('network') });
  const { result } = await renderHook(() => useMyHideouts());
  await waitFor(() => expect(result.current.status).toBe('offline'));
  expect(result.current.hideouts).toEqual([cached]);
  expect(result.current.thresholds).toEqual({ box: 2, hut: 5, tower: 10, palace: 20 });
  expect(syncArrivalRegions).not.toHaveBeenCalled(); // 도착 알림은 서버 목록으로만 등록
});
```

`useMyFog.test.ts` 수정: mock 추가 `jest.mock('@/features/map/mapCache', () => ({ readMapCache: jest.fn(), saveFog: jest.fn().mockResolvedValue(undefined) }));`와 import. 테스트 추가(파일의 기존 `myFog` mock 이름을 그대로 쓴다 — 파일 상단에서 `myFog`를 어떻게 부르는지 확인하고 맞춘다):

```ts
test('불러오면 저장하고, 첫 불러오기가 실패하면 저장본 안개', async () => {
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  const cell = { sw: { lat: 1, lng: 2 }, ne: { lat: 3, lng: 4 } };
  (myFog as jest.Mock).mockResolvedValueOnce([cell]);
  const ok = await renderHook(() => useMyFog());
  await waitFor(() => expect(ok.result.current.cells).toEqual([cell]));
  expect(saveFog).toHaveBeenCalledWith([cell]);
  ok.unmount();

  (myFog as jest.Mock).mockRejectedValueOnce(new Error('network'));
  (readMapCache as jest.Mock).mockResolvedValue({ hideouts: [], thresholds: null, fog: [cell] });
  const off = await renderHook(() => useMyFog());
  await waitFor(() => expect(off.result.current.cells).toEqual([cell]));
});
```

- [ ] **Step 2: 실패 확인** — `npx jest src/features/map src/features/territory/__tests__/useMyFog.test.ts`. Expected: 새 테스트 FAIL(모듈 없음 / status error / 저장 안 함).

- [ ] **Step 3: 구현**

```ts
// mobile/src/features/map/mapCache.ts
// 마지막으로 본 지도(아지트·등급 기준·안개). 끊긴 동안 빈 화면 대신 이걸 보여준다.
import { jsonFile } from '@/lib/jsonFile';
import type { FogCell } from '@/map/protocol';
import type { GradeThresholds, MyHideout } from './useMyHideouts';

export type MapCache = { hideouts: MyHideout[]; thresholds: GradeThresholds | null; fog: FogCell[] | null };

const file = jsonFile<MapCache>('map-cache.json', (raw) => {
  const d = (raw && typeof raw === 'object' ? raw : {}) as Partial<MapCache>;
  return {
    hideouts: Array.isArray(d.hideouts) ? d.hideouts : [],
    thresholds: d.thresholds && typeof d.thresholds === 'object' ? d.thresholds : null,
    fog: Array.isArray(d.fog) ? d.fog : null,
  };
});

export const readMapCache = file.read;
export const saveHideouts = (hideouts: MyHideout[], thresholds: GradeThresholds) =>
  file.update(async (d) => ({ ...d, hideouts, thresholds }));
export const saveFog = (fog: FogCell[]) => file.update(async (d) => ({ ...d, fog }));
```

`useMyHideouts.ts`:
  - import `import { readMapCache, saveHideouts } from '@/features/map/mapCache';`
  - `useState<'loading' | 'ready' | 'error'>` → `useState<'loading' | 'ready' | 'offline' | 'error'>`
  - 성공 경로: `setThresholds(cfg.data.value as GradeThresholds);` 다음 줄에 `saveHideouts(list, cfg.data.value as GradeThresholds).catch((e) => console.warn('지도 저장 실패', e));`
  - `catch (e) { ... }` 블록 전체를 다음으로:

```ts
    } catch (e) {
      // 끊겼으면 마지막으로 본 지도를. 저장본도 없으면 지금처럼 오류.
      const cache = await readMapCache().catch(() => null);
      if (cache?.thresholds) {
        console.warn('아지트 불러오기 실패 — 저장본 사용', e);
        setHideouts(cache.hideouts);
        setThresholds(cache.thresholds);
        setStatus('offline');
      } else {
        console.error('아지트 불러오기 실패', e);
        setStatus('error');
      }
    }
```

`useMyFog.ts`의 `refresh`를 다음으로(import `import { readMapCache, saveFog } from '@/features/map/mapCache';`):

```ts
  const refresh = useCallback(async () => {
    try {
      const fresh = await myFog();
      setCells(fresh);
      saveFog(fresh).catch((e) => console.warn('안개 저장 실패', e));
    } catch (e) {
      console.warn('안개 불러오기 실패', e); // 지도는 이전 안개로 계속 보인다
      // 처음 불러오기가 실패했으면 마지막으로 본 안개를
      const cached = (await readMapCache().catch(() => null))?.fog;
      if (cached) setCells((c) => c ?? cached);
    }
  }, []);
```

- [ ] **Step 4: 통과 확인** — 같은 명령, 이어서 `npx tsc --noEmit && npx jest`. Expected: 전부 PASS. (기존 `useMyHideouts` "실패하면 error" 테스트는 저장본이 비어 있어 그대로 통과해야 한다. `console.error` 스파이를 쓰는 기존 테스트가 있으면 그대로 둔다.)

- [ ] **Step 5: Commit**

```bash
git add mobile/src/features/map/mapCache.ts mobile/src/features/map/__tests__/mapCache.test.ts mobile/src/features/map/useMyHideouts.ts mobile/src/features/map/__tests__/useMyHideouts.test.ts mobile/src/features/territory/useMyFog.ts mobile/src/features/territory/__tests__/useMyFog.test.ts
git commit -m "feat(map): cache last map and show it when offline"
```

---

### Task 5: 오프라인 후보 — `offline.ts`

**Files:**
- Create: `mobile/src/features/checkin/offline.ts`
- Test: `mobile/src/features/checkin/__tests__/offline.test.ts`

**Interfaces:**
- Consumes: `isOffline` (Task 2), `readMapCache` (Task 4), `suggestPlace`·`CheckinError('offline')` (Task 3).
- Produces:
  - `OFFLINE_RADIUS_M = 150`, `OFFLINE_ACCURACY_MAX_M = 150`
  - `offlineCandidates(fix: Fix, hideouts: MyHideout[]): MineCandidate[]`
  - `type Suggestion = { status: 'weak_gps' } | { status: 'ok'; hereAddress: string | null; candidates: Candidate[]; offline: boolean }`
  - `suggestOrOffline(fix: Fix): Promise<Suggestion>` — 온라인이면 `suggestPlace`(+`offline: false`), 오프라인이거나 `suggestPlace`가 `offline` 오류면 저장본 후보(+`offline: true`). 오프라인에서 정확도 > 150이면 `weak_gps`.

- [ ] **Step 1: 실패하는 테스트**

```ts
// mobile/src/features/checkin/__tests__/offline.test.ts
import { readMapCache } from '@/features/map/mapCache';
import { isOffline } from '@/lib/network';
import { suggestPlace } from '../checkinApi';
import { CheckinError } from '../errors';
import { offlineCandidates, suggestOrOffline } from '../offline';

jest.mock('@/lib/network', () => ({ isOffline: jest.fn() }));
jest.mock('@/features/map/mapCache', () => ({ readMapCache: jest.fn() }));
// Not requireActual: the real module imports the Supabase client, which needs env vars.
jest.mock('../checkinApi', () => ({ suggestPlace: jest.fn() }));

const fix = { lat: 37.5, lng: 127, accuracy: 20 };
const at = (id: string, dLatM: number, grade = 'box') => ({
  id, name: id, grade, footprintCount: 2, lat: 37.5 + dLatM / 111000, lng: 127, lastVisitedAt: null,
}) as const;

beforeEach(() => {
  jest.clearAllMocks();
  (readMapCache as jest.Mock).mockResolvedValue({ hideouts: [at('far', 200), at('near', 20, 'hut'), at('edge', 149)], thresholds: null, fog: null });
});

test('150m 안 내 아지트만, 가까운 순', () => {
  const c = offlineCandidates(fix, [at('far', 200), at('near', 20, 'hut'), at('edge', 149)] as never);
  expect(c.map((x) => x.aidutId)).toEqual(['near', 'edge']);
  expect(c[0]).toMatchObject({ kind: 'mine', name: 'near', grade: 'hut' });
  expect(c[0].distanceM).toBeGreaterThan(19);
  expect(c[0].distanceM).toBeLessThan(21);
});

test('온라인이면 서버 후보', async () => {
  (isOffline as jest.Mock).mockResolvedValue(false);
  (suggestPlace as jest.Mock).mockResolvedValue({ status: 'ok', hereAddress: '서울 1', candidates: [] });
  expect(await suggestOrOffline(fix)).toEqual({ status: 'ok', hereAddress: '서울 1', candidates: [], offline: false });
  (suggestPlace as jest.Mock).mockResolvedValue({ status: 'weak_gps' });
  expect(await suggestOrOffline(fix)).toEqual({ status: 'weak_gps' });
});

test('오프라인이면 저장본 후보(서버는 안 부름)', async () => {
  (isOffline as jest.Mock).mockResolvedValue(true);
  const s = await suggestOrOffline(fix);
  expect(suggestPlace).not.toHaveBeenCalled();
  expect(s).toMatchObject({ status: 'ok', hereAddress: null, offline: true });
  expect(s.status === 'ok' && s.candidates.map((c) => (c.kind === 'mine' ? c.aidutId : '')).join()).toBe('near,edge');
});

test('온라인 판정인데 연결 실패면 저장본 후보', async () => {
  (isOffline as jest.Mock).mockResolvedValue(false);
  (suggestPlace as jest.Mock).mockRejectedValue(new CheckinError('offline'));
  expect(await suggestOrOffline(fix)).toMatchObject({ status: 'ok', offline: true });
});

test('다른 오류는 그대로 던진다', async () => {
  (isOffline as jest.Mock).mockResolvedValue(false);
  (suggestPlace as jest.Mock).mockRejectedValue(new CheckinError('unknown'));
  await expect(suggestOrOffline(fix)).rejects.toMatchObject({ code: 'unknown' });
});

test('오프라인에서 정확도가 150m보다 나쁘면 GPS 약함', async () => {
  (isOffline as jest.Mock).mockResolvedValue(true);
  expect(await suggestOrOffline({ ...fix, accuracy: 151 })).toEqual({ status: 'weak_gps' });
});
```

- [ ] **Step 2: 실패 확인** — `npx jest src/features/checkin/__tests__/offline.test.ts`. Expected: FAIL, 모듈 없음.

- [ ] **Step 3: 구현**

```ts
// mobile/src/features/checkin/offline.ts
// 끊겼을 때 후보: 저장본의 내 아지트 중 가까운 곳 + 새로 만들기. 카카오 후보는 네트워크가 있어야 한다.
import { readMapCache } from '@/features/map/mapCache';
import type { MyHideout } from '@/features/map/useMyHideouts';
import { isOffline } from '@/lib/network';
import { type Candidate, type Fix, type MineCandidate, suggestPlace } from './checkinApi';
import { CheckinError } from './errors';

export const OFFLINE_RADIUS_M = 150; // 서버 checkin_radius_m와 같은 값
export const OFFLINE_ACCURACY_MAX_M = 150; // 서버 gps_accuracy_max_m와 같은 값

export type Suggestion =
  | { status: 'weak_gps' }
  | { status: 'ok'; hereAddress: string | null; candidates: Candidate[]; offline: boolean };

function metersBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function offlineCandidates(fix: Fix, hideouts: MyHideout[]): MineCandidate[] {
  return hideouts
    .map((h) => ({ kind: 'mine' as const, aidutId: h.id, name: h.name, grade: h.grade, distanceM: metersBetween(fix, h) }))
    .filter((c) => c.distanceM <= OFFLINE_RADIUS_M)
    .sort((a, b) => a.distanceM - b.distanceM);
}

export async function suggestOrOffline(fix: Fix): Promise<Suggestion> {
  if (!(await isOffline())) {
    try {
      const s = await suggestPlace(fix);
      return s.status === 'ok' ? { ...s, offline: false } : s;
    } catch (e) {
      if (!(e instanceof CheckinError && e.code === 'offline')) throw e; // 연결 감지가 늦은 경우만 오프라인으로
    }
  }
  if (fix.accuracy > OFFLINE_ACCURACY_MAX_M) return { status: 'weak_gps' };
  const { hideouts } = await readMapCache();
  return { status: 'ok', hereAddress: null, candidates: offlineCandidates(fix, hideouts), offline: true };
}
```

- [ ] **Step 4: 통과 확인** — 같은 명령. Expected: 6 PASS. `npx tsc --noEmit` 오류 없음.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/features/checkin/offline.ts mobile/src/features/checkin/__tests__/offline.test.ts
git commit -m "feat(checkin): offline candidates from cached hideouts"
```

---

### Task 6: 대기열 — `queue.ts`

**Files:**
- Create: `mobile/src/features/checkin/queue.ts`
- Test: `mobile/src/features/checkin/__tests__/queue.test.ts`

**Interfaces:**
- Consumes: `jsonFile` (Task 1), `CheckinError` (errors.ts).
- Produces:
  - `type QueuedCheckin = { id: string; fix: Fix; target: CheckinTarget; name: string; at: number }` — `target`은 모든 종류 허용(온라인 중 연결 실패로 카카오 후보가 들어올 수 있다).
  - `QUEUE_KEEP_MS = 7 * 24 * 3600 * 1000`
  - `readQueue(): Promise<QueuedCheckin[]>`
  - `enqueueCheckin(item: { fix: Fix; target: CheckinTarget; name: string }, now?: number): Promise<void>`
  - `type FlushResult = { results: CheckinResult[]; dropped: number }`
  - `flushQueue(submit: (fix: Fix, target: CheckinTarget) => Promise<CheckinResult>, now?: number): Promise<FlushResult>`

- [ ] **Step 1: 실패하는 테스트**

```ts
// mobile/src/features/checkin/__tests__/queue.test.ts
import { CheckinError } from '../errors';
import { enqueueCheckin, flushQueue, QUEUE_KEEP_MS, readQueue } from '../queue';

const disk: Record<string, string> = {};
jest.mock('expo-file-system', () => ({
  Paths: { document: 'doc' },
  File: class {
    uri: string;
    constructor(dir: string, name: string) {
      this.uri = `${dir}/${name}`;
    }
    get exists() {
      return this.uri in disk;
    }
    create() {
      disk[this.uri] = '';
    }
    async text() {
      await new Promise((r) => setTimeout(r, 0));
      return disk[this.uri];
    }
    write(s: string) {
      disk[this.uri] = s;
    }
  },
}));

const fix = { lat: 37.5, lng: 127, accuracy: 20 };
const now = Date.UTC(2026, 8, 29, 5);
const result = (id: string) => ({ aidutId: id, name: id, footprintCount: 2, grade: 'box', gradeChanged: true, newCellsCleared: 0 });
const add = (name: string, at = now) => enqueueCheckin({ fix, target: { kind: 'mine', aidutId: name }, name }, at);

beforeEach(() => {
  for (const k in disk) delete disk[k];
});

test('챙긴 순서대로 쌓인다', async () => {
  await add('a');
  await add('b');
  const q = await readQueue();
  expect(q.map((i) => i.name)).toEqual(['a', 'b']);
  expect(q[0]).toMatchObject({ fix, target: { kind: 'mine', aidutId: 'a' }, at: now });
  expect(q[0].id).not.toBe(q[1].id);
});

test('성공은 축하로, 거절은 빼고 세고, 쿨다운은 조용히 뺀다', async () => {
  await add('ok');
  await add('far');
  await add('cool');
  const submit = jest.fn(async (_f: unknown, t: { aidutId?: string }) => {
    if (t.aidutId === 'far') throw new CheckinError('too_far');
    if (t.aidutId === 'cool') throw new CheckinError('cooldown');
    return result(t.aidutId!);
  });
  expect(await flushQueue(submit as never, now)).toEqual({ results: [result('ok')], dropped: 1 });
  expect(await readQueue()).toEqual([]);
});

test('네트워크·서버 오류면 멈추고 남긴다', async () => {
  await add('a');
  await add('b');
  const submit = jest.fn().mockRejectedValueOnce(new CheckinError('offline'));
  expect(await flushQueue(submit, now)).toEqual({ results: [], dropped: 0 });
  expect(submit).toHaveBeenCalledTimes(1);
  expect((await readQueue()).map((i) => i.name)).toEqual(['a', 'b']);
});

test('7일 넘은 건 보내지 않고 버린다', async () => {
  await add('old', now - QUEUE_KEEP_MS - 1);
  const submit = jest.fn();
  expect(await flushQueue(submit, now)).toEqual({ results: [], dropped: 0 });
  expect(submit).not.toHaveBeenCalled();
  expect(await readQueue()).toEqual([]);
});

test('올리는 도중 새로 챙긴 발자국도 남는다', async () => {
  await add('a');
  let release: () => void = () => {};
  const submit = jest.fn(
    () =>
      new Promise((r) => {
        release = () => r(result('a'));
      }),
  );
  const flushing = flushQueue(submit as never, now);
  await new Promise((r) => setTimeout(r, 5)); // submit is now waiting
  await add('b');
  release();
  await flushing;
  expect((await readQueue()).map((i) => i.name)).toEqual(['b']);
});
```

- [ ] **Step 2: 실패 확인** — `npx jest src/features/checkin/__tests__/queue.test.ts`. Expected: FAIL, 모듈 없음.

- [ ] **Step 3: 구현**

```ts
// mobile/src/features/checkin/queue.ts
// 끊긴 동안 챙긴 발자국. 연결되면 오래된 순으로 서버에 올린다(서버가 거리·정확도를 그때 검사).
import { jsonFile } from '@/lib/jsonFile';
import type { CheckinResult, CheckinTarget, Fix } from './checkinApi';
import { CheckinError, type CheckinErrorCode } from './errors';

export type QueuedCheckin = { id: string; fix: Fix; target: CheckinTarget; name: string; at: number };
export type FlushResult = { results: CheckinResult[]; dropped: number };

export const QUEUE_KEEP_MS = 7 * 24 * 3600 * 1000;
const REJECTED: CheckinErrorCode[] = ['too_far', 'weak_gps', 'not_yours'];

const file = jsonFile<{ items: QueuedCheckin[] }>('checkin-queue.json', (raw) => {
  const items = raw && typeof raw === 'object' ? (raw as { items?: unknown }).items : undefined;
  return { items: Array.isArray(items) ? items : [] };
});

export async function readQueue(): Promise<QueuedCheckin[]> {
  return (await file.read()).items;
}

export async function enqueueCheckin(item: Omit<QueuedCheckin, 'id' | 'at'>, now = Date.now()): Promise<void> {
  const id = `${now}-${Math.random().toString(36).slice(2, 10)}`;
  await file.update(async (q) => ({ items: [...q.items, { ...item, id, at: now }] }));
}

// 항목 하나씩 빼야 올리는 사이 새로 챙긴 것을 덮어쓰지 않는다.
const remove = (id: string) => file.update(async (q) => ({ items: q.items.filter((i) => i.id !== id) }));

export async function flushQueue(
  submit: (fix: Fix, target: CheckinTarget) => Promise<CheckinResult>,
  now = Date.now(),
): Promise<FlushResult> {
  const out: FlushResult = { results: [], dropped: 0 };
  for (const item of await readQueue()) {
    if (now - item.at > QUEUE_KEEP_MS) {
      await remove(item.id);
      continue;
    }
    try {
      out.results.push(await submit(item.fix, item.target));
      await remove(item.id);
    } catch (e) {
      const code = e instanceof CheckinError ? e.code : null;
      if (code === 'cooldown') {
        await remove(item.id); // 이미 다녀간 곳(응답이 끊겨 다시 보낸 경우 포함)
      } else if (code && REJECTED.includes(code)) {
        await remove(item.id);
        out.dropped++;
      } else {
        break; // 네트워크·서버 오류: 다음에 다시
      }
    }
  }
  return out;
}
```

- [ ] **Step 4: 통과 확인** — 같은 명령. Expected: 5 PASS. `npx tsc --noEmit` 오류 없음.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/features/checkin/queue.ts mobile/src/features/checkin/__tests__/queue.test.ts
git commit -m "feat(checkin): offline check-in queue with ordered flush"
```

---

### Task 7: `useCheckin` 오프라인 분기 + 시트 한 줄 + 온보딩 첫 발자국

**Files:**
- Modify: `mobile/src/features/checkin/useCheckin.ts`, `CheckinSheet.tsx`, `mobile/src/features/onboarding/FirstFootprintStep.tsx`
- Modify(tests): `mobile/src/features/checkin/__tests__/useCheckin.test.ts`, `CheckinSheet.test.tsx`, `mobile/src/features/onboarding/__tests__/FirstFootprintStep.test.tsx`, `mobile/src/app/(tabs)/__tests__/map.test.tsx`

**Interfaces:**
- Consumes: `suggestOrOffline` (Task 5), `enqueueCheckin` (Task 6), `CheckinError('offline')` (Task 3).
- Produces:
  - `Choosing`에 `offline: boolean` (필수).
  - `CheckinState`에 `| { name: 'queued' }`.
  - `choose`: `offline`이면 대기열에 넣고 `queued`. 온라인 제출이 `offline` 오류면 대기열에 넣고 `queued`. 대기열 쓰기가 실패하면 시트에 `messageFor` 오류.
  - 대기열 항목 `name`: `mine` → 후보 이름(없으면 `"내 아지트"`), `kakao` → 그 이름, `new` → `"새 아지트"`.

- [ ] **Step 1: 실패하는 테스트** — `useCheckin.test.ts`:
  - import 줄 `import * as api from '../checkinApi';` 아래에 `import { suggestOrOffline } from '../offline';` 와 `import { enqueueCheckin } from '../queue';`
  - mock 줄을 `jest.mock('../checkinApi', () => ({ getFreshFix: jest.fn(), submitCheckin: jest.fn() }));`로 바꾸고 아래 두 줄 추가:
    `jest.mock('../offline', () => ({ suggestOrOffline: jest.fn() }));`
    `jest.mock('../queue', () => ({ enqueueCheckin: jest.fn() }));`
  - `const ok = { status: 'ok' as const, hereAddress: '서울 1', candidates: [cand] };` → `..., candidates: [cand], offline: false };`
  - `const suggest = api.suggestPlace as jest.Mock;` → `const suggest = suggestOrOffline as jest.Mock;`
  - 첫 테스트의 choosing `toEqual` 객체에 `offline: false` 추가.
  - `beforeEach`에 `(enqueueCheckin as jest.Mock).mockResolvedValue(undefined);`
  - 테스트 추가:

```ts
const mine = { kind: 'mine' as const, aidutId: 'a1', name: '단골 카페', grade: 'box' as const, distanceM: 20 };

test('오프라인 후보에서 고르면 대기열에 챙기고 queued(서버엔 안 보냄)', async () => {
  suggest.mockResolvedValue({ status: 'ok', hereAddress: null, candidates: [mine], offline: true });
  const { result: h } = await renderHook(() => useCheckin());
  await act(async () => h.current.start());
  expect(h.current.state).toMatchObject({ name: 'choosing', offline: true });
  await act(async () => h.current.choose({ kind: 'mine', aidutId: 'a1' }));
  expect(enqueueCheckin).toHaveBeenCalledWith({ fix, target: { kind: 'mine', aidutId: 'a1' }, name: '단골 카페' });
  expect(submit).not.toHaveBeenCalled();
  expect(h.current.state).toEqual({ name: 'queued' });
});

test('오프라인 새로 만들기는 "새 아지트"로 챙긴다', async () => {
  suggest.mockResolvedValue({ status: 'ok', hereAddress: null, candidates: [], offline: true });
  const { result: h } = await renderHook(() => useCheckin());
  await act(async () => h.current.start());
  await act(async () => h.current.choose({ kind: 'new', roadAddress: null }));
  expect(enqueueCheckin).toHaveBeenCalledWith({ fix, target: { kind: 'new', roadAddress: null }, name: '새 아지트' });
});

test('온라인 제출이 연결 실패면 고른 발자국을 챙긴다', async () => {
  submit.mockRejectedValue(new CheckinError('offline'));
  const { result: h } = await renderHook(() => useCheckin());
  await act(async () => h.current.start());
  await act(async () => h.current.choose({ kind: 'kakao', placeId: 'p1', name: '카페', lat: 37.5, lng: 126.9, roadAddress: null }));
  expect(enqueueCheckin).toHaveBeenCalledWith({
    fix,
    target: { kind: 'kakao', placeId: 'p1', name: '카페', lat: 37.5, lng: 126.9, roadAddress: null },
    name: '카페',
  });
  expect(h.current.state).toEqual({ name: 'queued' });
});

test('챙기기(파일 쓰기)가 실패하면 시트에 안내', async () => {
  suggest.mockResolvedValue({ status: 'ok', hereAddress: null, candidates: [mine], offline: true });
  (enqueueCheckin as jest.Mock).mockRejectedValue(new Error('disk'));
  const { result: h } = await renderHook(() => useCheckin());
  await act(async () => h.current.start());
  await act(async () => h.current.choose({ kind: 'mine', aidutId: 'a1' }));
  expect(h.current.state).toMatchObject({ name: 'choosing', busy: false, error: '앗, 잠깐 문제가 생겼어요. 다시 해볼까요?' });
});
```

  `CheckinSheet.test.tsx`: 기본 상태 객체(`name: 'choosing', ...`)에 `offline: false` 추가, 테스트 추가(파일의 기존 상태 상수 이름·render 방식에 맞춘다 — 상수가 `state`라면):

```tsx
test('오프라인이면 내 아지트만 보여준다고 알린다', async () => {
  await render(<CheckinSheet state={{ ...state, offline: true }} footprintsById={{}} onChoose={jest.fn()} onClose={jest.fn()} />);
  expect(screen.getByText('연결이 끊겨 있어서 내 아지트만 보여드려요')).toBeTruthy();
});
```

  `FirstFootprintStep.test.tsx`: choosing 리터럴에 `offline: false` 추가, 테스트 추가(파일의 `api(...)` 헬퍼와 `onDone` 사용 방식에 맞춘다):

```tsx
test('오프라인에서 챙긴 첫 발자국 → 안내 후 다음으로(막히지 않음)', async () => {
  const onDone = jest.fn();
  const h = api({ name: 'queued' });
  await render(<FirstFootprintStep onDone={onDone} />);
  expect(screen.getByText('발자국을 챙겨뒀어요. 연결되면 남길게요 🐾')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: '다음' }));
  expect(h.close).toHaveBeenCalled();
  expect(onDone).toHaveBeenCalledWith(false);
});
```

  `map.test.tsx`: choosing 리터럴에 `offline: false` 추가(동작 변화 없음).

- [ ] **Step 2: 실패 확인** — `npx jest src/features/checkin src/features/onboarding/__tests__/FirstFootprintStep.test.tsx`. Expected: 새 테스트 FAIL.

- [ ] **Step 3: 구현** — `useCheckin.ts`:
  - import에서 `suggestPlace` 제거, 추가: `import { suggestOrOffline } from './offline';`, `import { enqueueCheckin } from './queue';`, `import { CheckinError } from './errors';`(이미 있으면 그대로), `import type { Candidate } from './checkinApi';`(import 묶음에 `type Candidate` 추가).
  - `Choosing`에 `offline: boolean;` 추가(`candidates` 다음 줄).
  - `CheckinState`에 `| { name: 'queued' }` 추가.
  - `start`의 `const s = await suggestPlace(fix);` → `const s = await suggestOrOffline(fix);`, `sheet.current = { fix, hereAddress: s.hereAddress, candidates: s.candidates };` → `sheet.current = { fix, hereAddress: s.hereAddress, candidates: s.candidates, offline: s.offline };`
  - 모듈 함수 추가(`useCheckin` 위):

```ts
// 대기열에서 보여줄 이름.
function nameFor(target: CheckinTarget, candidates: Candidate[]): string {
  if (target.kind === 'mine') {
    const c = candidates.find((x) => x.kind === 'mine' && x.aidutId === target.aidutId);
    return c?.name ?? '내 아지트';
  }
  return target.kind === 'kakao' ? target.name : '새 아지트';
}
```

  - `choose`를 다음으로 교체:

```ts
  const choose = useCallback(async (target: CheckinTarget) => {
    const c = sheet.current;
    if (inFlight.current || !c) return;
    inFlight.current = true;
    setState({ name: 'choosing', ...c, busy: true, error: null });
    let fix = c.fix;
    // 끊겨 있으면 챙겨 두고, 연결되면 지도 화면이 올린다.
    const keep = async () => {
      await enqueueCheckin({ fix, target, name: nameFor(target, c.candidates) });
      sheet.current = null;
      setState({ name: 'queued' });
    };
    try {
      if (c.offline) {
        await keep();
        return;
      }
      if (fixIsStale.current) {
        const fresh = await within(getFreshFix(), LOCATE_TIMEOUT_MS);
        if (fresh === 'denied') {
          setState({ name: 'choosing', ...c, busy: false, error: MSG.denied });
          return;
        }
        fix = fresh;
        sheet.current = { ...c, fix };
        fixIsStale.current = false;
      }
      try {
        const result = await submitCheckin(fix, target);
        // 이미 남겼으니 곧 울릴 "발자국 남길까요?" 알림은 거둔다.
        cancelArrivalAlert(result.aidutId).catch((e) => console.warn('도착 알림 취소 실패', e));
        sheet.current = null;
        setState({ name: 'celebrating', result });
      } catch (e) {
        if (!(e instanceof CheckinError && e.code === 'offline')) throw e;
        await keep(); // 보내다 끊겼다: 고른 발자국을 잃지 않게
      }
    } catch (e) {
      fixIsStale.current = true;
      setState({ name: 'choosing', ...(sheet.current ?? c), busy: false, error: messageFor(e) });
    } finally {
      inFlight.current = false;
    }
  }, []);
```

  `CheckinSheet.tsx`: `<SafeAreaView edges={['bottom']} style={styles.sheet}>` 바로 다음 줄에

```tsx
        {state.offline && <Text style={styles.caption}>연결이 끊겨 있어서 내 아지트만 보여드려요</Text>}
```

  `FirstFootprintStep.tsx`: `{state.name === 'failed' && <Text style={styles.body}>{state.message}</Text>}` 다음 줄에(파일에 `PrimaryButton`이 import돼 있지 않으면 `./ui`에서 import):

```tsx
      {state.name === 'queued' && (
        <>
          <Text style={styles.body}>발자국을 챙겨뒀어요. 연결되면 남길게요 🐾</Text>
          <PrimaryButton
            label="다음"
            onPress={() => {
              checkin.close();
              onDone(false); // 아지트는 연결된 뒤 지도에서 생긴다
            }}
          />
        </>
      )}
```

- [ ] **Step 4: 통과 확인** — `npx tsc --noEmit && npx jest`. Expected: 오류 없음, 전부 PASS.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/features/checkin mobile/src/features/onboarding "mobile/src/app/(tabs)/__tests__/map.test.tsx"
git commit -m "feat(checkin): keep footprints offline and queue on dropped connection"
```

---

### Task 8: 올리기 — `useCheckinQueue`

**Files:**
- Create: `mobile/src/features/checkin/useCheckinQueue.ts`
- Test: `mobile/src/features/checkin/__tests__/useCheckinQueue.test.ts`

**Interfaces:**
- Consumes: `flushQueue`, `readQueue` (Task 6), `submitCheckin`, `onOnline` (Task 2).
- Produces: `useCheckinQueue(onSynced: () => void): { pending: number; celebrations: CheckinResult[]; dropped: number; next(): void; clearDropped(): void; refresh(): Promise<void> }`
  - 올리는 시점: 지도 포커스(`useFocusEffect`), `AppState` → `active`, `onOnline`.
  - 한 번에 하나(`flushing` ref). 성공이 있으면 `celebrations` 끝에 추가하고 `onSynced()` 한 번.
  - 끝나면 `pending`을 대기열 길이로.

- [ ] **Step 1: 실패하는 테스트**

```ts
// mobile/src/features/checkin/__tests__/useCheckinQueue.test.ts
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { AppState } from 'react-native';
import { onOnline } from '@/lib/network';
import { submitCheckin } from '../checkinApi';
import { flushQueue, readQueue } from '../queue';
import { useCheckinQueue } from '../useCheckinQueue';

jest.mock('expo-router', () => ({ useFocusEffect: (cb: () => void) => require('react').useEffect(cb, [cb]) }));
jest.mock('@/lib/network', () => ({ onOnline: jest.fn() }));
jest.mock('../checkinApi', () => ({ submitCheckin: jest.fn() }));
jest.mock('../queue', () => ({ flushQueue: jest.fn(), readQueue: jest.fn() }));

const flush = flushQueue as jest.Mock;
const result = (id: string) => ({ aidutId: id, name: id, footprintCount: 2, grade: 'box', gradeChanged: true, newCellsCleared: 0 });
let online: () => void = () => {};
let appState: (s: string) => void = () => {};

beforeEach(() => {
  jest.clearAllMocks();
  (readQueue as jest.Mock).mockResolvedValue([]);
  flush.mockResolvedValue({ results: [], dropped: 0 });
  (onOnline as jest.Mock).mockImplementation((cb: () => void) => {
    online = cb;
    return jest.fn();
  });
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_t, cb) => {
    appState = cb as (s: string) => void;
    return { remove: jest.fn() } as never;
  });
});

test('보이면 올리고, 결과는 축하 목록으로, 한 번 새로고침', async () => {
  flush.mockResolvedValueOnce({ results: [result('a'), result('b')], dropped: 1 });
  (readQueue as jest.Mock).mockResolvedValue([{ id: 'x' }]);
  const onSynced = jest.fn();
  const { result: h } = await renderHook(() => useCheckinQueue(onSynced));
  await waitFor(() => expect(h.current.celebrations).toHaveLength(2));
  expect(flush).toHaveBeenCalledWith(submitCheckin);
  expect(onSynced).toHaveBeenCalledTimes(1);
  expect(h.current.dropped).toBe(1);
  await waitFor(() => expect(h.current.pending).toBe(1));
  await act(async () => h.current.next());
  expect(h.current.celebrations.map((r) => r.aidutId)).toEqual(['b']);
  await act(async () => h.current.clearDropped());
  expect(h.current.dropped).toBe(0);
});

test('다시 연결되거나 앱이 앞으로 나오면 올린다', async () => {
  await renderHook(() => useCheckinQueue(jest.fn()));
  await waitFor(() => expect(flush).toHaveBeenCalledTimes(1));
  await act(async () => online());
  await waitFor(() => expect(flush).toHaveBeenCalledTimes(2));
  await act(async () => appState('background'));
  await act(async () => appState('active'));
  await waitFor(() => expect(flush).toHaveBeenCalledTimes(3));
});

test('올리는 중에 또 불려도 겹치지 않는다', async () => {
  let release: () => void = () => {};
  flush.mockImplementationOnce(() => new Promise((r) => (release = () => r({ results: [], dropped: 0 }))));
  await renderHook(() => useCheckinQueue(jest.fn()));
  await act(async () => online());
  await act(async () => appState('active'));
  expect(flush).toHaveBeenCalledTimes(1);
  await act(async () => release());
});

test('올리기 실패는 조용히(다음에 다시)', async () => {
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  flush.mockRejectedValueOnce(new Error('disk'));
  const onSynced = jest.fn();
  const { result: h } = await renderHook(() => useCheckinQueue(onSynced));
  await waitFor(() => expect(console.warn).toHaveBeenCalled());
  expect(onSynced).not.toHaveBeenCalled();
  expect(h.current.celebrations).toEqual([]);
});
```

- [ ] **Step 2: 실패 확인** — `npx jest src/features/checkin/__tests__/useCheckinQueue.test.ts`. Expected: FAIL, 모듈 없음.

- [ ] **Step 3: 구현**

```ts
// mobile/src/features/checkin/useCheckinQueue.ts
// 챙겨둔 발자국을 올리는 곳. 지도가 보일 때·앱이 앞으로 나올 때·다시 연결될 때.
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { onOnline } from '@/lib/network';
import { type CheckinResult, submitCheckin } from './checkinApi';
import { flushQueue, readQueue } from './queue';

export function useCheckinQueue(onSynced: () => void) {
  const [pending, setPending] = useState(0);
  const [celebrations, setCelebrations] = useState<CheckinResult[]>([]);
  const [dropped, setDropped] = useState(0);
  const flushing = useRef(false); // 동기 가드: 포커스와 재연결이 같은 순간에 올 수 있다
  const synced = useRef(onSynced);
  useEffect(() => {
    synced.current = onSynced;
  });

  const refresh = useCallback(async () => {
    try {
      setPending((await readQueue()).length);
    } catch (e) {
      console.warn('챙겨둔 발자국 세기 실패', e);
    }
  }, []);

  const flush = useCallback(async () => {
    if (flushing.current) return;
    flushing.current = true;
    try {
      const { results, dropped: d } = await flushQueue(submitCheckin);
      if (results.length) {
        setCelebrations((c) => [...c, ...results]);
        synced.current();
      }
      if (d) setDropped((x) => x + d);
    } catch (e) {
      console.warn('챙겨둔 발자국 올리기 실패', e);
    } finally {
      flushing.current = false;
      await refresh();
    }
  }, [refresh]);

  useFocusEffect(
    useCallback(() => {
      flush();
    }, [flush]),
  );

  useEffect(() => {
    const off = onOnline(() => {
      flush();
    });
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') flush();
    });
    return () => {
      off();
      sub.remove();
    };
  }, [flush]);

  const next = useCallback(() => setCelebrations((c) => c.slice(1)), []);
  const clearDropped = useCallback(() => setDropped(0), []);

  return { pending, celebrations, dropped, next, clearDropped, refresh };
}
```

- [ ] **Step 4: 통과 확인** — 같은 명령. Expected: 4 PASS. `npx tsc --noEmit` 오류 없음.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/features/checkin/useCheckinQueue.ts mobile/src/features/checkin/__tests__/useCheckinQueue.test.ts
git commit -m "feat(checkin): flush queued footprints on focus, foreground, reconnect"
```

---

### Task 9: 지도 화면 연결

**Files:**
- Modify: `mobile/src/app/(tabs)/index.tsx`
- Test: `mobile/src/app/(tabs)/__tests__/map.test.tsx`

**Interfaces:**
- Consumes: `useCheckinQueue` (Task 8), `useMyHideouts().status === 'offline'` (Task 4), `checkin.state.name === 'queued'` (Task 7).

- [ ] **Step 1: 실패하는 테스트** — `map.test.tsx`:
  - import 추가 `import { useCheckinQueue } from '@/features/checkin/useCheckinQueue';`, mock 추가 `jest.mock('@/features/checkin/useCheckinQueue', () => ({ useCheckinQueue: jest.fn() }));`
  - 파일 상단 헬퍼 근처:

```tsx
const queueState = (over = {}) => ({ pending: 0, celebrations: [], dropped: 0, next: jest.fn(), clearDropped: jest.fn(), refresh: jest.fn(), ...over });
```

  - `beforeEach`에 `(useCheckinQueue as jest.Mock).mockReturnValue(queueState());`
  - 테스트 추가(파일에 이미 있는 `checkin(...)` 헬퍼를 쓴다):

```tsx
const synced = { aidutId: 'a1', name: '테스트 카페', footprintCount: 2, grade: 'box', gradeChanged: true, newCellsCleared: 0 };

test('오프라인이면 저장본 배지·챙긴 개수, 동 배지는 숨긴다', async () => {
  (useMyHideouts as jest.Mock).mockReturnValue(hideoutsState({ status: 'offline' }));
  (useCheckinQueue as jest.Mock).mockReturnValue(queueState({ pending: 2 }));
  (useDongAt as jest.Mock).mockReturnValue({
    dong: { code: '1', name: '사직동', stage: 'sprout', hideoutCount: 1, exploredCells: 1, totalCells: 10, ratio: 0.1 },
    onIdle: jest.fn(),
    refresh: jest.fn(),
  });
  await render(<MapScreen />);
  expect(screen.getByText('연결이 끊겨 있어요. 마지막으로 본 지도예요.')).toBeTruthy();
  expect(screen.getByText('챙겨둔 발자국 2개')).toBeTruthy();
  expect(screen.queryByText(/사직동/)).toBeNull();
});

test('챙기면 안내 + 닫기, 대기 개수 새로 셈', async () => {
  const api = checkin({ name: 'queued' });
  const q = queueState();
  (useCheckinQueue as jest.Mock).mockReturnValue(q);
  await render(<MapScreen />);
  expect(screen.getByText('발자국을 챙겨뒀어요. 연결되면 남길게요 🐾')).toBeTruthy();
  expect(q.refresh).toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: '닫기' }));
  expect(api.close).toHaveBeenCalled();
});

test('올라간 발자국은 차례로 축하, 닫으면 다음 것', async () => {
  const q = queueState({ celebrations: [synced] });
  (useCheckinQueue as jest.Mock).mockReturnValue(q);
  await render(<MapScreen />);
  expect(mockCelebrationProps.result).toEqual(synced);
  await act(async () => mockCelebrationProps.onClose());
  expect(q.next).toHaveBeenCalled();
});

test('직접 체크인 중이면 올라간 축하는 미룬다', async () => {
  (useCheckinQueue as jest.Mock).mockReturnValue(queueState({ celebrations: [synced] }));
  checkin({ name: 'locating' });
  await render(<MapScreen />);
  expect(screen.queryByTestId('celebration')).toBeNull();
});

test('거절된 발자국 안내 + 닫기', async () => {
  const q = queueState({ dropped: 2 });
  (useCheckinQueue as jest.Mock).mockReturnValue(q);
  await render(<MapScreen />);
  expect(screen.getByText('챙겨둔 발자국 2개는 남기지 못했어요. 너무 멀었거나 위치가 흐렸어요.')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: '닫기' }));
  expect(q.clearDropped).toHaveBeenCalled();
});
```

- [ ] **Step 2: 실패 확인** — `npx jest "src/app/\(tabs\)/__tests__/map.test.tsx"`. Expected: 새 테스트 5개 FAIL.

- [ ] **Step 3: 구현** — `index.tsx`:
  - import 추가: `import { useCheckinQueue } from '@/features/checkin/useCheckinQueue';`
  - `const dongAt = useDongAt();` 다음에:

```tsx
  const offline = status === 'offline';
  const { refresh: refreshFog } = fog;
  const { refresh: refreshDong } = dongAt;
  // 챙겨둔 발자국이 올라가면 지도를 새로 불러온다(마커·안개·동).
  const queue = useCheckinQueue(
    useCallback(() => {
      retry();
      refreshFog();
      refreshDong();
    }, [retry, refreshFog, refreshDong]),
  );
  const { refresh: refreshQueue } = queue;
  useEffect(() => {
    if (checkin.state.name === 'queued') refreshQueue();
  }, [checkin.state.name, refreshQueue]);
```

  - `const celebrated = checkin.state.name === 'celebrating' ? checkin.state.result : null;` 다음 줄에:

```tsx
  // 직접 남긴 발자국이 먼저. 올라간 발자국 축하는 체크인이 쉬고 있을 때 차례로.
  const synced = !celebrated && checkin.state.name === 'idle' ? (queue.celebrations[0] ?? null) : null;
  const shown = celebrated ?? synced;
```

  - `<DongBadge dong={dongAt.dong} />` → `<DongBadge dong={offline ? null : dongAt.dong} />`
  - `{status === 'error' && (` 배너 블록 앞에:

```tsx
        {offline && (
          <View style={styles.banner}>
            <Text style={styles.bannerText}>연결이 끊겨 있어요. 마지막으로 본 지도예요.</Text>
          </View>
        )}
        {queue.pending > 0 && (
          <View style={styles.banner}>
            <Text style={styles.bannerText}>챙겨둔 발자국 {queue.pending}개</Text>
          </View>
        )}
```

  - `{(locating || checkin.state.name === 'failed') && (` 블록 앞에:

```tsx
      {checkin.state.name === 'queued' && (
        <View style={styles.checkinNote}>
          <Text style={styles.bannerText}>발자국을 챙겨뒀어요. 연결되면 남길게요 🐾</Text>
          <View style={styles.row}>
            <Pill label="닫기" onPress={checkin.close} />
          </View>
        </View>
      )}
      {queue.dropped > 0 && checkin.state.name === 'idle' && (
        <View style={styles.checkinNote}>
          <Text style={styles.bannerText}>챙겨둔 발자국 {queue.dropped}개는 남기지 못했어요. 너무 멀었거나 위치가 흐렸어요.</Text>
          <View style={styles.row}>
            <Pill label="닫기" onPress={queue.clearDropped} />
          </View>
        </View>
      )}
```

  - 축하 블록 `{celebrated && ( <Celebration result={celebrated} ... onClose={() => { ... }} /> )}` 를 다음으로:

```tsx
      {shown && (
        <Celebration
          result={shown}
          thresholds={thresholds}
          onClose={() => {
            if (celebrated) {
              checkin.close();
              retry(); // the marker should show the grown hideout
              fog.refresh(); // the new footprint's cell clears
              dongAt.refresh(); // ratio and stage move with it
            } else {
              queue.next(); // 새로고침은 올라갈 때 이미 했다
            }
            shouldOfferArrival(shown.footprintCount)
              .then(setArrivalOffer)
              .catch((e) => console.warn('도착 알림 카드 확인 실패', e));
          }}
        />
      )}
```

- [ ] **Step 4: 통과 확인** — `npx tsc --noEmit && npx expo lint && npx jest`. Expected: 오류 없음(린트 경고는 기존 14개 그대로), 전부 PASS.

- [ ] **Step 5: Commit**

```bash
git add "mobile/src/app/(tabs)/index.tsx" "mobile/src/app/(tabs)/__tests__/map.test.tsx"
git commit -m "feat(map): offline badge, queued note, synced celebrations, dropped notice"
```

---

### Task 10: 진행 상황 문서

**Files:**
- Modify: `docs/진행상황.md`

- [ ] **Step 1: 갱신**
  - "끝난 것" 표 `⑥-1` 행 다음에: `| ⑥-2 오프라인 큐 | 끊겨도 발자국을 챙겨 뒀다가 연결되면 올리고 축하, 끊긴 동안 마지막 지도+배지 | \`…/specs/2026-09-29-offline-queue-design.md\` |`
  - 테스트 줄 숫자를 실제 `npx jest` 결과로(pgTAP은 그대로 91).
  - dev build 줄의 지오펜스 항목 뒤에 `·**연결 감지(⑥-2 expo-network)**` 추가.
  - "확인할 것" 끝에: `8. 오프라인: 비행기 모드로 발자국 → "챙겨뒀어요" → 비행기 모드 끄기 → 축하, 비행기 모드로 앱 켜기 → 마지막 지도+배지, 멀리서 챙긴 발자국 → 연결 후 "남기지 못했어요", 온보딩 첫 발자국을 오프라인에서 → 다음으로 넘어감`
  - "다음 개발 단계": `- ⑥ 나머지 — 순간 남기기 📷(사진 대기열 포함), 프로필 설정(알림 켜기 스위치 포함), 위시리스트·코스`

- [ ] **Step 2: Commit**

```bash
git add docs/진행상황.md
git commit -m "docs: progress after offline queue"
```
