// mobile/src/features/onboarding/Tutorial.tsx
import { useState } from 'react';
import { Image, StyleSheet, Text } from 'react-native';
import { color, type } from '@/constants/tokens';
import { catArt } from '@/map/catArt';
import { markerFor } from '@/map/markers';
import { PrimaryButton, StepScreen } from './ui';

// ponytail: 버튼으로만 넘긴다(스와이프 없음) — 스와이프가 필요하면 가로 ScrollView pagingEnabled로.
const CUTS = [
  { text: '다녀온 곳에 발자국을 남기고', art: markerFor('paw').uri },
  { text: '발자국이 쌓이면 아지트가 자라요', art: markerFor('hut').uri },
  { text: '안개가 걷히면 제가 뛰어놀 곳이 넓어져요.', art: catArt('cheese', 'sit') },
];

export function Tutorial({ onDone }: { onDone: () => void }) {
  const [i, setI] = useState(0);
  const last = i === CUTS.length - 1;
  return (
    <StepScreen footer={<PrimaryButton label={last ? '알겠어요' : '다음'} onPress={() => (last ? onDone() : setI(i + 1))} />}>
      <Image source={{ uri: CUTS[i].art }} style={styles.art} />
      <Text style={styles.title} accessibilityRole="header">
        {CUTS[i].text}
      </Text>
      <Text style={styles.dots}>{CUTS.map((_, k) => (k === i ? '●' : '○')).join(' ')}</Text>
    </StepScreen>
  );
}

const styles = StyleSheet.create({
  art: { width: 140, height: 140 },
  title: { ...type.title, color: color.ink, textAlign: 'center' },
  dots: { ...type.caption, color: color.inkSub },
});
