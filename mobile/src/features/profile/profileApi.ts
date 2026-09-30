// mobile/src/features/profile/profileApi.ts
// 계정 탈퇴(즉시): 서버가 사진 파일과 계정을 지운다. DB는 연쇄 삭제.
import { supabase } from '@/services/supabase';

export async function deleteAccount(): Promise<void> {
  const { error } = await supabase.functions.invoke('delete-account', { timeout: 20000 });
  if (error) throw error;
}
