// mobile/src/features/arrival/__tests__/store.test.ts
import { readArrival, updateArrival, writeArrival } from '../store';

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

beforeEach(() => {
  for (const k in disk) delete disk[k];
});

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
      log: [
        { id: 'a', at: now - 8 * day },
        { id: 'a', at: now - day },
      ],
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

test('동시에 고쳐도 둘 다 남는다(순서대로 처리)', async () => {
  const now = Date.UTC(2026, 8, 29);
  await Promise.all([
    updateArrival(async (d) => ({ ...d, log: [...d.log, { id: 'a', at: now }] }), now),
    updateArrival(async (d) => ({ ...d, offerSeen: true }), now),
  ]);
  expect(await readArrival()).toEqual({ regions: {}, log: [{ id: 'a', at: now }], offerSeen: true });
});

test('null을 돌려주면 안 쓴다, 앞 작업이 실패해도 다음은 돈다', async () => {
  await expect(updateArrival(async () => { throw new Error('boom'); })).rejects.toThrow('boom');
  await updateArrival(async () => null);
  expect(disk['doc/arrival.json']).toBeUndefined();
  await updateArrival(async (d) => ({ ...d, offerSeen: true }));
  expect((await readArrival()).offerSeen).toBe(true);
});

test('모양이 틀린 파일(log가 배열 아님)이면 빈 기록', async () => {
  disk['doc/arrival.json'] = '{"log":null,"regions":null}';
  expect(await readArrival()).toEqual(EMPTY);
});
