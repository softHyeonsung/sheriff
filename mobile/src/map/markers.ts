// mobile/src/map/markers.ts
import type { Grade } from './grades';
import { MARKER_IMAGES } from './marker-images.generated';

// Growth reads by shape AND size (DESIGN.md §4): each stage is bigger on the map.
export const MARKER_SIZE: Record<Grade, number> = { paw: 36, box: 44, hut: 52, tower: 60, palace: 68 };

export function markerFor(grade: Grade): { uri: string; size: number } {
  return { uri: MARKER_IMAGES[grade], size: MARKER_SIZE[grade] };
}
