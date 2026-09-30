// supabase/functions/_shared/auth.ts
// 게이트웨이의 verify_jwt는 공개 anon 키도 통과시킨다: 진짜 로그인한 사용자인지 따로 본다.
import { createClient } from 'jsr:@supabase/supabase-js@2';

export async function signedIn(req: Request): Promise<boolean> {
  const auth = req.headers.get('Authorization');
  if (!auth) return false;
  const db = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
    global: { headers: { Authorization: auth } },
  });
  const { data, error } = await db.auth.getUser();
  return !error && !!data.user;
}
