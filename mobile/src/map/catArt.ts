// mobile/src/map/catArt.ts
// 고양이 그림 고르기: 없는 자세는 그 고양이의 앉기로(그림을 빼먹어도 깨지지 않게).
import { CAT_IMAGES } from './cat-image.generated';
import { CAT_POSES, type CatColor, type CatPose } from './catColors';

export function catArt(color: CatColor, pose: CatPose): string {
  const set = CAT_IMAGES[color] ?? {};
  return set[pose] ?? set.sit ?? CAT_IMAGES.cheese.sit ?? '';
}

export function catPoses(color: CatColor): Record<CatPose, string> {
  return Object.fromEntries(CAT_POSES.map((p) => [p, catArt(color, p)])) as Record<CatPose, string>;
}
