// supabase/functions/kakao-custom-token/index.test.ts
import { assertEquals, assertRejects, assertThrows } from 'jsr:@std/assert';
import { assertKakaoOwner, verifyKakaoAccessToken } from './index.ts';

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
