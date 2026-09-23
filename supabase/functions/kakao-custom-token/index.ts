// supabase/functions/kakao-custom-token/index.ts
//
// Exchanges a Kakao OAuth authorization code for a real Supabase session.
// POST { code, redirectUri } -> { access_token, refresh_token } | { error }
import { createClient } from 'jsr:@supabase/supabase-js@2';

const KAKAO_REST_KEY = Deno.env.get('KAKAO_REST_KEY') ?? '';
const KAKAO_CLIENT_SECRET = Deno.env.get('KAKAO_CLIENT_SECRET'); // optional
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

export interface KakaoTokenResponse {
  access_token: string;
  token_type: string;
  refresh_token?: string;
  expires_in: number;
}

export interface KakaoUserResponse {
  id: number;
}

export async function exchangeKakaoCode(
  code: string,
  redirectUri: string,
  fetchImpl: typeof fetch = fetch,
): Promise<KakaoTokenResponse> {
  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: KAKAO_REST_KEY,
    redirect_uri: redirectUri,
    code,
  });
  if (KAKAO_CLIENT_SECRET) params.set('client_secret', KAKAO_CLIENT_SECRET);

  const res = await fetchImpl('https://kauth.kakao.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  if (!res.ok) {
    throw new Error(`kakao token exchange failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

export async function fetchKakaoProfile(
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<KakaoUserResponse> {
  const res = await fetchImpl('https://kapi.kakao.com/v2/user/me', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`kakao profile fetch failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

// The synthesized email is only a lookup key; ownership is proven by app_metadata,
// which only the service role can write (user_metadata is user-editable via updateUser).
// Without this, anyone who pre-registers kakao-<id>@... would own the victim's account.
export function assertKakaoOwner(
  user: { app_metadata?: Record<string, unknown> } | null | undefined,
  kakaoId: number,
) {
  if (user?.app_metadata?.kakao_id !== kakaoId) {
    throw new Error('existing account is not bound to this kakao id');
  }
}

export async function upsertSupabaseUser(kakaoId: number) {
  const email = `kakao-${kakaoId}@users.sanchaeknyang.app`;
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { error: createError } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    app_metadata: { provider: 'kakao', kakao_id: kakaoId },
  });
  // Already-registered user: verified against auth-js error-codes.ts (2026-09-23) —
  // AuthApiError exposes `.code === 'email_exists'`. We check the code first and
  // keep the message substring as a defensive fallback for older/self-hosted GoTrue
  // versions that may not populate `.code`.
  if (createError) {
    const code = (createError as { code?: string }).code;
    const isAlreadyExists = code === 'email_exists' || String(createError.message ?? '').toLowerCase().includes('already');
    if (!isAlreadyExists) throw createError;
  }

  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
  });
  if (linkError) throw linkError;
  assertKakaoOwner(linkData?.user, kakaoId);

  // Verified against auth-js types.ts (2026-09-23): GenerateLinkProperties has both
  // `hashed_token` and `email_otp`; `hashed_token` is the one consumed by verifyOtp.
  const hashedToken = linkData?.properties?.hashed_token;
  if (!hashedToken) throw new Error('generateLink response missing properties.hashed_token');

  const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  // Verified against auth-js types.ts (2026-09-23): the email-based VerifyOtpParams
  // variant takes { email, token, type }, not { token_hash } (token_hash is a
  // separate union member used without an email). The brief's shape is correct.
  const { data: sessionData, error: verifyError } = await anon.auth.verifyOtp({
    email,
    token: hashedToken,
    type: 'magiclink',
  });
  if (verifyError) throw verifyError;
  if (!sessionData.session || !sessionData.user) throw new Error('failed to establish session');

  const { error: usersError } = await admin
    .from('users')
    .upsert({ uid: sessionData.user.id, provider: 'kakao' }, { onConflict: 'uid' });
  if (usersError) throw usersError;
  // ignoreDuplicates: seed the default nickname once, never overwrite a user-chosen one on re-login.
  const { error: profileError } = await admin
    .from('profiles')
    .upsert(
      { user_id: sessionData.user.id, nickname: `고양이집사${kakaoId}` },
      { onConflict: 'user_id', ignoreDuplicates: true },
    );
  if (profileError) throw profileError;

  return sessionData.session;
}

Deno.serve(async (req) => {
  try {
    const { code, redirectUri } = await req.json();
    if (!code || !redirectUri) {
      return new Response(JSON.stringify({ error: 'code and redirectUri required' }), { status: 400 });
    }
    const tokenRes = await exchangeKakaoCode(code, redirectUri);
    const profile = await fetchKakaoProfile(tokenRes.access_token);
    const session = await upsertSupabaseUser(profile.id);

    return new Response(
      JSON.stringify({ access_token: session.access_token, refresh_token: session.refresh_token }),
      { headers: { 'Content-Type': 'application/json' } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
