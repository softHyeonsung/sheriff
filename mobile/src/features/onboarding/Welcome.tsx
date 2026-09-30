// mobile/src/features/onboarding/Welcome.tsx
import { Image, StyleSheet, Text } from 'react-native';
import { color, type } from '@/constants/tokens';
import { catArt } from '@/map/catArt';
import { PrimaryButton, StepScreen } from './ui';

export function Welcome({ onDone }: { onDone: () => void }) {
  return (
    <StepScreen footer={<PrimaryButton label="시작할게요" onPress={onDone} />}>
      <Image source={{ uri: catArt('cheese', 'sit') }} style={styles.cat} />
      <Text style={styles.title} accessibilityRole="header">
        안녕하세요. 저랑 같이 우리 동네를 누벼볼까요?
      </Text>
    </StepScreen>
  );
}

const styles = StyleSheet.create({
  cat: { width: 140, height: 140 },
  title: { ...type.title, color: color.ink, textAlign: 'center' },
});
