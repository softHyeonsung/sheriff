// mobile/src/features/arrival/ArrivalOffer.tsx
// 축하 뒤 한 번 뜨는 "항상 허용" 권한 제안. 지도 아래 판 안에 놓인다.
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/kit';
import { color, type } from '@/constants/tokens';

export function ArrivalOffer({ onAnswer }: { onAnswer: (accept: boolean) => void }) {
  return (
    <View style={styles.card} accessibilityViewIsModal>
      <Text style={styles.title}>다음에 여기 오면 내가 알려줄까냥?</Text>
      <Text style={styles.body}>앱을 안 켜도 알려주려면 위치를 &apos;항상 허용&apos;으로 바꿔달라냥.</Text>
      <Button label="좋아요" size="lg" onPress={() => onAnswer(true)} />
      <Button label="괜찮아요" variant="plain" style={styles.center} onPress={() => onAnswer(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: 12 },
  title: { ...type.subtitle, color: color.ink },
  body: { ...type.body, color: color.inkSub },
  center: { alignSelf: 'center' },
});
