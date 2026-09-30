// mobile/src/features/memories/__tests__/memoryQueue.test.ts
import { flushMemories, keepMemory, MEMORY_KEEP_MS, memoryPath, readMemoryQueue, type MemoryDeps } from '../memoryQueue';

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
const now = Date.UTC(2026, 8, 30, 5);
const add = (id: string, at = now) => keepMemory({ id, aidutId: `a-${id}`, fix, localUri: `file:///doc/memories/${id}.jpg` }, at);
const deps = (over: Partial<MemoryDeps> = {}): MemoryDeps => ({
  uid: 'u1',
  upload: jest.fn().mockResolvedValue(undefined),
  attach: jest.fn().mockResolvedValue(undefined),
  removeRemote: jest.fn().mockResolvedValue(undefined),
  removeLocal: jest.fn(),
  ...over,
});

beforeEach(() => {
  for (const k in disk) delete disk[k];
});

test('경로는 {uid}/{id}.jpg', () => {
  expect(memoryPath('u1', 'p1')).toBe('u1/p1.jpg');
});

test('올리고 기록하면 로컬 파일을 지우고 뺀다', async () => {
  await add('p1');
  const d = deps();
  expect(await flushMemories(d, now)).toEqual({ attached: ['a-p1'], dropped: 0 });
  expect(d.upload).toHaveBeenCalledWith('u1/p1.jpg', 'file:///doc/memories/p1.jpg');
  expect(d.attach).toHaveBeenCalledWith('a-p1', 'u1/p1.jpg', fix);
  expect(d.removeLocal).toHaveBeenCalledWith('file:///doc/memories/p1.jpg');
  expect(await readMemoryQueue()).toEqual([]);
});

test('서버가 거절하면 저장소·로컬 파일을 지우고 빼고 센다', async () => {
  await add('p1');
  const d = deps({ attach: jest.fn().mockRejectedValue({ code: 'too_far' }) });
  expect(await flushMemories(d, now)).toEqual({ attached: [], dropped: 1 });
  expect(d.removeRemote).toHaveBeenCalledWith('u1/p1.jpg');
  expect(d.removeLocal).toHaveBeenCalledWith('file:///doc/memories/p1.jpg');
  expect(await readMemoryQueue()).toEqual([]);
});

test('네트워크·서버 오류면 멈추고 남긴다(파일도 그대로)', async () => {
  await add('p1');
  await add('p2');
  const d = deps({ upload: jest.fn().mockRejectedValue({ code: 'offline' }) });
  expect(await flushMemories(d, now)).toEqual({ attached: [], dropped: 0 });
  expect(d.upload).toHaveBeenCalledTimes(1);
  expect(d.removeLocal).not.toHaveBeenCalled();
  expect((await readMemoryQueue()).map((i) => i.id)).toEqual(['p1', 'p2']);
});

test('7일 넘은 건 올리지 않고 저장소 지우기를 시도한 뒤 버린다', async () => {
  await add('old', now - MEMORY_KEEP_MS - 1);
  const d = deps({ removeRemote: jest.fn().mockRejectedValue(new Error('offline')) });
  expect(await flushMemories(d, now)).toEqual({ attached: [], dropped: 0 });
  expect(d.upload).not.toHaveBeenCalled();
  expect(d.removeRemote).toHaveBeenCalledWith('u1/old.jpg');
  expect(d.removeLocal).toHaveBeenCalled();
  expect(await readMemoryQueue()).toEqual([]);
});

test('로컬 파일 지우기가 실패해도 대기열에서는 뺀다', async () => {
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  await add('p1');
  const d = deps({
    removeLocal: jest.fn(() => {
      throw new Error('EIO');
    }),
  });
  expect(await flushMemories(d, now)).toEqual({ attached: ['a-p1'], dropped: 0 });
  expect(await readMemoryQueue()).toEqual([]);
});
