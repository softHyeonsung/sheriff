// mobile/src/app/onboarding.tsx
// 온보딩 조립: 단계 규칙(nextStep) + 조각들. 끝나면 스토어를 onboarded로 → 레이아웃 가드가 지도로.
import { useEffect, useState } from 'react';
import { ActivityIndicator, BackHandler, StyleSheet, Text } from 'react-native';
import { color, type } from '@/constants/tokens';
import { MSG } from '@/features/checkin/copy';
import { CatStep } from '@/features/onboarding/CatStep';
import { FirstFootprintStep } from '@/features/onboarding/FirstFootprintStep';
import { HomeDongStep } from '@/features/onboarding/HomeDongStep';
import { completeOnboarding } from '@/features/onboarding/onboardingApi';
import { PermissionStep } from '@/features/onboarding/PermissionStep';
import { askLocation, askNotifications, locationAsked, notificationsAsked } from '@/features/onboarding/permissions';
import { nextStep, type Progress, type Step } from '@/features/onboarding/steps';
import { Tutorial } from '@/features/onboarding/Tutorial';
import { PrimaryButton, StepScreen } from '@/features/onboarding/ui';
import { Welcome } from '@/features/onboarding/Welcome';
import { useMeStore } from '@/stores/meStore';

export default function Onboarding() {
  const me = useMeStore((s) => s.me);
  const setMe = useMeStore((s) => s.setMe);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [step, setStep] = useState<Step>('welcome');
  const [saveFailed, setSaveFailed] = useState(false);

  // 앞으로만: 하드웨어 뒤로가기로 온보딩을 빠져나가지 않는다.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!me) return;
    Promise.all([locationAsked(), notificationsAsked()])
      .catch(() => [false, false])
      .then(([l, n]) =>
        setProgress((p) => p ?? { catName: me.catName, homeDong: me.homeDong, hasHideout: me.hasHideout, locationAsked: l, notificationsAsked: n }),
      );
  }, [me]);

  if (!me || !progress) return <StepScreen><ActivityIndicator color={color.primary} /></StepScreen>;

  const finish = async () => {
    setSaveFailed(false);
    try {
      await completeOnboarding();
      setMe({ ...useMeStore.getState().me!, onboarded: true });
    } catch (e) {
      console.error('온보딩 완료 저장 실패', e);
      setSaveFailed(true);
    }
  };

  const advance = (patch: Partial<Progress> = {}) => {
    const p = { ...progress, ...patch };
    setProgress(p);
    const n = nextStep(step, p);
    setStep(n);
    if (n === 'done') finish();
  };

  switch (step) {
    case 'welcome':
      return <Welcome onDone={() => advance()} />;
    case 'cat':
      return (
        <CatStep
          onDone={(catName, catColor) => {
            setMe({ ...me, catName, catColor });
            advance({ catName });
          }}
        />
      );
    case 'location':
      return <PermissionStep text="어디를 다녀왔는지 알아야 발자국을 남길 수 있어요. 위치를 켜주실래요?" ask={askLocation} onDone={() => advance({ locationAsked: true })} />;
    case 'notifications':
      return <PermissionStep text="도착하면 제가 살짝 알려드릴게요. 알림만 켜두시면 돼요." ask={askNotifications} onDone={() => advance({ notificationsAsked: true })} />;
    case 'homeDong':
      return (
        <HomeDongStep
          onDone={(homeDong) => {
            setMe({ ...useMeStore.getState().me!, homeDong });
            advance({ homeDong });
          }}
        />
      );
    case 'tutorial':
      return <Tutorial onDone={() => advance()} />;
    case 'firstFootprint':
      return (
        <FirstFootprintStep
          onDone={(made) => {
            if (made) setMe({ ...useMeStore.getState().me!, hasHideout: true });
            advance({ hasHideout: true }); // "나중에"여도 이 단계는 끝
          }}
        />
      );
    default:
      return (
        <StepScreen footer={saveFailed ? <PrimaryButton label="다시 시도" onPress={finish} /> : undefined}>
          {saveFailed ? <Text style={styles.body}>{MSG.unknown}</Text> : <ActivityIndicator testID="saving" color={color.primary} />}
        </StepScreen>
      );
  }
}

const styles = StyleSheet.create({ body: { ...type.body, color: color.ink, textAlign: 'center' } });
