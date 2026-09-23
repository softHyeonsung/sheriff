// supabase/functions/kakao-custom-token/index.test.ts
import { assertEquals, assertThrows } from 'jsr:@std/assert';
import { assertKakaoOwner, exchangeKakaoCode, fetchKakaoProfile } from './index.ts';

Deno.test('exchangeKakaoCode parses a successful response', async () => {
  const mockFetch = () =>
    Promise.resolve(
      new Response(JSON.stringify({ access_token: 'fake-token', token_type: 'bearer', expires_in: 3600 }), {
        status: 200,
      }),
    );
  const result = await exchangeKakaoCode('fake-code', 'sanchaeknyang://oauthredirect', mockFetch as typeof fetch);
  assertEquals(result.access_token, 'fake-token');
});

Deno.test('exchangeKakaoCode throws when Kakao returns an error', async () => {
  const mockFetch = () => Promise.resolve(new Response('invalid_grant', { status: 400 }));
  let threw = false;
  try {
    await exchangeKakaoCode('bad-code', 'sanchaeknyang://oauthredirect', mockFetch as typeof fetch);
  } catch {
    threw = true;
  }
  assertEquals(threw, true);
});

Deno.test('fetchKakaoProfile parses the Kakao user id', async () => {
  const mockFetch = () => Promise.resolve(new Response(JSON.stringify({ id: 123456 }), { status: 200 }));
  const profile = await fetchKakaoProfile('fake-token', mockFetch as typeof fetch);
  assertEquals(profile.id, 123456);
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
