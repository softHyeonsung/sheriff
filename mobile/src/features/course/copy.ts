// mobile/src/features/course/copy.ts
// 코스(고양이의 산책 제안) 문구.
export const COURSE = {
  button: '산책 코스 추천받기', // 아이콘 버튼의 읽어 주는 이름
  wish: '찜',
  finding: '어디가 좋을지 둘러보고 있다냥…',
  empty: '이 근처는 벌써 다 개척했다냥! 대단하다냥.',
  limited: '오늘은 길 안내를 다 썼다냥. 핀만 보여줄게냥.',
  tooSoon: (waitS: number) => `방금 추천해 줬다냥. ${Math.ceil(waitS / 60)}분 뒤에 다시 물어봐 달라냥.`,
  noLocation: '지금 있는 곳을 아직 모른다냥. 위치를 켜고 다시 해볼까냥?',
  notFound: '이 장소를 찾지 못했다냥. 찜 화면에서 직접 찾아 추가해 달라냥.',
  find: '찜 화면에서 찾기',
  wished: '찜했다냥',
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
