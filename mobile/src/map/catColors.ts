// mobile/src/map/catColors.ts
// 고를 수 있는 고양이 세 마리(그림이 다른 고양이)와 자세. 이름은 예전 그대로 CatColor.
export type CatColor = 'cheese' | 'white' | 'mackerel';
export const CAT_COLORS: CatColor[] = ['cheese', 'white', 'mackerel'];
export const CAT_COLOR_LABEL: Record<CatColor, string> = { cheese: '치즈', white: '하양', mackerel: '고등어' };
export function isCatColor(v: unknown): v is CatColor {
  return typeof v === 'string' && (CAT_COLORS as string[]).includes(v);
}

export type CatPose = 'sit' | 'walk' | 'lie' | 'happy' | 'look';
export const CAT_POSES: CatPose[] = ['sit', 'walk', 'lie', 'happy', 'look'];
