// mobile/src/features/territory/catLine.ts
export const CAT_LINES = {
  calm: '우리 동네, 오늘도 조용하고 좋네요.',
  nudge: '저쪽 골목은 아직 안개예요. 같이 가볼까요?',
};

// n = 몇 번째 탭인지. 안개가 남았으면 권유와 인사를 번갈아, 다 걷혔으면 인사만.
export function pickCatLine(ratio: number | null, n: number): string {
  if (ratio === 100) return CAT_LINES.calm;
  return n % 2 === 0 ? CAT_LINES.nudge : CAT_LINES.calm;
}
