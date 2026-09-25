// mobile/src/features/auth/TermsSheet.tsx
import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';

import { color, font, radius, space, type } from '@/constants/tokens';
import { TERMS_LINKS } from '@/constants/terms';

const ITEMS = [
  { key: 'age', label: '만 14세 이상이에요' },
  { key: 'service', label: '[필수] 이용약관', url: TERMS_LINKS.service },
  { key: 'privacy', label: '[필수] 개인정보 수집·이용', url: TERMS_LINKS.privacy },
  { key: 'location', label: '[필수] 위치기반서비스 이용약관', url: TERMS_LINKS.location },
] as const;

type Key = (typeof ITEMS)[number]['key'];

function Checkbox({ label, checked, onPress, strong }: { label: string; checked: boolean; onPress: () => void; strong?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked }}
      style={styles.row}>
      <View style={[styles.box, checked && styles.boxOn]}>{checked && <Text style={styles.tick}>✓</Text>}</View>
      <Text style={[styles.label, strong && styles.labelStrong]}>{label}</Text>
    </Pressable>
  );
}

export function TermsSheet({
  visible,
  busy,
  failed,
  onAgree,
  onClose,
}: {
  visible: boolean;
  busy: boolean;
  failed: boolean;
  onAgree: () => void;
  onClose: () => void;
}) {
  const [checked, setChecked] = useState<Record<Key, boolean>>({ age: false, service: false, privacy: false, location: false });
  const all = ITEMS.every((i) => checked[i.key]);
  const setAll = (v: boolean) => setChecked({ age: v, service: v, privacy: v, location: v });

  const close = () => {
    setAll(false);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close} accessibilityRole="button" accessibilityLabel="닫기" />
      <SafeAreaView edges={['bottom']} style={styles.sheet}>
        <Text style={styles.title} accessibilityRole="header">
          시작하기 전에 확인해 주세요
        </Text>

        <Checkbox label="모두 동의할게요" checked={all} onPress={() => setAll(!all)} strong />
        <View style={styles.divider} />

        {ITEMS.map((item) => (
          <View key={item.key} style={styles.itemRow}>
            <Checkbox
              label={item.label}
              checked={checked[item.key]}
              onPress={() => setChecked((c) => ({ ...c, [item.key]: !c[item.key] }))}
            />
            {'url' in item && (
              <Pressable
                onPress={() => WebBrowser.openBrowserAsync(item.url)}
                accessibilityRole="link"
                accessibilityLabel={`${item.label} 보기`}
                hitSlop={8}
                style={styles.view}>
                <Text style={styles.viewText}>보기</Text>
              </Pressable>
            )}
          </View>
        ))}

        <Pressable
          onPress={onAgree}
          disabled={!all || busy}
          accessibilityRole="button"
          accessibilityLabel="동의하고 시작하기"
          accessibilityState={{ disabled: !all || busy, busy }}
          style={[styles.cta, (!all || busy) && styles.ctaOff]}>
          {busy ? (
            <ActivityIndicator color={color.onPrimary} />
          ) : (
            <Text style={[styles.ctaText, !all && styles.ctaTextOff]}>동의하고 시작하기</Text>
          )}
        </Pressable>

        <Text style={styles.error} accessibilityLiveRegion="polite">
          {failed ? '앗, 잠깐 문제가 생겼어요. 다시 해볼까요?' : ' '}
        </Text>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(74, 61, 48, 0.25)' }, // color.ink @ 25%
  sheet: {
    backgroundColor: color.surfaceCard,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    paddingHorizontal: space.gutter,
    paddingTop: space.section,
  },
  title: { ...type.title, color: color.ink, marginBottom: 16 },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: space.tapMin, flex: 1, gap: 12 },
  itemRow: { flexDirection: 'row', alignItems: 'center' },
  box: {
    width: 24,
    height: 24,
    borderRadius: radius.min,
    borderWidth: 2,
    borderColor: color.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxOn: { backgroundColor: color.primary, borderColor: color.primary },
  tick: { fontFamily: font.bold, fontSize: 14, lineHeight: 16, color: color.onPrimary },
  label: { ...type.body, color: color.ink, flexShrink: 1 },
  labelStrong: { fontFamily: font.semibold },
  divider: { height: 1, backgroundColor: color.line, marginVertical: 8 },
  view: { minHeight: space.tapMin, justifyContent: 'center', paddingLeft: 12 },
  viewText: { ...type.caption, color: color.inkSub, textDecorationLine: 'underline' },
  cta: {
    marginTop: 20,
    height: 52,
    borderRadius: radius.btn,
    backgroundColor: color.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaOff: { backgroundColor: color.line },
  ctaText: { fontFamily: font.semibold, fontSize: 16, color: color.onPrimary },
  ctaTextOff: { color: color.inkSub },
  error: { ...type.caption, color: color.ink, marginTop: 12, marginBottom: 8, minHeight: 18 },
});
