// mobile/src/features/profile/__tests__/nickname.test.ts
import { ADJECTIVES, NOUNS, randomNickname, validNickname } from '../nickname';

test('규칙: 2~12자 한글·영문·숫자·_ (앞뒤 공백 무시)', () => {
  expect(validNickname('졸린식빵')).toBe(true);
  expect(validNickname('  Nabi_7 ')).toBe(true);
  expect(validNickname('a')).toBe(false);
  expect(validNickname('열세글자가넘는아주긴닉네임')).toBe(false);
  expect(validNickname('공 백')).toBe(false);
  expect(validNickname('야옹!')).toBe(false);
});

test('단어 목록 30×30, 모든 조합이 규칙을 통과한다', () => {
  expect(ADJECTIVES).toHaveLength(30);
  expect(NOUNS).toHaveLength(30);
  expect(new Set(ADJECTIVES).size).toBe(30);
  expect(new Set(NOUNS).size).toBe(30);
  for (const a of ADJECTIVES) for (const n of NOUNS) expect(validNickname(a + n)).toBe(true);
});

test('랜덤: 형용사+명사, 직전과 다르고, 여러 번 뽑으면 다양하다', () => {
  const seen = new Set<string>();
  let prev: string | undefined;
  for (let i = 0; i < 200; i++) {
    const n = randomNickname(prev);
    expect(n).not.toBe(prev);
    expect(ADJECTIVES.some((a) => n.startsWith(a) && NOUNS.includes(n.slice(a.length)))).toBe(true);
    seen.add(n);
    prev = n;
  }
  expect(seen.size).toBeGreaterThan(100);
});

test('같은 값이 나와도 직전이면 다시 뽑는다', () => {
  const rng = jest.fn().mockReturnValueOnce(0).mockReturnValueOnce(0).mockReturnValueOnce(0).mockReturnValueOnce(0.99).mockReturnValue(0.5);
  const first = randomNickname(undefined, () => 0);
  expect(randomNickname(first, rng)).not.toBe(first);
});
