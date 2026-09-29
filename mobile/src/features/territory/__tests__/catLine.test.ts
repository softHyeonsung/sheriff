import { CAT_LINES, pickCatLine } from '../catLine';

test('안개가 남았으면 권유와 인사를 번갈아', () => {
  expect(pickCatLine(40, 0)).toBe('저쪽 골목은 아직 안개예요. 같이 가볼까요?');
  expect(pickCatLine(40, 1)).toBe('우리 동네, 오늘도 조용하고 좋네요.');
  expect(pickCatLine(null, 0)).toBe(CAT_LINES.nudge);
});

test('다 걷혔으면 인사만', () => {
  expect(pickCatLine(100, 0)).toBe(CAT_LINES.calm);
  expect(pickCatLine(100, 1)).toBe(CAT_LINES.calm);
});
