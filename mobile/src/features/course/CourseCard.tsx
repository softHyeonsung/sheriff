// mobile/src/features/course/CourseCard.tsx
// 코스 카드: 고양이가 가보고 싶어하는 곳 목록. 줄마다 찜, 못 찾으면 찜 화면으로.
// 지도 아래 판 안에 놓인다(자기 자리·배경은 판이 정한다).
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/kit';
import { color, font, type } from '@/constants/tokens';
import { MSG } from '@/features/checkin/copy';
import { subject } from '@/features/map/nextStageHint';
import { isNetworkError } from '@/lib/networkError';
import { COURSE, fmtM } from './copy';
import type { Course, Stop } from './courseApi';

type Props = { catName: string; course: Course; onWish: (s: Stop) => Promise<boolean>; onFind: (s: Stop) => void; onClose: () => void };
type RowState = 'busy' | 'wished' | 'notFound';

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
      <View style={styles.head}>
        <View style={styles.grow}>
          <Text style={styles.title}>{subject(catName)} 가보고 싶어하는 곳</Text>
          {/* 자동차 길 거리는 걷는 거리와 크게 달라 쓰지 않는다: 구간 직선거리의 합. */}
          <Text style={styles.caption}>전체 {fmtM(course.stops.reduce((sum, s) => sum + s.legM, 0))}</Text>
        </View>
        <Button label="닫기" variant="plain" onPress={onClose} />
      </View>

      {course.stops.map((s, i) => (
        <View key={i} style={styles.item}>
          <View style={styles.rowLine}>
            <Text style={styles.num}>{i + 1}</Text>
            <View style={styles.grow}>
              <Text style={styles.name} numberOfLines={1}>
                {s.name}
              </Text>
              <Text style={styles.caption} numberOfLines={1}>
                {[s.address, fmtM(s.legM)].filter(Boolean).join(' · ')}
              </Text>
            </View>
            {/* about: 줄마다 같은 글자의 버튼이라, 읽어 주는 이름에는 어느 곳인지 붙인다. */}
            {rows[i] === 'wished' ? (
              <Text style={styles.done}>{COURSE.wished}</Text>
            ) : rows[i] === 'notFound' ? (
              <Button label={COURSE.find} about={s.name} variant="tonal" onPress={() => onFind(s)} />
            ) : (
              <Button label={COURSE.wish} about={s.name} variant="tonal" busy={rows[i] === 'busy'} onPress={() => wish(s, i)} />
            )}
          </View>
          {rows[i] === 'notFound' && <Text style={styles.caption}>{COURSE.notFound}</Text>}
        </View>
      ))}

      {course.routeLimited && <Text style={styles.caption}>{COURSE.limited}</Text>}
      {note && <Text style={styles.body}>{note}</Text>}
      <Text style={styles.source}>{COURSE.source}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: 12 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { ...type.subtitle, color: color.ink },
  item: { gap: 4 },
  rowLine: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  // 지도 위 번호 핀과 같은 모양·색: 목록과 지도가 한눈에 이어진다.
  num: { width: 24, height: 24, borderRadius: 12, overflow: 'hidden', textAlign: 'center', backgroundColor: color.surfaceCard, borderWidth: 2, borderColor: color.sky, color: color.skyInk, lineHeight: 20, fontFamily: font.semibold, fontSize: 13 },
  grow: { flex: 1 },
  name: { ...type.bodyStrong, color: color.ink },
  caption: { ...type.caption, color: color.inkSub },
  done: { ...type.label, color: color.natureInk, paddingHorizontal: 8 },
  body: { ...type.body, color: color.ink },
  source: { ...type.caption, fontSize: 11, lineHeight: 14, color: color.inkSub },
});
