// mobile/src/app/settings/cat.tsx
// 프로필 → 고양이 바꾸기. 스토어의 털색이 바뀌면 지도 고양이도 바로 바뀐다.
import { router } from 'expo-router';
import { CatStep } from '@/features/onboarding/CatStep';
import { useMeStore } from '@/stores/meStore';

export default function CatSettings() {
  const me = useMeStore((s) => s.me);
  const setMe = useMeStore((s) => s.setMe);
  return (
    <CatStep
      initialName={me?.catName ?? ''}
      initialColor={me?.catColor ?? 'cheese'}
      cta="저장할게요"
      onDone={(catName, catColor) => {
        const cur = useMeStore.getState().me;
        if (cur) setMe({ ...cur, catName, catColor });
        router.back();
      }}
    />
  );
}
