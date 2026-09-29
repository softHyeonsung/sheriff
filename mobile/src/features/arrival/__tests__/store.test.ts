// mobile/src/features/arrival/__tests__/store.test.ts
import { readArrival, writeArrival } from '../store';

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
