// mobile/src/features/territory/territoryApi.ts
import { supabase } from '@/services/supabase';
import type { FogCell, LatLng } from '@/map/protocol';
import { type DongStage, isDongStage } from './stages';

export type Dong = {
  code: string;
  name: string;
  stage: DongStage;
  hideoutCount: number;
  exploredCells: number;
  totalCells: number;
  ratio: number;
};

type FogRow = { cell_id: string; sw_lat: number; sw_lng: number; ne_lat: number; ne_lng: number };

// null = 동 경계 밖(또는 경계 데이터 없음). 모르는 단계는 그릴 이름이 없으니 null.
export async function dongAt(p: LatLng): Promise<Dong | null> {
  const { data, error } = await supabase.rpc('dong_at', { p_lat: p.lat, p_lng: p.lng });
  if (error) throw error;
  if (!data || !isDongStage((data as Dong).stage)) return null;
  return data as Dong;
}

// 지금 서 있는 칸을 걷는다(걸어 지나간 자리). 새로 걷혔으면 true.
export async function clearFogAt(p: { lat: number; lng: number; accuracy: number }): Promise<boolean> {
  const { data, error } = await supabase.rpc('clear_fog_at', { p_lat: p.lat, p_lng: p.lng, p_accuracy: p.accuracy });
  if (error) throw error;
  return data === true;
}

export async function myFog(): Promise<FogCell[]> {
  const { data, error } = await supabase.rpc('my_fog');
  if (error) throw error;
  return ((data ?? []) as FogRow[]).map((r) => ({ sw: { lat: r.sw_lat, lng: r.sw_lng }, ne: { lat: r.ne_lat, lng: r.ne_lng } }));
}
