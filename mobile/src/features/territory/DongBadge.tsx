// mobile/src/features/territory/DongBadge.tsx
import { StyleSheet, Text, View } from 'react-native';
import { color, font, radius, type } from '@/constants/tokens';
import { STAGE_LABEL } from './stages';
import type { Dong } from './territoryApi';

export function DongBadge({ dong }: { dong: Dong | null }) {
  if (!dong) return null;
  const { emoji, name } = STAGE_LABEL[dong.stage];
  const rest = ` · ${emoji} ${name} · 개척률 ${dong.ratio}%`;
  return (
    <View style={styles.badge} accessible accessibilityLabel={`${dong.name}${rest}`}>
      <Text style={styles.text}>
        <Text style={styles.strong}>{dong.name}</Text>
        {rest}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'center',
    marginTop: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: color.surfaceCard,
    borderWidth: 1,
    borderColor: color.line,
  },
  text: { ...type.caption, color: color.ink },
  strong: { fontFamily: font.semibold },
});
