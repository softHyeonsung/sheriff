// mobile/src/features/map/mapCache.ts
// 마지막으로 본 지도(아지트·등급 기준·안개). 끊긴 동안 빈 화면 대신 이걸 보여준다.
import { jsonFile } from '@/lib/jsonFile';
import type { FogCell } from '@/map/protocol';
import type { GradeThresholds, MyHideout } from './useMyHideouts';

export type MapCache = { hideouts: MyHideout[]; thresholds: GradeThresholds | null; fog: FogCell[] | null };

const file = jsonFile<MapCache>('map-cache.json', (raw) => {
  const d = (raw && typeof raw === 'object' ? raw : {}) as Partial<MapCache>;
  return {
    hideouts: Array.isArray(d.hideouts) ? d.hideouts : [],
    thresholds: d.thresholds && typeof d.thresholds === 'object' ? d.thresholds : null,
    fog: Array.isArray(d.fog) ? d.fog : null,
  };
});

export const readMapCache = file.read;
export const saveHideouts = (hideouts: MyHideout[], thresholds: GradeThresholds) =>
  file.update(async (d) => ({ ...d, hideouts, thresholds }));
export const saveFog = (fog: FogCell[]) => file.update(async (d) => ({ ...d, fog }));
