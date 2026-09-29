// mobile/src/map/catColors.ts
export type CatColor = 'cheese' | 'gray' | 'black';
export const CAT_COLORS: CatColor[] = ['cheese', 'gray', 'black'];
export const CAT_COLOR_LABEL: Record<CatColor, string> = { cheese: '치즈', gray: '회색', black: '까망' };
export function isCatColor(v: unknown): v is CatColor {
  return typeof v === 'string' && (CAT_COLORS as string[]).includes(v);
}
