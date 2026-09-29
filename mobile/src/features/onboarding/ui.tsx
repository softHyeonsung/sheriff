// mobile/src/features/onboarding/ui.tsx
// 온보딩 단계들이 같이 쓰는 화면틀·버튼.
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { color, font, radius, space } from '@/constants/tokens';

export function StepScreen({ children, footer }: { children: ReactNode; footer?: ReactNode }) {
  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.body}>{children}</View>
      {footer && <View style={styles.footer}>{footer}</View>}
    </SafeAreaView>
  );
}

export function PrimaryButton({ label, onPress, disabled = false }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={[styles.primary, disabled && styles.disabled]}>
      <Text style={styles.primaryText}>{label}</Text>
    </Pressable>
  );
}

export function TextButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={styles.text} hitSlop={8}>
      <Text style={styles.textLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.surface },
  body: { flex: 1, paddingHorizontal: space.gutter, alignItems: 'center', justifyContent: 'center', gap: 16 },
  footer: { paddingHorizontal: space.gutter, paddingBottom: space.section, gap: 8 },
  primary: { height: 52, borderRadius: radius.btn, backgroundColor: color.primary, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.4 },
  primaryText: { fontFamily: font.semibold, fontSize: 16, color: color.onPrimary },
  text: { minHeight: space.tapMin, alignItems: 'center', justifyContent: 'center' },
  textLabel: { fontFamily: font.semibold, fontSize: 15, color: color.inkSub },
});
