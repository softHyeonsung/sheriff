// mobile/src/map/markers.ts
import type { Grade } from './grades';
import { MARKER_IMAGES } from './marker-images.generated';

// Growth reads by shape AND size (DESIGN.md §4): each stage is bigger on the map.
export const MARKER_SIZE: Record<Grade, number> = { paw: 36, box: 44, hut: 52, tower: 60, palace: 68 };

// 찜한 곳 핀: 아지트와 다른 모양(별), 따뜻한 팔레트.
const WISH_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24">' +
  '<path d="M12 2l2.9 6.3 6.9.7-5.2 4.6 1.5 6.8L12 17l-6.1 3.4 1.5-6.8L2.2 9l6.9-.7z" fill="#F2B544" stroke="#8A5A1F" stroke-width="1.2"/></svg>';
export const WISH_MARKER = { uri: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(WISH_SVG)}`, size: 36 };

export function markerFor(grade: Grade): { uri: string; size: number } {
  return { uri: MARKER_IMAGES[grade], size: MARKER_SIZE[grade] };
}
