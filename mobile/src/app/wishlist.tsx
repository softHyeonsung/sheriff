// mobile/src/app/wishlist.tsx
// 찜 화면: 위는 검색(이름·붙여넣은 링크·공유된 글), 아래는 고양이가 찜한 곳.
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { color, font, radius, space, type } from '@/constants/tokens';
import { MSG } from '@/features/checkin/copy';
import { useMyLocation } from '@/features/map/useMyLocation';
import { looksShared } from '@/features/wishlist/sharedText';
import { useWishes } from '@/features/wishlist/useWishes';
import { parseShared, type Place, searchPlaces } from '@/features/wishlist/wishlistApi';
import { isNetworkError } from '@/lib/networkError';

function Pill({ label, onPress, quiet = false }: { label: string; onPress: () => void; quiet?: boolean }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={[styles.pill, quiet && styles.quiet]} hitSlop={8}>
      <Text style={[styles.pillText, quiet && styles.quietText]}>{label}</Text>
    </Pressable>
  );
}

export default function WishlistScreen() {
  const { shared } = useLocalSearchParams<{ shared?: string }>();
  const { location } = useMyLocation();
  const { wishes, add, remove } = useWishes();
  const [query, setQuery] = useState(shared ?? '');
  const [results, setResults] = useState<Place[] | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const near = location ? { lat: location.lat, lng: location.lng } : null;
  const wished = new Set(wishes.map((w) => w.placeId));

  const showParsed = (r: { places: Place[]; query: string | null }) => {
    setResults(r.places);
    if (r.query) setQuery(r.query);
    if (r.places.length === 0) setNote('장소를 찾지 못했어요. 이름으로 검색해 볼까요?');
  };
  const showError = (e: unknown) => {
    if (!isNetworkError(e)) console.error('장소 찾기 실패', e);
    setNote(isNetworkError(e) ? MSG.offline : MSG.unknown);
  };

  const run = async (text: string) => {
    const q = text.trim();
    if (!q || busy) return;
    setBusy(true);
    setNote(null);
    try {
      if (looksShared(q)) {
        showParsed(await parseShared(q, near));
      } else {
        const places = await searchPlaces(q, near);
        setResults(places);
        if (places.length === 0) setNote('음, 못 찾았어요. 다른 이름으로 찾아볼까요?');
      }
    } catch (e) {
      showError(e);
    } finally {
      setBusy(false);
    }
  };

  // 공유로 열렸으면 바로 해석(들어온 공유 글 하나에 한 번). 결과가 온 뒤에만 화면을 바꾼다.
  useEffect(() => {
    if (!shared) return;
    let alive = true;
    parseShared(shared, near).then(
      (r) => alive && showParsed(r),
      (e) => alive && showError(e),
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 위치가 바뀌어도 다시 해석하지 않는다
  }, [shared]);

  const toggle = async (p: Place) => {
    setNote(null);
    try {
      if (wished.has(p.placeId)) await remove(p.placeId);
      else await add(p);
    } catch (e) {
      console.error('찜 바꾸기 실패', e);
      setNote(isNetworkError(e) ? MSG.offline : MSG.unknown);
    }
  };

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Pill label="돌아가기" onPress={() => router.back()} quiet />
        <View style={styles.row}>
          <TextInput
            value={query}
            onChangeText={setQuery}
            accessibilityLabel="장소 검색"
            placeholder="가게 이름이나 공유 링크"
            placeholderTextColor={color.inkSub}
            style={styles.input}
            multiline={query.includes('\n')}
            returnKeyType="search"
            onSubmitEditing={() => run(query)}
          />
          <Pill label="찾기" onPress={() => run(query)} />
        </View>
        {note && <Text style={styles.body}>{note}</Text>}
        {results?.map((p) => (
          <View key={p.placeId} style={styles.item}>
            <View style={styles.grow}>
              <Text style={styles.name}>{p.name}</Text>
              <Text style={styles.caption}>
                {[p.roadAddress, p.distanceM != null ? `약 ${Math.round(p.distanceM)}m` : null].filter(Boolean).join(' · ')}
              </Text>
            </View>
            <Pill label={wished.has(p.placeId) ? '찜 해제' : '⭐ 찜'} onPress={() => toggle(p)} quiet={wished.has(p.placeId)} />
          </View>
        ))}

        <Text style={styles.section}>고양이가 찜한 곳</Text>
        {wishes.length === 0 && <Text style={styles.body}>가고 싶은 곳이 있나요? 검색해서 찜해두면 지도에 표시돼요.</Text>}
        {wishes.map((w) => (
          <View key={w.placeId} style={styles.item}>
            <View style={styles.grow}>
              <Text style={styles.name}>{w.name}</Text>
              {w.roadAddress && <Text style={styles.caption}>{w.roadAddress}</Text>}
            </View>
            {w.achievedAt && <Text style={styles.caption}>달성 ✓</Text>}
            <Pill label="찜 해제" onPress={() => toggle({ ...w, distanceM: null })} quiet />
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.surface },
  content: { padding: space.gutter, gap: 12 },
  row: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  input: {
    flex: 1,
    minHeight: 48,
    borderRadius: radius.btn,
    borderWidth: 1,
    borderColor: color.line,
    backgroundColor: color.surfaceCard,
    paddingHorizontal: 12,
    fontFamily: font.regular,
    fontSize: 16,
    color: color.ink,
  },
  item: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  grow: { flex: 1 },
  name: { ...type.body, color: color.ink },
  caption: { ...type.caption, color: color.inkSub },
  body: { ...type.body, color: color.ink },
  section: { ...type.subtitle, color: color.ink, marginTop: 12 },
  pill: {
    minHeight: space.tapMin,
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    backgroundColor: color.primary,
  },
  pillText: { fontFamily: font.semibold, fontSize: 14, color: color.onPrimary },
  quiet: { alignSelf: 'flex-start', backgroundColor: color.surfaceCard, borderWidth: 1, borderColor: color.line },
  quietText: { color: color.ink },
});
