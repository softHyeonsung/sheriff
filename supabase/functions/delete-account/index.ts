// supabase/functions/delete-account/index.ts
//
// 계정 탈퇴(즉시): 사진 폴더(memories/{uid}/)를 비우고 로그인 계정을 지운다.
// DB는 auth.users → public.users → 아지트·발자국·사진 기록·안개·프로필로 연쇄 삭제된다.
// POST (본문 없음, 사용자 토큰 필요) -> { ok: true }.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const BUCKET = 'memories';
const PAGE = 100;
const MAX_PAGES = 1000; // 폭주 방지: 사진 10만 장

export interface Deps {
  userId(req: Request): Promise<string | null>;
  listPhotos(uid: string): Promise<string[]>;
  removePhotos(paths: string[]): Promise<void>;
  deleteUser(uid: string): Promise<void>;
}

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

export async function handle(req: Request, deps: Deps): Promise<Response> {
  const uid = await deps.userId(req);
  if (!uid) return json({ error: 'unauthorized' }, 401);
  try {
    // 파일 먼저: 계정을 먼저 지우면 누구 폴더였는지 더는 확인할 수 없다.
    for (let i = 0; i < MAX_PAGES; i++) {
      const names = await deps.listPhotos(uid);
      if (names.length === 0) break;
      await deps.removePhotos(names.map((n) => `${uid}/${n}`));
    }
    await deps.deleteUser(uid);
    return json({ ok: true }, 200);
  } catch (e) {
    console.error('탈퇴 실패', e);
    return json({ error: String(e) }, 500);
  }
}

const admin = () => createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const liveDeps: Deps = {
  userId: async (req) => {
    const auth = req.headers.get('Authorization');
    if (!auth) return null;
    const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: auth } } });
    const { data, error } = await db.auth.getUser();
    return error || !data.user ? null : data.user.id;
  },
  listPhotos: async (uid) => {
    const { data, error } = await admin().storage.from(BUCKET).list(uid, { limit: PAGE });
    if (error) throw error;
    return (data ?? []).map((o) => o.name);
  },
  removePhotos: async (paths) => {
    const { error } = await admin().storage.from(BUCKET).remove(paths);
    if (error) throw error;
  },
  deleteUser: async (uid) => {
    const { error } = await admin().auth.admin.deleteUser(uid);
    if (error) throw error;
  },
};

if (import.meta.main) Deno.serve((req) => handle(req, liveDeps));
