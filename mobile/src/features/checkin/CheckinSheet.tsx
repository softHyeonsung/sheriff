// mobile/src/features/checkin/CheckinSheet.tsx
import { useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { color, font, radius, space, type } from '@/constants/tokens';
import { markerFor } from '@/map/markers';
import { targetFor } from './candidates';
import type { CheckinTarget } from './checkinApi';
import type { Choosing } from './useCheckin';

type Props = {
  state: Choosing;
  footprintsById: Record<string, number>;
  onChoose: (t: CheckinTarget) => void;
  onClose: () => void;
};

function Row({ title, sub, onPress, disabled }: { title: string; sub: string; onPress: () => void; disabled: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled }}
      style={styles.row}>
      <Text style={styles.rowTitle}>{title}</Text>
      <Text style={styles.caption}>{sub}</Text>
    </Pressable>
  );
}

export function CheckinSheet({ state, footprintsById, onChoose, onClose }: Props) {
  const first = state.candidates[0];
  const [view, setView] = useState<'confirm' | 'list'>(first ? 'confirm' : 'list');
  // While a footprint is being saved the sheet can't be dismissed — otherwise the
  // celebration would pop up after the user thought they'd cancelled.
  const close = () => {
    if (!state.busy) onClose();
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={close}>
      {/* 배경을 눌러도 닫히지만, 읽어 주는 닫기는 아래 보이는 버튼 하나만. */}
      <Pressable style={styles.backdrop} onPress={close} accessible={false} importantForAccessibility="no" />
      <SafeAreaView edges={['bottom']} style={styles.sheet}>
        {state.offline && <Text style={styles.caption}>연결이 끊겨 있어서 내 아지트만 보여드려요</Text>}
        {view === 'confirm' && first ? (
          <View style={styles.confirm}>
            {first.kind === 'mine' && <Image source={{ uri: markerFor(first.grade).uri }} style={styles.art} />}
            <Text style={styles.title} accessibilityRole="header">
              여기 {first.name} 맞나요?
            </Text>
            {first.kind === 'mine' && footprintsById[first.aidutId] !== undefined && (
              <Text style={styles.caption}>지금까지 {footprintsById[first.aidutId]}번 다녀왔어요</Text>
            )}
            <Pressable
              onPress={() => onChoose(targetFor(first))}
              disabled={state.busy}
              accessibilityRole="button"
              accessibilityLabel="발자국 남기기"
              accessibilityState={{ disabled: state.busy, busy: state.busy }}
              style={[styles.cta, state.busy && styles.ctaBusy]}>
              {state.busy ? <ActivityIndicator color={color.onPrimary} /> : <Text style={styles.ctaText}>발자국 남기기</Text>}
            </Pressable>
            <Pressable
              onPress={() => setView('list')}
              disabled={state.busy}
              accessibilityRole="button"
              accessibilityLabel="다른 곳이에요"
              accessibilityState={{ disabled: state.busy }}
              style={styles.secondary}>
              <Text style={styles.secondaryText}>다른 곳이에요</Text>
            </Pressable>
          </View>
        ) : (
          <ScrollView style={styles.list}>
            {state.candidates.map((c) => (
              <Row
                key={c.kind === 'mine' ? c.aidutId : c.placeId}
                title={c.name}
                sub={`약 ${Math.round(c.distanceM)}m`}
                disabled={state.busy}
                onPress={() => onChoose(targetFor(c))}
              />
            ))}
            <Row
              title="여기에 새로 만들기"
              sub={state.hereAddress ?? '이름 없는 골목'}
              disabled={state.busy}
              onPress={() => onChoose({ kind: 'new', roadAddress: state.hereAddress })}
            />
          </ScrollView>
        )}
        <Text style={styles.error} accessibilityLiveRegion="polite">
          {state.error ?? ' '}
        </Text>
        <Pressable
          onPress={close}
          disabled={state.busy}
          accessibilityRole="button"
          accessibilityLabel="닫기"
          accessibilityState={{ disabled: state.busy }}
          style={styles.secondary}>
          <Text style={[styles.secondaryText, styles.closeText]}>닫기</Text>
        </Pressable>
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
  confirm: { alignItems: 'center', gap: 8 },
  art: { width: 72, height: 72 },
  title: { ...type.title, color: color.ink, textAlign: 'center' },
  list: { maxHeight: 360 },
  row: { minHeight: space.tapMin, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: color.line },
  rowTitle: { ...type.body, color: color.ink },
  caption: { ...type.caption, color: color.inkSub },
  cta: {
    alignSelf: 'stretch',
    marginTop: 12,
    height: 52,
    borderRadius: radius.btn,
    backgroundColor: color.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaBusy: { opacity: 0.7 },
  ctaText: { fontFamily: font.semibold, fontSize: 16, color: color.onPrimary },
  secondary: { minHeight: space.tapMin, justifyContent: 'center' },
  secondaryText: { ...type.body, color: color.inkSub, textDecorationLine: 'underline' },
  closeText: { textAlign: 'center' },
  error: { ...type.caption, color: color.ink, marginTop: 12, marginBottom: 8, minHeight: 18, textAlign: 'center' },
});
