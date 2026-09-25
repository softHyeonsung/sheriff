// supabase/functions/kakao-custom-token/session.integration.test.ts
//
// Runs upsertSupabaseUser against the LOCAL Supabase stack (real GoTrue + Postgres), because the
// session-minting path (generateLink -> verifyOtp) can't be proven with mocks.
// Run: SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_ROLE_KEY=... SUPABASE_ANON_KEY=... \
//   deno test --allow-net --allow-env session.integration.test.ts
import { assert, assertEquals } from 'jsr:@std/assert';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { TERMS_VERSION, upsertSupabaseUser } from './index.ts';

const url = Deno.env.get('SUPABASE_URL');
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

Deno.test({
  name: 'upsertSupabaseUser mints a real session and records consent (local stack)',
  ignore: !url || !serviceKey,
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const kakaoId = 900000000 + Math.floor(Math.random() * 99999999);
    const session = await upsertSupabaseUser(kakaoId, true);
    assert(session.access_token, 'access_token issued');
    assert(session.refresh_token, 'refresh_token issued');

    const admin = createClient(url!, serviceKey!);
    const { data: row } = await admin
      .from('users')
      .select('kakao_id, terms_agreed_at, terms_version')
      .eq('uid', session.user.id)
      .single();
    assertEquals(row?.kakao_id, kakaoId);
    assertEquals(row?.terms_version, TERMS_VERSION);
    assert(row?.terms_agreed_at);

    // Second login for the same Kakao user: same account, consent record untouched.
    const again = await upsertSupabaseUser(kakaoId, false);
    assertEquals(again.user.id, session.user.id);
    await admin.auth.admin.deleteUser(session.user.id);
  },
});
