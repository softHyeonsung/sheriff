// mobile/src/map/protocol.ts
// The only language the app and the map WebView speak. Anything that doesn't parse into
// MapToApp is dropped — the page can't make the app do something it didn't declare here.
import type { Grade } from './grades';

export type LatLng = { lat: number; lng: number };
export type HideoutPin = { id: string; lat: number; lng: number; grade: Grade };
export type MyLocation = { lat: number; lng: number; accuracy: number };

export type AppToMap =
  | { type: 'setHideouts'; hideouts: HideoutPin[] }
  | ({ type: 'setMyLocation' } & MyLocation)
  | ({ type: 'panTo' } & LatLng);

export type MapToApp = { type: 'ready' } | { type: 'hideoutTap'; id: string } | { type: 'error'; reason: string };

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
    case 'error':
      return typeof o.reason === 'string' ? { type: 'error', reason: o.reason } : null;
    default:
      return null;
  }
}

// Double JSON.stringify: the page receives a string literal and JSON.parses it, so no value
// is ever spliced into the script as code.
export function toMapScript(msg: AppToMap): string {
  return `window.__onAppMessage(JSON.parse(${JSON.stringify(JSON.stringify(msg))}));true;`;
}
