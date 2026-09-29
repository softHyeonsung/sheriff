// mobile/src/features/onboarding/onboardingApi.ts
// 온보딩이 서버와 나누는 대화 전부.
import { supabase } from '@/services/supabase';
import { type CatColor, isCatColor } from '@/map/catColors';
import type { Me } from '@/stores/meStore';

const TIMEOUT_MS = 10000;

// RN fetch has no default timeout: a stalled call would leave the layout (or a step) waiting forever.
async function rpc(fn: string, args?: Record<string, unknown>): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const { data, error } = await (args ? supabase.rpc(fn, args) : supabase.rpc(fn)).abortSignal(ctrl.signal);
    if (error) throw error;
    return data;
  } finally {
    clearTimeout(timer);
  }
}

export async function myOnboarding(): Promise<Me> {
  const data = await rpc('my_onboarding');
  if (!data) throw new Error('no_user_row');
  const d = data as Me;
  return { ...d, catColor: isCatColor(d.catColor) ? d.catColor : null };
}

export const saveCat = async (name: string, color: CatColor) => void (await rpc('save_cat', { p_name: name, p_color: color }));
export const setHomeDong = async (name: string) => void (await rpc('set_home_dong', { p_name: name }));
export const completeOnboarding = async () => void (await rpc('complete_onboarding'));

async function region(body: Record<string, unknown>): Promise<string[]> {
  const { data, error } = await supabase.functions.invoke('home-region', { body, timeout: 10000 });
  if (error) throw error;
  return ((data?.dongs ?? []) as { name: string }[]).map((d) => d.name);
}

export const regionAt = (p: { lat: number; lng: number }) => region({ lat: p.lat, lng: p.lng });
export const searchRegion = (query: string) => region({ query });
