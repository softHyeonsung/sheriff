// mobile/src/features/territory/stages.ts
export type DongStage = 'fog' | 'sprout' | 'cozy' | 'cat' | 'kingdom';

export const STAGE_LABEL: Record<DongStage, { emoji: string; name: string }> = {
  fog: { emoji: '🌫️', name: '안개 낀 골목' },
  sprout: { emoji: '🌱', name: '개척지' },
  cozy: { emoji: '🏘️', name: '아늑한 동네' },
  cat: { emoji: '🐾', name: '고양이 영역' },
  kingdom: { emoji: '👑', name: '고양이 왕국' },
};

export function isDongStage(v: unknown): v is DongStage {
  return typeof v === 'string' && v in STAGE_LABEL;
}
