// mobile/src/stores/shareStore.ts
import { create } from 'zustand';

// 다른 앱에서 공유된 글. 로그인·온보딩 전에 와도 기억했다가 지도에 도착하면 찜 화면으로 넘긴다.
export const useShareStore = create<{ pending: string | null; setPending: (text: string | null) => void }>((set) => ({
  pending: null,
  setPending: (pending) => set({ pending }),
}));
