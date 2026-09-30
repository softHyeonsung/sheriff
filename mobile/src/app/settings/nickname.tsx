// mobile/src/app/settings/nickname.tsx
// 프로필 → 닉네임 바꾸기(온보딩 조각 재사용).
import { router } from 'expo-router';
import { NicknameStep } from '@/features/onboarding/NicknameStep';
import { useMeStore } from '@/stores/meStore';

export default function NicknameSettings() {
  const me = useMeStore((s) => s.me);
  const setMe = useMeStore((s) => s.setMe);
  return (
    <NicknameStep
      initial={me?.nickname ?? undefined}
      cta="저장할게요"
      onDone={(nickname) => {
        const cur = useMeStore.getState().me;
        if (cur) setMe({ ...cur, nickname });
        router.back();
      }}
    />
  );
}
