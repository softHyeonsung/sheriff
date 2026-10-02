// mobile/src/map/protocol.ts
// The only language the app and the map WebView speak. Anything that doesn't parse into
// MapToApp is dropped — the page can't make the app do something it didn't declare here.
import type { CatPose } from './catColors';
import type { Grade } from './grades';

export type LatLng = { lat: number; lng: number };
// name: 가까이 볼 때 핀 위에 붙는 이름.
export type HideoutPin = { id: string; lat: number; lng: number; grade: Grade; name: string };
export type WishPin = { placeId: string; lat: number; lng: number };
export type MyLocation = { lat: number; lng: number; accuracy: number };
// 걷힌 칸 하나: 남서·북동 모서리.
export type FogCell = { sw: LatLng; ne: LatLng };
// 코스: 순서대로 번호 핀, 길은 [위도, 경도] 점들(없으면 핀만).
export type CoursePlan = { stops: LatLng[]; route: [number, number][] | null };

export type AppToMap =
  | { type: 'setHideouts'; hideouts: HideoutPin[] }
  | { type: 'setWishes'; wishes: WishPin[] }
  | ({ type: 'setMyLocation' } & MyLocation)
  | ({ type: 'panTo'; level?: number } & LatLng) // level: 그만큼 가까이 당기며 이동(길을 보러 갈 때)
  | { type: 'setFog'; cells: FogCell[] }
  | { type: 'catSay'; text: string }
  | { type: 'setCat'; poses: Record<CatPose, string> }
  | { type: 'setCourse'; course: CoursePlan | null }
  | { type: 'setFocus'; at: LatLng | null }; // 검색해서 고른 곳의 표시(없애려면 null)

export type MapToApp =
  | { type: 'ready' }
  | { type: 'hideoutTap'; id: string }
  | { type: 'wishTap'; placeId: string }
  | { type: 'error'; reason: string }
  | { type: 'idle'; center: LatLng }
  | { type: 'catTap' };

function isLatLng(v: unknown): v is LatLng {
  if (typeof v !== 'object' || v === null) return false;
  const { lat, lng } = v as Record<string, unknown>;
  return typeof lat === 'number' && typeof lng === 'number' && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

export function parseMapMessage(raw: string): MapToApp | null {
  let m: unknown;
  try {
    m = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof m !== 'object' || m === null) return null;
  const o = m as Record<string, unknown>;
  switch (o.type) {
    case 'ready':
      return { type: 'ready' };
    case 'hideoutTap':
      return typeof o.id === 'string' ? { type: 'hideoutTap', id: o.id } : null;
    case 'wishTap':
      return typeof o.placeId === 'string' ? { type: 'wishTap', placeId: o.placeId } : null;
    case 'error':
      return typeof o.reason === 'string' ? { type: 'error', reason: o.reason } : null;
    case 'idle':
      return isLatLng(o.center) ? { type: 'idle', center: { lat: o.center.lat, lng: o.center.lng } } : null;
    case 'catTap':
      return { type: 'catTap' };
    default:
      return null;
  }
}

// Double JSON.stringify: the page receives a string literal and JSON.parses it, so no value
// is ever spliced into the script as code.
export function toMapScript(msg: AppToMap): string {
  return `window.__onAppMessage(JSON.parse(${JSON.stringify(JSON.stringify(msg))}));true;`;
}
