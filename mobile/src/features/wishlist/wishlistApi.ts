// mobile/src/features/wishlist/wishlistApi.ts
// 찜이 서버와 나누는 대화 전부: 검색·공유 해석(Edge Function), 찜 추가·해제·목록(RPC).
import { supabase } from '@/services/supabase';

export type Place = { placeId: string; name: string; roadAddress: string | null; lat: number; lng: number; distanceM: number | null };
export type Wish = { placeId: string; name: string; roadAddress: string | null; lat: number; lng: number; achievedAt: string | null };
type Near = { lat: number; lng: number } | null;

const withNear = (body: Record<string, unknown>, near: Near) => (near ? { ...body, lat: near.lat, lng: near.lng } : body);

export async function searchPlaces(query: string, near: Near): Promise<Place[]> {
  const { data, error } = await supabase.functions.invoke('search-place', { body: withNear({ query }, near), timeout: 10000 });
  if (error) throw error;
  return (data?.places ?? []) as Place[];
}

export async function parseShared(text: string, near: Near): Promise<{ places: Place[]; query: string | null }> {
  const { data, error } = await supabase.functions.invoke('parse-shared', { body: withNear({ text }, near), timeout: 15000 });
  if (error) throw error;
  return { places: (data?.places ?? []) as Place[], query: (data?.query ?? null) as string | null };
}

export async function addWish(p: Place): Promise<void> {
  const { error } = await supabase.rpc('add_wish', {
    p_place_id: p.placeId,
    p_name: p.name,
    p_road_address: p.roadAddress,
    p_lat: p.lat,
    p_lng: p.lng,
  });
  if (error) throw error;
}

export async function removeWish(placeId: string): Promise<void> {
  const { error } = await supabase.rpc('remove_wish', { p_place_id: placeId });
  if (error) throw error;
}

type Row = { place_id: string; name: string; road_address: string | null; lat: number; lng: number; achieved_at: string | null };

export async function myWishes(): Promise<Wish[]> {
  const { data, error } = await supabase.rpc('my_wishes');
  if (error) throw error;
  return ((data ?? []) as Row[]).map((r) => ({
    placeId: r.place_id,
    name: r.name,
    roadAddress: r.road_address,
    lat: r.lat,
    lng: r.lng,
    achievedAt: r.achieved_at,
  }));
}
