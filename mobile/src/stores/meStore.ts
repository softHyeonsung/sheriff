// mobile/src/stores/meStore.ts
import { create } from 'zustand';
import type { CatColor } from '@/map/catColors';

// 나에 대한 서버 사실(my_onboarding): 라우팅 가드·온보딩 이어하기·지도 고양이 색이 같이 본다.
export type Me = { onboarded: boolean; catName: string | null; catColor: CatColor | null; homeDong: string | null; hasHideout: boolean };

export const useMeStore = create<{ me: Me | null; setMe: (me: Me | null) => void }>((set) => ({
  me: null,
  setMe: (me) => set({ me }),
}));
