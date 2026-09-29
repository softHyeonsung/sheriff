// mobile/src/features/onboarding/onboardingApi.ts
// 온보딩이 서버와 나누는 대화 전부.
import { supabase } from '@/services/supabase';
import { type CatColor, isCatColor } from '@/map/catColors';
import type { Me } from '@/stores/meStore';

export async function myOnboarding(): Promise<Me> {
  const { data, error } = await supabase.rpc('my_onboarding');
  if (error) throw error;
  if (!data) throw new Error('no_user_row');
  const d = data as Me;
  return { ...d, catColor: isCatColor(d.catColor) ? d.catColor : null };
}

async function call(fn: string, args?: Record<string, unknown>) {
  const { error } = args ? await supabase.rpc(fn, args) : await supabase.rpc(fn);
  if (error) throw error;
}

export const saveCat = (name: string, color: CatColor) => call('save_cat', { p_name: name, p_color: color });
export const setHomeDong = (name: string) => call('set_home_dong', { p_name: name });
export const completeOnboarding = () => call('complete_onboarding');

async function region(body: Record<string, unknown>): Promise<string[]> {
  const { data, error } = await supabase.functions.invoke('home-region', { body, timeout: 10000 });
  if (error) throw error;
  return ((data?.dongs ?? []) as { name: string }[]).map((d) => d.name);
}

export const regionAt = (p: { lat: number; lng: number }) => region({ lat: p.lat, lng: p.lng });
export const searchRegion = (query: string) => region({ query });
