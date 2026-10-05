// supabase/functions/suggest-place/checkin.integration.test.ts
//
// 실제 로컬 스택(GoTrue + Postgres)에서: 세션 발급 → 후보 조회 → 발자국 → 다시 조회.
// Run: SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_ROLE_KEY=... SUPABASE_ANON_KEY=... deno test ...
import { assert, assertEquals } from 'jsr:@std/assert';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { liveDeps, suggestPlace } from './index.ts';

const url = Deno.env.get('SUPABASE_URL');
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const anonKey = Deno.env.get('SUPABASE_ANON_KEY');

// Same session-minting path as kakao-custom-token (generateLink -> verifyOtp token_hash).
async function signedInClient() {
  const admin = createClient(url!, serviceKey!);
  const email = `checkin-it-${crypto.randomUUID()}@users.sanchaeknyang.app`;
  const { data: created, error: createError } = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (createError) throw createError;
  const uid = created.user.id;
  const { error: usersError } = await admin.from('users').insert({ uid, provider: 'kakao' });
  if (usersError) throw usersError;
  const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  if (linkError) throw linkError;
  const anon = createClient(url!, anonKey!);
  const { data: s, error: verifyError } = await anon.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: 'magiclink' });
  if (verifyError || !s.session) throw verifyError ?? new Error('no session');
  const db = createClient(url!, anonKey!, { global: { headers: { Authorization: `Bearer ${s.session.access_token}` } } });
  // A failed delete (e.g. an FK blocking account deletion) must fail the test, not leave a user behind.
  const cleanup = async () => {
    const { error } = await admin.auth.admin.deleteUser(uid);
    if (error) throw error;
  };
  return { db, cleanup };
}

const fakeKakao = { kakaoNearby: () => Promise.resolve([]), kakaoAddress: () => Promise.resolve({ address: '서울 통합로 1', name: null }) };
const here = { lat: 37.51, lng: 126.95, accuracy: 15 };

Deno.test({
  name: 'suggest → submit → suggest: 새 아지트가 생기고 다음엔 첫 후보가 된다',
  ignore: !url || !serviceKey || !anonKey,
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const { db, cleanup } = await signedInClient();
    try {
      const deps = { ...liveDeps(db), ...fakeKakao };

      const first = await suggestPlace(here, deps);
      assertEquals(first, { status: 'ok', hereAddress: '서울 통합로 1', hereName: null, candidates: [] });

      const { data: stamped, error } = await db.rpc('submit_checkin', {
        p_lat: here.lat, p_lng: here.lng, p_accuracy: here.accuracy,
        p_target: { kind: 'new', roadAddress: first.status === 'ok' ? first.hereAddress : null, name: '통합 빌딩' },
      });
      if (error) throw error;
      assertEquals({ ...stamped, aidutId: undefined }, {
        aidutId: undefined, name: '서울 통합로 1', footprintCount: 1, grade: 'paw', gradeChanged: false, newCellsCleared: 1,
      });

      const second = await suggestPlace(here, deps);
      if (second.status !== 'ok') throw new Error('expected ok');
      assertEquals(second.candidates[0]?.kind, 'mine');
      assert(second.candidates[0]?.kind === 'mine' && second.candidates[0].aidutId === stamped.aidutId);
    } finally {
      await cleanup();
    }
  },
});

Deno.test({
  name: '동시 두 요청: 정확히 하나만 발자국이 되고 나머지는 cooldown',
  ignore: !url || !serviceKey || !anonKey,
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const { db, cleanup } = await signedInClient();
    try {
      const call = () => db.rpc('submit_checkin', {
        p_lat: here.lat, p_lng: here.lng, p_accuracy: here.accuracy, p_target: { kind: 'new' },
      });
      const results = await Promise.all([call(), call()]);
      assertEquals(results.filter((r) => !r.error).length, 1);
      assertEquals(results.filter((r) => r.error?.message === 'cooldown').length, 1);
      const { count } = await db.from('aidut').select('id', { count: 'exact', head: true });
      assertEquals(count, 1);
    } finally {
      await cleanup();
    }
  },
});
