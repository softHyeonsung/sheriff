// mobile/src/features/territory/DongBadge.tsx
// 지도 위 왼쪽: 지금 보는 동네와 그 동네를 얼마나 누볐는지.
import { StyleSheet, Text, View } from 'react-native';
import { color, radius, shadow, type } from '@/constants/tokens';
import { STAGE_LABEL } from './stages';
import type { Dong } from './territoryApi';

export function DongBadge({ dong }: { dong: Dong | null }) {
  if (!dong) return null;
  const { emoji, name } = STAGE_LABEL[dong.stage];
  const rest = ` · ${emoji} ${name} · 개척률 ${dong.ratio}%`;
  return (
    <View style={styles.badge} accessible accessibilityLabel={`${dong.name}${rest}`}>
      <Text style={styles.name}>{dong.name}</Text>
      <Text style={styles.rest}>
        {emoji} {name} · 개척률 {dong.ratio}%
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.btn,
    backgroundColor: color.surfaceCard,
    ...shadow.card,
  },
  name: { ...type.label, color: color.ink },
  rest: { ...type.caption, fontSize: 12, lineHeight: 16, color: color.inkSub },
});
