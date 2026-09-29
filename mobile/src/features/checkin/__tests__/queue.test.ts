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
