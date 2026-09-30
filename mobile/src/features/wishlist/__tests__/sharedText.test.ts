// mobile/src/features/wishlist/__tests__/sharedText.test.ts
import { looksShared } from '../sharedText';

test('링크가 있거나 여러 줄이면 공유 글로 본다', () => {
  expect(looksShared('https://naver.me/abc')).toBe(true);
  expect(looksShared('[네이버 지도]\n스타벅스')).toBe(true);
  expect(looksShared('스타벅스 성수')).toBe(false);
  expect(looksShared('  ')).toBe(false);
});
