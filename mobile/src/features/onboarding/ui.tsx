// mobile/src/features/onboarding/ui.tsx
// 온보딩 단계들이 같이 쓰는 화면틀·버튼.
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '@/components/kit';
import { color, space } from '@/constants/tokens';

// onBack: 설정에서 다시 쓸 때만(온보딩은 앞으로만). 저장하지 않고 나가는 길.
export function StepScreen({ children, footer, onBack }: { children: ReactNode; footer?: ReactNode; onBack?: () => void }) {
  return (
    <SafeAreaView style={styles.screen}>
      {onBack && (
        <View style={styles.back}>
          <TextButton label="돌아가기" onPress={onBack} />
        </View>
      )}
      <View style={styles.body}>{children}</View>
      {footer && <View style={styles.footer}>{footer}</View>}
    </SafeAreaView>
  );
}

export function PrimaryButton({ label, onPress, disabled = false }: { label: string; onPress: () => void; disabled?: boolean }) {
  return <Button label={label} size="lg" onPress={onPress} disabled={disabled} />;
}

export function TextButton({ label, onPress }: { label: string; onPress: () => void }) {
  return <Button label={label} variant="plain" style={styles.text} onPress={onPress} />;
}

const styles = StyleSheet.create({
  back: { alignItems: 'flex-start', paddingHorizontal: space.gutter },
  screen: { flex: 1, backgroundColor: color.surface },
  body: { flex: 1, paddingHorizontal: space.gutter, alignItems: 'center', justifyContent: 'center', gap: 16 },
  footer: { paddingHorizontal: space.gutter, paddingBottom: space.section, gap: 8 },
  text: { alignSelf: 'center' },
});
