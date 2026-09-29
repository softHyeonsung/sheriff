// mobile/src/features/arrival/ArrivalOffer.tsx
// 축하 뒤 한 번 뜨는 "항상 허용" 권한 카드.
import { StyleSheet, Text, View } from 'react-native';
import { color, radius, space, type } from '@/constants/tokens';
import { PrimaryButton, TextButton } from '@/features/onboarding/ui';

export function ArrivalOffer({ onAnswer }: { onAnswer: (accept: boolean) => void }) {
  return (
    <View style={styles.card} accessibilityViewIsModal>
      <Text style={styles.title}>다음에 여기 오면 제가 알려드릴까요?</Text>
      <Text style={styles.body}>앱을 안 켜도 알려드리려면 위치를 &apos;항상 허용&apos;으로 바꿔주세요.</Text>
      <PrimaryButton label="좋아요" onPress={() => onAnswer(true)} />
      <TextButton label="괜찮아요" onPress={() => onAnswer(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    position: 'absolute',
    left: space.gutter,
    right: space.gutter,
    bottom: 96,
    gap: 12,
    padding: 20,
    borderRadius: radius.sheet,
    backgroundColor: color.surfaceCard,
    borderWidth: 1,
    borderColor: color.line,
  },
  title: { ...type.subtitle, color: color.ink },
  body: { ...type.body, color: color.inkSub },
});
