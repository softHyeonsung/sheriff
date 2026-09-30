// mobile/src/features/profile/profileApi.ts
// 계정 탈퇴(즉시): 서버가 사진 파일과 계정을 지운다. DB는 연쇄 삭제.
import { supabase } from '@/services/supabase';

export async function deleteAccount(): Promise<void> {
  const { error } = await supabase.functions.invoke('delete-account', { timeout: 20000 });
  // 401 = 이 토큰의 계정이 이미 없다: 앞선 시도가 앱에선 시간 초과였지만 서버에선 끝난 경우. 탈퇴 완료로 본다.
  const status = (error as { context?: { status?: number } } | null)?.context?.status;
  if (error && !(error.name === 'FunctionsHttpError' && status === 401)) throw error;
}
