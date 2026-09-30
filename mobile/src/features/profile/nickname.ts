// mobile/src/features/profile/nickname.ts
// 닉네임 규칙(서버 set_nickname과 같음)과 랜덤 추천. 추천은 폰에서 뽑고, 겹치는지는 저장할 때 서버가 본다.
export const NICKNAME_RE = /^[가-힣A-Za-z0-9_]{2,12}$/;

export const validNickname = (s: string) => NICKNAME_RE.test(s.trim());

export const ADJECTIVES = [
  '졸린', '수줍은', '용감한', '느긋한', '배고픈', '반짝이는', '말랑한', '씩씩한', '새침한', '포근한',
  '엉뚱한', '조용한', '날쌘', '따뜻한', '궁금한', '신난', '까칠한', '동그란', '부지런한', '느릿한',
  '폭신한', '상냥한', '명랑한', '수상한', '꼬마', '늠름한', '산책하는', '두근대는', '기분좋은', '한가한',
];

export const NOUNS = [
  '고등어', '식빵', '치즈', '젤리', '꼬리', '수염', '발바닥', '골목대장', '털뭉치', '츄르',
  '방울', '구름', '호떡', '만두', '참치', '고양이', '집사', '냥냥이', '떡볶이', '붕어빵',
  '모래', '햇살', '새벽', '달빛', '산책러', '탐험가', '방랑자', '동네대장', '솜뭉치', '쿠션',
];

const pick = (list: string[], rng: () => number) => list[Math.floor(rng() * list.length) % list.length];

export function randomNickname(prev?: string, rng: () => number = Math.random): string {
  for (let i = 0; i < 20; i++) {
    const n = pick(ADJECTIVES, rng) + pick(NOUNS, rng);
    if (n !== prev) return n;
  }
  // 운이 아주 나쁘면(같은 값만 나옴) 다음 명사로 비껴간다.
  const a = ADJECTIVES[0];
  return prev === a + NOUNS[0] ? a + NOUNS[1] : a + NOUNS[0];
}
