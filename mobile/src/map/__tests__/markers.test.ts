// mobile/src/map/__tests__/markers.test.ts
import { GRADES, GRADE_LABEL, isGrade } from '../grades';
import { MARKER_SIZE, markerFor } from '../markers';

test('5등급 모두 PNG data URI와 크기를 가진다', () => {
  for (const g of GRADES) {
    const m = markerFor(g);
    expect(m.uri.startsWith('data:image/png;base64,')).toBe(true);
    expect(m.uri.length).toBeGreaterThan(200);
    expect(m.size).toBe(MARKER_SIZE[g]);
  }
});

test('등급이 오를수록 마커가 커진다', () => {
  const sizes = GRADES.map((g) => MARKER_SIZE[g]);
  expect(sizes).toEqual([36, 44, 52, 60, 68]);
});

test('등급 이름과 판별', () => {
  expect(GRADE_LABEL).toEqual({ paw: '발자국', box: '박스', hut: '작은 집', tower: '캣타워', palace: '캣 팰리스' });
  expect(isGrade('hut')).toBe(true);
  expect(isGrade('castle')).toBe(false);
  expect(isGrade(3)).toBe(false);
});
