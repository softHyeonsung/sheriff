// supabase/functions/delete-account/index.test.ts
import { assertEquals } from 'jsr:@std/assert';
import { type Deps, handle } from './index.ts';

const req = () => new Request('http://x', { method: 'POST', headers: { Authorization: 'Bearer t' } });

function fakeDeps(over: Partial<Deps> = {}, pages: string[][] = []): { deps: Deps; calls: string[] } {
  const calls: string[] = [];
  const queue = [...pages];
  const deps: Deps = {
    userId: () => Promise.resolve('u1'),
    listPhotos: (uid) => (calls.push(`list:${uid}`), Promise.resolve(queue.shift() ?? [])),
    removePhotos: (paths) => (calls.push(`remove:${paths.join(',')}`), Promise.resolve()),
    deleteUser: (uid) => (calls.push(`delete:${uid}`), Promise.resolve()),
    ...over,
  };
  return { deps, calls };
}

Deno.test('로그인 안 했으면 401이고 아무것도 안 지운다', async () => {
  const { deps, calls } = fakeDeps({ userId: () => Promise.resolve(null) });
  const res = await handle(req(), deps);
  assertEquals(res.status, 401);
  assertEquals(calls, []);
});

Deno.test('사진 폴더를 빌 때까지 비우고 나서 계정을 지운다', async () => {
  const { deps, calls } = fakeDeps({}, [['a.jpg', 'b.jpg'], ['c.jpg'], []]);
  const res = await handle(req(), deps);
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { ok: true });
  assertEquals(calls, ['list:u1', 'remove:u1/a.jpg,u1/b.jpg', 'list:u1', 'remove:u1/c.jpg', 'list:u1', 'delete:u1']);
});

Deno.test('중간에 실패하면 500(계정은 안 지움)', async () => {
  const { deps, calls } = fakeDeps({ removePhotos: () => Promise.reject(new Error('storage down')) }, [['a.jpg']]);
  const res = await handle(req(), deps);
  assertEquals(res.status, 500);
  assertEquals(calls.includes('delete:u1'), false);
});
