// supabase/functions/kakao-custom-token/index.ts
//
// Exchanges a Kakao access token (from the native Kakao SDK) for a real Supabase session.
// POST { kakaoAccessToken, agreedTermsVersion? } -> { access_token, refresh_token } | 412 { error: 'terms_required', termsVersion } | { error }
import { createClient } from 'jsr:@supabase/supabase-js@2';

const KAKAO_APP_ID = Number(Deno.env.get('KAKAO_APP_ID'));
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

// Single source of truth for the current terms version. The app never hardcodes it:
// it echoes back whatever the 412 response said.
export const TERMS_VERSION = '2026-09-25';

export type TermsDecision = 'ok' | 'record' | 'required';

// ok: already agreed (never overwrite the record) · record: agreeing to the current version now ·
// required: must agree first — nothing may be created.
export function termsDecision(
  row: { terms_agreed_at: string | null } | null,
  agreedVersion: string | undefined,
  currentVersion: string,
): TermsDecision {
  if (row?.terms_agreed_at) return 'ok';
  return agreedVersion === currentVersion ? 'record' : 'required';
}

export interface KakaoTokenInfo {
  id: number;
  app_id: number;
  expires_in: number;
}

// The client hands us a Kakao access token from the native SDK. Any Kakao app can mint a
// token for the same user, so the token must be proven to belong to OUR app (app_id) —
// otherwise a token from some unrelated Kakao app would log its holder in as that user.
export async function verifyKakaoAccessToken(
  accessToken: string,
  appId: number,
  fetchImpl: typeof fetch = fetch,
): Promise<number> {
  if (!Number.isFinite(appId) || appId <= 0) throw new Error('KAKAO_APP_ID is not configured');
  const res = await fetchImpl('https://kapi.kakao.com/v1/user/access_token_info', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`kakao token check failed: ${res.status} ${await res.text()}`);
  }
  const info: KakaoTokenInfo = await res.json();
  if (info.app_id !== appId) throw new Error('kakao token was issued to a different app');
  return info.id;
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

export async function upsertSupabaseUser(kakaoId: number, recordTerms: boolean) {
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
  // hashed_token is already the stored hash: it goes in `token_hash`. Passing it as `token`
  // (with email) makes GoTrue hash it again -> "Token has expired or is invalid" for every login.
  // Pinned by session.integration.test.ts against the real local GoTrue.
  const { data: sessionData, error: verifyError } = await anon.auth.verifyOtp({
    token_hash: hashedToken,
    type: 'magiclink',
  });
  if (verifyError) throw verifyError;
  if (!sessionData.session || !sessionData.user) throw new Error('failed to establish session');

  const { error: usersError } = await admin.from('users').upsert(
    {
      uid: sessionData.user.id,
      provider: 'kakao',
      kakao_id: kakaoId,
      ...(recordTerms ? { terms_agreed_at: new Date().toISOString(), terms_version: TERMS_VERSION } : {}),
    },
    { onConflict: 'uid' },
  );
  if (usersError) throw usersError;
  // ignoreDuplicates: create the profile row once; never touch it (nickname, cat) on re-login.
  const { error: profileError } = await admin
    .from('profiles')
    .upsert(
      profileSeed(sessionData.user.id),
      { onConflict: 'user_id', ignoreDuplicates: true },
    );
  if (profileError) throw profileError;

  return sessionData.session;
}

// 가입 때는 프로필 행만. 닉네임은 온보딩에서 사용자가 정한다(카카오 번호·내부 id를 이름에 쓰지 않는다).
export function profileSeed(userId: string) {
  return { user_id: userId };
}

export interface HandlerDeps {
  verify: (kakaoAccessToken: string) => Promise<number>;
  lookupTerms: (kakaoId: number) => Promise<{ terms_agreed_at: string | null } | null>;
  createSession: (kakaoId: number, recordTerms: boolean) => Promise<{ access_token: string; refresh_token: string }>;
}

// The whole request flow, with I/O injected so its ORDER is testable: consent is decided
// before anything is created — no account exists without agreement.
export async function handleRequest(
  { kakaoAccessToken, agreedTermsVersion }: { kakaoAccessToken?: string; agreedTermsVersion?: string },
  deps: HandlerDeps,
): Promise<{ status: number; body: unknown }> {
  if (!kakaoAccessToken) return { status: 400, body: { error: 'kakaoAccessToken required' } };
  const kakaoId = await deps.verify(kakaoAccessToken);
  const decision = termsDecision(await deps.lookupTerms(kakaoId), agreedTermsVersion, TERMS_VERSION);
  if (decision === 'required') return { status: 412, body: { error: 'terms_required', termsVersion: TERMS_VERSION } };
  const session = await deps.createSession(kakaoId, decision === 'record');
  return { status: 200, body: { access_token: session.access_token, refresh_token: session.refresh_token } };
}

const liveDeps: HandlerDeps = {
  verify: (token) => verifyKakaoAccessToken(token, KAKAO_APP_ID),
  lookupTerms: async (kakaoId) => {
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data, error } = await admin.from('users').select('terms_agreed_at').eq('kakao_id', kakaoId).maybeSingle();
    if (error) throw error;
    return data;
  },
  createSession: upsertSupabaseUser,
};

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

// 서버 안쪽 오류 글(표 이름·SDK 문구)은 기록에만 남기고 밖으로는 내보내지 않는다.
export async function respond(req: Request, deps: HandlerDeps): Promise<Response> {
  const input = await req.json().catch(() => null);
  if (typeof input !== 'object' || input === null) return json({ error: 'invalid_input' }, 400);
  try {
    const { status, body } = await handleRequest(input, deps);
    return json(body, status);
  } catch (e) {
    console.error('kakao-custom-token 실패', e);
    return json({ error: 'internal' }, 500);
  }
}

Deno.serve((req) => respond(req, liveDeps));
