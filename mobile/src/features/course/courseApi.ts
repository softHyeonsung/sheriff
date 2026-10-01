// mobile/src/features/course/courseApi.ts
// 코스가 서버와 나누는 대화: 제안 받기(Edge Function), 제안된 곳을 카카오 장소로 찾기(찜용).
import { type Place, searchPlaces } from '@/features/wishlist/wishlistApi';
import { supabase } from '@/services/supabase';
import { bareName } from './copy';

export type Stop = { name: string; address: string | null; lat: number; lng: number; legM: number };
// 서버가 주는 자동차 길 거리(distanceM)는 걷는 거리와 크게 달라 받지 않는다.
// waitS > 0이면 방금 추천받아 새로 찾지 않았다는 뜻(남은 초).
export type Course = { stops: Stop[]; route: [number, number][] | null; routeLimited: boolean; waitS: number };

const SAME_PLACE_M = 200; // 큰 공원·궁은 두 서비스의 좌표가 꽤 다르다

export async function suggestCourse(lat: number, lng: number): Promise<Course> {
  const { data, error } = await supabase.functions.invoke('suggest-course', { body: { lat, lng }, timeout: 15000 });
  if (error) throw error;
  return { stops: data?.stops ?? [], route: data?.route ?? null, routeLimited: data?.routeLimited ?? false, waitS: data?.waitS ?? 0 };
}

// 찜·달성은 카카오 장소 id 기준이라, 관광공사 장소를 이름으로 카카오에서 다시 찾는다.
// 다른 동네의 같은 이름이 찜되지 않게 그 자리 200m 안의 결과만 같은 곳으로 본다.
export async function findKakaoPlace(stop: Stop): Promise<Place | null> {
  const query = bareName(stop.name);
  const near = (await searchPlaces(query, { lat: stop.lat, lng: stop.lng })).filter((p) => p.distanceM != null && p.distanceM <= SAME_PLACE_M);
  // 이름이 똑같은 곳이 먼저("경복궁"을 찾는데 더 가까운 "경복궁 주차장"이 찜되지 않게), 없으면 가장 가까운 곳.
  return near.find((p) => p.name === query) ?? near[0] ?? null;
}
