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
