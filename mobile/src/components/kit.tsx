// mobile/src/components/kit.tsx
// 화면들이 같이 쓰는 부품: 버튼 세 단계, 아이콘 버튼, 카드, 설정 줄.
// 버튼 단계 — primary(햇살 채움): 화면에서 가장 중요한 행동 하나 / tonal(하늘 옅은 채움): 보조 행동 /
// plain(잉크 글자만): 닫기·바꾸기처럼 조용한 행동.
import { SymbolView } from 'expo-symbols';
import type { ComponentProps, ReactNode } from 'react';
import { ActivityIndicator, Pressable, type StyleProp, StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { color, radius, shadow, space, type } from '@/constants/tokens';

export type IconName = ComponentProps<typeof SymbolView>['name'];

// 같은 뜻의 아이콘을 iOS(SF Symbols)·Android(Material Symbols)에서 하나씩.
export const ICON = {
  star: { ios: 'star', android: 'star' },
  locate: { ios: 'location', android: 'my_location' },
  walk: { ios: 'pawprint', android: 'pets' },
  next: { ios: 'chevron.right', android: 'chevron_right' },
  back: { ios: 'chevron.left', android: 'chevron_left' },
  close: { ios: 'xmark', android: 'close' },
  search: { ios: 'magnifyingglass', android: 'search' },
} as const satisfies Record<string, IconName>;

export function Icon({ name, size = 22, tint = color.ink }: { name: IconName; size?: number; tint?: string }) {
  return <SymbolView name={name} size={size} tintColor={tint} />;
}

type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'tonal' | 'plain';
  size?: 'lg' | 'md';
  disabled?: boolean;
  busy?: boolean; // 누른 뒤 기다리는 중: 글자 대신 빙글빙글, 눌리지 않는다
  about?: string; // 같은 글자의 버튼이 여러 줄에 있을 때, 읽어 주는 이름 앞에 붙는다
  style?: StyleProp<ViewStyle>;
};

export function Button({ label, onPress, variant = 'primary', size = 'md', disabled = false, busy = false, about, style }: ButtonProps) {
  const off = disabled || busy;
  const ink = variant === 'primary' ? color.onPrimary : variant === 'tonal' ? color.skyInk : color.ink;
  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityLabel={about ? `${about} ${label}` : label}
      accessibilityState={{ disabled: off, busy }}
      hitSlop={variant === 'plain' ? 8 : undefined}
      style={({ pressed }) => [
        styles.btn,
        size === 'lg' ? styles.lg : styles.md,
        variant === 'primary' && styles.primary,
        variant === 'tonal' && styles.tonal,
        variant === 'plain' && styles.plain,
        pressed && styles.pressed,
        off && styles.off,
        style,
      ]}>
      {busy ? <ActivityIndicator color={ink} /> : <Text style={[styles.btnText, { color: ink }]}>{label}</Text>}
    </Pressable>
  );
}

// 지도 위에 놓이는 아이콘 버튼. 글자가 없으니 label은 읽어 주는 이름. round: 지도 도구(내 위치·산책 코스)는 동그랗게.
export function IconButton({
  icon,
  label,
  onPress,
  disabled = false,
  round = false,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  round?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      hitSlop={6}
      style={({ pressed }) => [styles.iconBtn, round && styles.iconRound, pressed && styles.iconPressed, disabled && styles.off]}>
      <Icon name={icon} />
    </Pressable>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

// 설정 목록의 한 줄: 왼쪽 이름, 오른쪽 지금 값 + 꺾쇠. 누르면 바꾸는 화면으로.
export function Row({ label, value, onPress, right }: { label: string; value?: string; onPress?: () => void; right?: ReactNode }) {
  const body = (
    <>
      <Text style={styles.rowLabel}>{label}</Text>
      {value !== undefined && (
        <Text style={styles.rowValue} numberOfLines={1}>
          {value}
        </Text>
      )}
      {right}
      {onPress && <Icon name={ICON.next} size={18} tint={color.inkSub} />}
    </>
  );
  if (!onPress) return <View style={styles.rowWrap}>{body}</View>;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={value ? `${label}, ${value}, 바꾸기` : `${label} 정하기`}
      style={({ pressed }) => [styles.rowWrap, pressed && styles.rowPressed]}>
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: { alignItems: 'center', justifyContent: 'center', borderRadius: radius.btn },
  lg: { height: 54, paddingHorizontal: 24, alignSelf: 'stretch' },
  md: { minHeight: space.tapMin, paddingHorizontal: 16 },
  primary: { backgroundColor: color.primary },
  tonal: { backgroundColor: color.skyLight },
  plain: { backgroundColor: 'transparent', paddingHorizontal: 8 },
  pressed: { opacity: 0.75 },
  off: { opacity: 0.45 },
  btnText: { ...type.label },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.btn,
    backgroundColor: color.surfaceCard,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.card,
  },
  iconRound: { width: 48, height: 48, borderRadius: 24 },
  iconPressed: { backgroundColor: color.surfaceSunk },
  card: { backgroundColor: color.surfaceCard, borderRadius: radius.card, padding: 16, gap: 8, ...shadow.card },
  rowWrap: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingHorizontal: 16 },
  rowPressed: { backgroundColor: color.surfaceSunk },
  rowLabel: { ...type.body, color: color.ink },
  rowValue: { ...type.body, color: color.inkSub, flex: 1, textAlign: 'right' },
});
