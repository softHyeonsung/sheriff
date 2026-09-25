// supabase/functions/kakao-custom-token/index.test.ts
import { assertEquals, assertRejects, assertThrows } from 'jsr:@std/assert';
import { assertKakaoOwner, handleRequest, termsDecision, verifyKakaoAccessToken } from './index.ts';

const OUR_APP_ID = 1234567;
const tokenInfo = (body: unknown, status = 200) => () =>
  Promise.resolve(new Response(JSON.stringify(body), { status })) as Promise<Response>;

Deno.test('verifyKakaoAccessToken returns the kakao user id for a token issued to our app', async () => {
  const id = await verifyKakaoAccessToken('t', OUR_APP_ID, tokenInfo({ id: 123456, app_id: OUR_APP_ID, expires_in: 100 }));
  assertEquals(id, 123456);
});

Deno.test('verifyKakaoAccessToken rejects a token issued to a different Kakao app', async () => {
  await assertRejects(() =>
    verifyKakaoAccessToken('t', OUR_APP_ID, tokenInfo({ id: 123456, app_id: 999, expires_in: 100 }))
  );
});

Deno.test('verifyKakaoAccessToken rejects when Kakao says the token is invalid', async () => {
  await assertRejects(() => verifyKakaoAccessToken('bad', OUR_APP_ID, tokenInfo({ code: -401 }, 401)));
});

Deno.test('verifyKakaoAccessToken refuses to run without a configured app id', async () => {
  await assertRejects(() => verifyKakaoAccessToken('t', NaN, tokenInfo({ id: 1, app_id: NaN, expires_in: 1 })));
});

Deno.test('assertKakaoOwner accepts an account bound to the same kakao id', () => {
  assertKakaoOwner({ app_metadata: { kakao_id: 123456 } }, 123456);
});

Deno.test('assertKakaoOwner rejects pre-registered or foreign accounts', () => {
  for (const user of [
    { app_metadata: {} }, // email/password signup squatting the synthesized email
    { app_metadata: { kakao_id: 999 } },
    { app_metadata: { kakao_id: '123456' } },
    null,
  ]) {
    assertThrows(() => assertKakaoOwner(user, 123456));
  }
});

Deno.test('termsDecision: 처음 온 사용자가 동의 없이 오면 required', () => {
  assertEquals(termsDecision(null, undefined, '2026-09-25'), 'required');
});

Deno.test('termsDecision: 처음 온 사용자가 현재 버전으로 동의하면 record', () => {
  assertEquals(termsDecision(null, '2026-09-25', '2026-09-25'), 'record');
});

Deno.test('termsDecision: 옛 버전/엉뚱한 값으로 동의하면 required', () => {
  assertEquals(termsDecision(null, '2020-01-01', '2026-09-25'), 'required');
  assertEquals(termsDecision({ terms_agreed_at: null }, '', '2026-09-25'), 'required');
});

Deno.test('termsDecision: 행은 있는데 미동의(마이그레이션 전 계정)면 동의가 필요하다', () => {
  assertEquals(termsDecision({ terms_agreed_at: null }, undefined, '2026-09-25'), 'required');
  assertEquals(termsDecision({ terms_agreed_at: null }, '2026-09-25', '2026-09-25'), 'record');
});

Deno.test('termsDecision: 이미 동의한 사용자는 무엇을 보내든 ok (기록을 덮어쓰지 않음)', () => {
  const agreed = { terms_agreed_at: '2026-09-25T00:00:00Z' };
  assertEquals(termsDecision(agreed, undefined, '2026-09-25'), 'ok');
  assertEquals(termsDecision(agreed, '2020-01-01', '2026-09-25'), 'ok');
  assertEquals(termsDecision(agreed, '2026-09-25', '2026-09-25'), 'ok');
});

// Handler order: consent is decided BEFORE anything is created. A refactor that moved the
// lookup after account creation would pass every pure-function test — this one catches it.
const fakeSession = { access_token: 'sb-a', refresh_token: 'sb-r' };
const makeDeps = (row: { terms_agreed_at: string | null } | null) => {
  const calls: string[] = [];
  return {
    calls,
    deps: {
      verify: (_t: string) => (calls.push('verify'), Promise.resolve(123456)),
      lookupTerms: (_id: number) => (calls.push('lookup'), Promise.resolve(row)),
      createSession: (_id: number, record: boolean) => (calls.push(`create:${record}`), Promise.resolve(fakeSession)),
    },
  };
};

Deno.test('handleRequest: 동의 없는 신규 요청은 412이고 아무것도 만들지 않는다', async () => {
  const { calls, deps } = makeDeps(null);
  const res = await handleRequest({ kakaoAccessToken: 't' }, deps);
  assertEquals(res.status, 412);
  assertEquals(res.body, { error: 'terms_required', termsVersion: '2026-09-25' });
  assertEquals(calls, ['verify', 'lookup']);
});

Deno.test('handleRequest: 현재 버전으로 동의하면 계정을 만들며 동의를 기록한다', async () => {
  const { calls, deps } = makeDeps(null);
  const res = await handleRequest({ kakaoAccessToken: 't', agreedTermsVersion: '2026-09-25' }, deps);
  assertEquals(res.status, 200);
  assertEquals(res.body, fakeSession);
  assertEquals(calls, ['verify', 'lookup', 'create:true']);
});

Deno.test('handleRequest: 이미 동의한 사용자는 기록 없이 세션만', async () => {
  const { calls, deps } = makeDeps({ terms_agreed_at: '2026-09-25T00:00:00Z' });
  const res = await handleRequest({ kakaoAccessToken: 't', agreedTermsVersion: '2020-01-01' }, deps);
  assertEquals(res.status, 200);
  assertEquals(calls, ['verify', 'lookup', 'create:false']);
});

Deno.test('handleRequest: 토큰이 없으면 400이고 카카오도 부르지 않는다', async () => {
  const { calls, deps } = makeDeps(null);
  const res = await handleRequest({}, deps);
  assertEquals(res.status, 400);
  assertEquals(calls, []);
});
