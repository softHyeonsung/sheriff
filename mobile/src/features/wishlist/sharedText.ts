// mobile/src/features/wishlist/sharedText.ts
// 검색창에 들어온 게 가게 이름이 아니라 공유 글·링크인지(그럼 서버 해석기로).
export const looksShared = (s: string) => /https?:\/\//.test(s) || s.trim().includes('\n');
