// mobile/src/features/course/copy.ts
// 코스(고양이의 산책 제안) 문구.
export const COURSE = {
  button: '🐾 산책',
  finding: '어디가 좋을지 둘러보고 있어요…',
  empty: '이 근처는 벌써 다 개척했어요! 대단한데요.',
  limited: '오늘은 길 안내를 다 썼어요. 핀만 보여드릴게요.',
  tooSoon: (waitS: number) => `방금 추천해 드렸어요. ${Math.ceil(waitS / 60)}분 뒤에 다시 물어봐 주세요.`,
  noLocation: '지금 있는 곳을 아직 몰라요. 위치를 켜고 다시 해볼까요?',
  notFound: '이 장소를 찾지 못했어요. 찜 화면에서 직접 찾아 추가해 주세요.',
  find: '찜 화면에서 찾기',
  wish: '⭐ 찜',
  wished: '찜했어요',
  source: '장소 정보: 한국관광공사',
};

// 관광공사 이름을 카카오 검색어로: "이름(부연)" → "이름"(맨 앞 괄호는 그대로), 검색 한도 40자까지.
export function bareName(name: string): string {
  const bare = name.replace(/(?!^)\s*[([].*$/, '').trim();
  return (bare || name).slice(0, 40);
}

export function fmtM(m: number): string {
  const r = Math.max(10, Math.round(m / 10) * 10);
  return r < 1000 ? `약 ${r}m` : `약 ${(r / 1000).toFixed(1)}km`;
}
