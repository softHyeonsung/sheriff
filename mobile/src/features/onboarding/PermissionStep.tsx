// mobile/src/features/onboarding/PermissionStep.tsx
// 위치·알림 공용. 허용·거절·실패 모두 다음으로 — 권한 때문에 막히지 않는다.
import { StyleSheet, Text } from 'react-native';
import { color, type } from '@/constants/tokens';
import { PrimaryButton, StepScreen, TextButton } from './ui';

export function PermissionStep({ text, ask, onDone }: { text: string; ask: () => Promise<unknown>; onDone: () => void }) {
  const turnOn = async () => {
    try {
      await ask();
    } catch (e) {
      console.warn('권한 요청 실패', e);
    }
    onDone();
  };
  return (
    <StepScreen
      footer={
        <>
          <PrimaryButton label="켜기" onPress={turnOn} />
          <TextButton label="나중에" onPress={onDone} />
        </>
      }>
      <Text style={styles.title} accessibilityRole="header">
        {text}
      </Text>
    </StepScreen>
  );
}

const styles = StyleSheet.create({ title: { ...type.title, color: color.ink, textAlign: 'center' } });
