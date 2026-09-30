// mobile/src/features/wishlist/useIncomingShare.ts
// 공유로 들어온 글을 기억한다(루트 레이아웃에서 — 어느 화면이든). 여는 건 지도가 한다.
import { useShareIntentContext } from 'expo-share-intent';
import { useEffect } from 'react';
import { useShareStore } from '@/stores/shareStore';

export function useIncomingShare(): void {
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntentContext();
  const setPending = useShareStore((s) => s.setPending);
  useEffect(() => {
    if (!hasShareIntent) return;
    const text = shareIntent.text || shareIntent.webUrl;
    if (text) setPending(text);
    resetShareIntent();
  }, [hasShareIntent, shareIntent, resetShareIntent, setPending]);
}
