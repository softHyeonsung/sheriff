// mobile/src/features/course/CourseCard.tsx
// 코스 카드: 고양이가 가보고 싶어하는 곳 목록. 줄마다 찜, 못 찾으면 찜 화면으로.
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { color, font, radius, space, type } from '@/constants/tokens';
import { MSG } from '@/features/checkin/copy';
import { subject } from '@/features/map/nextStageHint';
import { isNetworkError } from '@/lib/networkError';
import { COURSE, fmtM } from './copy';
import type { Course, Stop } from './courseApi';

type Props = { catName: string; course: Course; onWish: (s: Stop) => Promise<boolean>; onFind: (s: Stop) => void; onClose: () => void };
type RowState = 'busy' | 'wished' | 'notFound';

function Btn({ label, onPress, disabled = false }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={[styles.btn, disabled && styles.btnBusy]}
      hitSlop={8}>
      <Text style={styles.btnText}>{label}</Text>
    </Pressable>
  );
}

export function CourseCard({ catName, course, onWish, onFind, onClose }: Props) {
  const [rows, setRows] = useState<Record<number, RowState | undefined>>({});
  const [note, setNote] = useState<string | null>(null);
  const setRow = (i: number, s: RowState | undefined) => setRows((r) => ({ ...r, [i]: s }));

  const wish = async (stop: Stop, i: number) => {
    setNote(null);
    setRow(i, 'busy');
    try {
      setRow(i, (await onWish(stop)) ? 'wished' : 'notFound');
    } catch (e) {
      if (!isNetworkError(e)) console.error('코스 찜 실패', e);
      setRow(i, undefined);
      setNote(isNetworkError(e) ? MSG.offline : MSG.unknown);
    }
  };

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{subject(catName)} 가보고 싶대요</Text>
      {course.stops.map((s, i) => (
        <View key={i} style={styles.item}>
          <View style={styles.rowLine}>
            <Text style={styles.num}>{i + 1}</Text>
            <View style={styles.grow}>
              <Text style={styles.name}>{s.name}</Text>
              <Text style={styles.caption}>{[s.address, fmtM(s.legM)].filter(Boolean).join(' · ')}</Text>
            </View>
            {rows[i] === 'wished' ? (
              <Text style={styles.caption}>{COURSE.wished}</Text>
            ) : rows[i] === 'notFound' ? (
              <Btn label={COURSE.find} onPress={() => onFind(s)} />
            ) : (
              <Btn label={COURSE.wish} onPress={() => wish(s, i)} disabled={rows[i] === 'busy'} />
            )}
          </View>
          {rows[i] === 'notFound' && <Text style={styles.caption}>{COURSE.notFound}</Text>}
        </View>
      ))}
      {/* 자동차 길 거리(course.distanceM)는 걷는 거리와 크게 달라 쓰지 않는다: 구간 직선거리의 합. */}
      <Text style={styles.body}>전체 {fmtM(course.stops.reduce((sum, s) => sum + s.legM, 0))}</Text>
      {course.routeLimited && <Text style={styles.body}>{COURSE.limited}</Text>}
      {note && <Text style={styles.body}>{note}</Text>}
      <View style={styles.rowLine}>
        <Text style={[styles.caption, styles.grow]}>{COURSE.source}</Text>
        <Btn label="닫기" onPress={onClose} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    position: 'absolute',
    left: space.gutter,
    right: space.gutter,
    bottom: 96,
    gap: 8,
    padding: 16,
    borderRadius: radius.sheet,
    backgroundColor: color.surfaceCard,
    borderWidth: 1,
    borderColor: color.line,
  },
  title: { ...type.subtitle, color: color.ink },
  item: { gap: 2 },
  rowLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  num: { width: 24, height: 24, borderRadius: 12, overflow: 'hidden', textAlign: 'center', lineHeight: 24, backgroundColor: '#F59E0B', color: '#FFFFFF', fontFamily: font.semibold, fontSize: 14 },
  grow: { flex: 1 },
  name: { ...type.body, color: color.ink },
  caption: { ...type.caption, color: color.inkSub },
  body: { ...type.body, color: color.ink },
  btn: { minHeight: space.tapMin, justifyContent: 'center', paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: color.primary },
  btnBusy: { opacity: 0.6 },
  btnText: { fontFamily: font.semibold, fontSize: 14, color: color.onPrimary },
});
