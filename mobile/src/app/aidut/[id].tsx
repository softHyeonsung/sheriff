// mobile/src/app/aidut/[id].tsx
// 아지트 상세 = 고양이의 추억. 헤더는 지도 저장본에서(오프라인에서도 보이게), 사진은 서버에서.
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { color, font, radius, space, type } from '@/constants/tokens';
import { getFreshFix } from '@/features/checkin/checkinApi';
import { messageFor } from '@/features/checkin/copy';
import { CheckinError } from '@/features/checkin/errors';
import { metersBetween, OFFLINE_ACCURACY_MAX_M, OFFLINE_RADIUS_M } from '@/features/checkin/offline';
import { LOCATE_TIMEOUT_MS, within } from '@/features/checkin/useCheckin';
import { readMapCache } from '@/features/map/mapCache';
import { nextStageHint } from '@/features/map/nextStageHint';
import { useHideoutPlaces } from '@/features/map/useHideoutPlaces';
import type { GradeThresholds, MyHideout } from '@/features/map/useMyHideouts';
import { useMyLocation } from '@/features/map/useMyLocation';
import type { MemoryPhoto } from '@/features/memories/memoriesApi';
import { type FixResult, MemoryButton } from '@/features/memories/MemoryButton';
import { useMemories } from '@/features/memories/useMemories';
import { GRADE_LABEL } from '@/map/grades';
import { markerFor } from '@/map/markers';

type Info = { hideout: MyHideout; thresholds: GradeThresholds | null } | 'missing' | null;

function Pill({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={styles.pill} hitSlop={8}>
      <Text style={styles.pillText}>{label}</Text>
    </Pressable>
  );
}

