// mobile/src/features/course/courseApi.ts
// 코스가 서버와 나누는 대화: 제안 받기(Edge Function), 제안된 곳을 카카오 장소로 찾기(찜용).
import { type Place, searchPlaces } from '@/features/wishlist/wishlistApi';
import { supabase } from '@/services/supabase';

export type Stop = { name: string; address: string | null; lat: number; lng: number; legM: number };
export type Course = { stops: Stop[]; route: [number, number][] | null; distanceM: number | null; routeLimited: boolean };

const SAME_PLACE_M = 200; // 큰 공원·궁은 두 서비스의 좌표가 꽤 다르다

export async function suggestCourse(lat: number, lng: number): Promise<Course> {
  const { data, error } = await supabase.functions.invoke('suggest-course', { body: { lat, lng }, timeout: 15000 });
  if (error) throw error;
  return { stops: data?.stops ?? [], route: data?.route ?? null, distanceM: data?.distanceM ?? null, routeLimited: data?.routeLimited ?? false };
}

// 찜·달성은 카카오 장소 id 기준이라, 관광공사 장소를 이름으로 카카오에서 다시 찾는다.
// 다른 동네의 같은 이름이 찜되지 않게 그 자리 200m 안의 결과만 같은 곳으로 본다.
export async function findKakaoPlace(stop: Stop): Promise<Place | null> {
  const bare = stop.name.replace(/(?!^)\s*[([].*$/, '').trim(); // "이름(부연)" → "이름", 맨 앞 괄호는 그대로
  const places = await searchPlaces((bare || stop.name).slice(0, 40), { lat: stop.lat, lng: stop.lng });
  return places.find((p) => p.distanceM != null && p.distanceM <= SAME_PLACE_M) ?? null;
}
