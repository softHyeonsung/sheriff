// mobile/src/features/memories/MemoryButton.tsx
// [순간 남기기 📷]: 찍기/고르기 → 위치 → 대기열에 챙기고 바로 올려 본다.
import { useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { color, font, radius, space, type } from '@/constants/tokens';
import type { Fix } from '@/features/checkin/checkinApi';
import { MSG } from '@/features/checkin/copy';
import { keepMemory } from './memoryQueue';
import { flushMemoriesNow } from './memoriesApi';
import { pickMemoryPhoto } from './photo';

export const MEMORY_MSG = {
  kept: '순간을 남겼어요 📷',
  denied: '사진을 쓰려면 권한이 필요해요.',
  failed: '사진을 준비하지 못했어요. 다시 해볼까요?',
};

type Props = {
  aidutId: string;
  getFix: () => Promise<Fix | 'denied'>;
  disabled?: boolean;
  onUploaded?: () => void;
};

export function MemoryButton({ aidutId, getFix, disabled = false, onUploaded }: Props) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const off = disabled || busy;

  const run = async (source: 'camera' | 'library') => {
    setBusy(true);
    setNote(null);
    try {
      const picked = await pickMemoryPhoto(source);
      if (picked.status === 'canceled') return;
      if (picked.status === 'denied') {
        setNote(MEMORY_MSG.denied);
        return;
      }
      const fix = await getFix(); // 찍은 뒤의 위치가 사진에 더 가깝다
      if (fix === 'denied') {
        setNote(MSG.denied);
        return;
      }
      await keepMemory({ id: picked.id, aidutId, fix, localUri: picked.uri });
      setNote(MEMORY_MSG.kept);
      flushMemoriesNow()
        .then((r) => {
          if (r.attached.length) onUploaded?.();
        })
        .catch((e) => console.warn('순간 올리기 실패', e));
    } catch (e) {
      console.warn('순간 준비 실패', e);
      setNote(MEMORY_MSG.failed);
    } finally {
      setBusy(false);
    }
  };

  const open = () =>
    Alert.alert('순간 남기기 📷', undefined, [
      { text: '사진 찍기', onPress: () => run('camera') },
      { text: '앨범에서 고르기', onPress: () => run('library') },
      { text: '닫기', style: 'cancel' },
    ]);

  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={open}
        disabled={off}
        accessibilityRole="button"
        accessibilityLabel="순간 남기기 📷"
        accessibilityState={{ disabled: off }}
        style={[styles.btn, off && styles.off]}>
        <Text style={styles.btnText}>순간 남기기 📷</Text>
      </Pressable>
      {note && (
        <Text style={styles.note} accessibilityLiveRegion="polite">
          {note}
        </Text>
      )}
      {note === MEMORY_MSG.denied && (
        <Pressable onPress={() => Linking.openSettings()} accessibilityRole="button" accessibilityLabel="설정 열기" hitSlop={8}>
          <Text style={styles.link}>설정 열기</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 6 },
  btn: {
    minHeight: space.tapMin,
    paddingHorizontal: 20,
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.primary,
    backgroundColor: color.surfaceCard,
  },
  off: { opacity: 0.5 },
  btnText: { fontFamily: font.semibold, fontSize: 15, color: color.primary },
  note: { ...type.caption, color: color.inkSub, textAlign: 'center' },
  link: { ...type.caption, color: color.primary, textDecorationLine: 'underline' },
});
