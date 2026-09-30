// mobile/src/app/settings/home.tsx
// 프로필 → 내 동네 바꾸기(추정·검색 그대로).
import { router } from 'expo-router';
import { HomeDongStep } from '@/features/onboarding/HomeDongStep';
import { useMeStore } from '@/stores/meStore';

export default function HomeSettings() {
  const setMe = useMeStore((s) => s.setMe);
  return (
    <HomeDongStep
      onBack={() => router.back()}
      onDone={(homeDong) => {
        const cur = useMeStore.getState().me;
        if (cur) setMe({ ...cur, homeDong });
        router.back();
      }}
    />
  );
}