export default function HideoutDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [info, setInfo] = useState<Info>(null);
  const [large, setLarge] = useState<MemoryPhoto | null>(null);
  const memories = useMemories(id);
  const visited = useHideoutPlaces(id);
  const { location } = useMyLocation();

  useFocusEffect(
    useCallback(() => {
      readMapCache()
        .then((c) => {
          const hideout = c.hideouts.find((h) => h.id === id);
          setInfo(hideout ? { hideout, thresholds: c.thresholds } : 'missing');
        })
        .catch(() => setInfo('missing'));
    }, [id]),
  );

  if (info === null) {
    return (
      <SafeAreaView style={[styles.screen, styles.center]}>
        <ActivityIndicator color={color.primary} />
      </SafeAreaView>
    );
  }
  if (info === 'missing') {
    return (
      <SafeAreaView style={[styles.screen, styles.center]}>
        <Text style={styles.body}>이 아지트를 찾지 못했어요.</Text>
        <Pill label="돌아가기" onPress={() => router.back()} />
      </SafeAreaView>
    );
  }

  const { hideout: h, thresholds } = info;
  const near = !!location && metersBetween(location, h) <= OFFLINE_RADIUS_M;
  const { photos, pending, status } = memories;
  // 한 곳뿐이고 아지트 이름과 같으면 헤더와 같은 말이라 숨긴다.
  const showPlaces = visited.places.length > 1 || (visited.places.length === 1 && visited.places[0].name !== h.name);

  // 지도 점은 오래됐을 수 있다: 새로 잡은 위치로 서버와 같은 기준을 먼저 본다(거절돼 사진이 사라지지 않게).
  const getFix = async (): Promise<FixResult> => {
    let fix: Awaited<ReturnType<typeof getFreshFix>>;
    try {
      fix = await within(getFreshFix(), LOCATE_TIMEOUT_MS);
    } catch (e) {
      if (e instanceof CheckinError && e.code === 'location_off') return { problem: messageFor(e) };
      throw e;
    }
    if (fix === 'denied') return fix;
    if (fix.accuracy > OFFLINE_ACCURACY_MAX_M) return { problem: '위치가 흐려요. 조금 뒤에 다시 해볼까요?' };
    if (metersBetween(fix, h) > OFFLINE_RADIUS_M) return { problem: '조금만 더 가까이 가면 순간을 남길 수 있어요.' };
    return fix;
  };

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <Pill label="돌아가기" onPress={() => router.back()} />
        <View style={styles.header}>
          <Image source={{ uri: markerFor(h.grade).uri }} style={styles.art} />
          <Text style={styles.title} accessibilityRole="header">
            {h.name}
          </Text>
          <Text style={styles.caption}>{GRADE_LABEL[h.grade]}</Text>
          <Text style={styles.body}>지금까지 {h.footprintCount}번 다녀왔어요</Text>
          {thresholds && <Text style={styles.caption}>{nextStageHint(h.footprintCount, thresholds)}</Text>}
        </View>

        {visited.status === 'offline' && <Text style={[styles.caption, styles.centerText]}>연결되면 간 곳을 보여드릴게요.</Text>}
        {visited.status === 'error' && <Text style={[styles.caption, styles.centerText]}>간 곳을 불러오지 못했어요.</Text>}
        {showPlaces && (
          <View style={styles.places}>
            <Text style={styles.section}>여기서 간 곳</Text>
            {visited.places.map((p) => (
              <Text key={p.placeId ? `id:${p.placeId}` : `name:${p.name}`} style={styles.body}>
                {p.name} · {p.visits}번
              </Text>
            ))}
          </View>
        )}

        <MemoryButton
          aidutId={h.id}
          getFix={getFix}
          disabled={!near}
          onUploaded={memories.refresh}
        />
        {!near && <Text style={[styles.caption, styles.centerText]}>가까이 가면 순간을 남길 수 있어요.</Text>}

        <Text style={styles.section}>여기서의 순간들</Text>
        {status === 'offline' && <Text style={styles.body}>연결되면 순간들을 보여드릴게요.</Text>}
        {status === 'error' && (
          <View style={styles.row}>
            <Text style={styles.body}>순간들을 불러오지 못했어요.</Text>
            <Pill label="다시 시도" onPress={memories.refresh} />
          </View>
        )}
        {status === 'ready' && photos.length === 0 && pending === 0 && (
          <Text style={styles.body}>아직 남긴 순간이 없어요. 다음에 오면 하나 남겨볼까요?</Text>
        )}
        <View style={styles.grid}>
          {Array.from({ length: pending }, (_, i) => (
            <View key={`pending-${i}`} style={[styles.tile, styles.blank]}>
              <Text style={styles.caption}>올라가는 중</Text>
            </View>
          ))}
          {photos.map((p, i) => (
            <Pressable
              key={p.id}
              onPress={() => p.url && setLarge(p)}
              accessibilityRole="button"
              accessibilityLabel={`사진 ${i + 1} 크게 보기`}
              style={styles.tile}>
              {p.url ? <Image source={{ uri: p.url }} style={styles.fill} /> : <View style={[styles.fill, styles.blank]} />}
            </Pressable>
          ))}
        </View>
      </ScrollView>

      {large && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setLarge(null)}>
          <View style={styles.scrim}>
            <Image testID="photo-large" source={{ uri: large.url ?? undefined }} style={styles.large} resizeMode="contain" />
            {!!large.placeName && <Text style={styles.onScrim}>{large.placeName}에서</Text>}
            <Pill label="닫기" onPress={() => setLarge(null)} />
          </View>
        </Modal>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.surface },
  center: { alignItems: 'center', justifyContent: 'center', gap: 16, padding: space.gutter },
  content: { padding: space.gutter, gap: 16 },
  header: { alignItems: 'center', gap: 4 },
  art: { width: 88, height: 88 },
  title: { ...type.subtitle, color: color.ink },
  section: { ...type.subtitle, color: color.ink, marginTop: 8 },
  body: { ...type.body, color: color.ink },
  caption: { ...type.caption, color: color.inkSub },
  centerText: { textAlign: 'center' },
  row: { gap: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tile: { width: '32%', aspectRatio: 1, borderRadius: radius.card, overflow: 'hidden' },
  fill: { width: '100%', height: '100%' },
  blank: { backgroundColor: color.line, alignItems: 'center', justifyContent: 'center' },
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', alignItems: 'center', justifyContent: 'center', gap: 16, padding: space.gutter },
  large: { width: '100%', height: '75%' },
  places: { gap: 4 },
  onScrim: { ...type.body, color: '#FFFFFF' },
  pill: {
    alignSelf: 'flex-start',
    minHeight: space.tapMin,
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderRadius: radius.pill,
    backgroundColor: color.primary,
  },
  pillText: { fontFamily: font.semibold, fontSize: 15, color: color.onPrimary },
});
