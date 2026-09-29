// mobile/src/app/(tabs)/index.tsx
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { color, font, radius, space, type } from '@/constants/tokens';
import { ArrivalOffer } from '@/features/arrival/ArrivalOffer';
import { answerArrivalOffer, shouldOfferArrival } from '@/features/arrival/register';
import { useArrivalTap } from '@/features/arrival/useArrivalTap';
import { Celebration } from '@/features/checkin/Celebration';
import { CheckinSheet } from '@/features/checkin/CheckinSheet';
import { useCheckin } from '@/features/checkin/useCheckin';
import { useCheckinQueue } from '@/features/checkin/useCheckinQueue';
import { nextStageHint } from '@/features/map/nextStageHint';
import { useMyHideouts } from '@/features/map/useMyHideouts';
import { useMyLocation } from '@/features/map/useMyLocation';
import { pickCatLine } from '@/features/territory/catLine';
import { DongBadge } from '@/features/territory/DongBadge';
import { useDongAt } from '@/features/territory/useDongAt';
import { useMyFog } from '@/features/territory/useMyFog';
import { GRADE_LABEL } from '@/map/grades';
import { MapBridge, type MapBridgeHandle } from '@/map/MapBridge';
import { markerFor } from '@/map/markers';
import { useMeStore } from '@/stores/meStore';

const CITY_HALL = { lat: 37.5665, lng: 126.978 };

function Pill({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={styles.pill} hitSlop={8}>
      <Text style={styles.pillText}>{label}</Text>
    </Pressable>
  );
}

export default function MapScreen() {
  const { hideouts, thresholds, status, retry } = useMyHideouts();
  const { location, permission } = useMyLocation();
  const checkin = useCheckin();
  const fog = useMyFog();
  const dongAt = useDongAt();
  const offline = status === 'offline';
  const { refresh: refreshFog } = fog;
  const { refresh: refreshDong } = dongAt;
  // 챙겨둔 발자국이 올라가면 지도를 새로 불러온다(마커·안개·동).
  const queue = useCheckinQueue(
    useCallback(() => {
      retry();
      refreshFog();
      refreshDong();
    }, [retry, refreshFog, refreshDong]),
  );
  const { refresh: refreshQueue } = queue;
  useEffect(() => {
    if (checkin.state.name === 'queued') refreshQueue();
  }, [checkin.state.name, refreshQueue]);
  const catTaps = useRef(0);
  const catColor = useMeStore((s) => s.me?.catColor) ?? 'cheese';
  const footprintsById = useMemo(() => Object.fromEntries(hideouts.map((h) => [h.id, h.footprintCount])), [hideouts]);
  const locating = checkin.state.name === 'locating';
  const bridge = useRef<MapBridgeHandle>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mapFailed, setMapFailed] = useState(false);
  const [mapKey, setMapKey] = useState(0);
  // What the map was last centered on. A ref, not state: updating it must not re-render.
  const centeredOn = useRef<'none' | 'hideout' | 'me'>('none');
  const [arrivalOffer, setArrivalOffer] = useState(false);
  const celebrated = checkin.state.name === 'celebrating' ? checkin.state.result : null;
  // 직접 남긴 발자국이 먼저. 올라간 발자국 축하는 체크인이 쉬고 있을 때 차례로.
  const synced = !celebrated && checkin.state.name === 'idle' ? (queue.celebrations[0] ?? null) : null;
  const shown = celebrated ?? synced;

  // 도착 알림을 누르고 들어오면 바로 체크인. 가까운 내 아지트가 첫 후보로 나온다.
  // 프로필 탭에 있었어도 지도 탭으로 데려온다(이 화면은 탭 뒤에서도 살아 있다).
  const { start } = checkin;
  useArrivalTap(
    useCallback(() => {
      router.navigate('/');
      setSelectedId(null);
      start();
    }, [start]),
  );

  // A selected hideout that vanished on refresh closes the card instead of rendering a broken one.
  const selected = hideouts.find((h) => h.id === selectedId) ?? null;

  // Center on me once I'm located; until then (or if location is denied) on my first hideout.
  // The first fix wins over the hideout fallback exactly once — after that it's the user's map.
  // mapKey: a remounted map (after 다시 시도) starts back at the default and needs centering again.
  useEffect(() => {
    if (!bridge.current || centeredOn.current === 'me') return;
    if (location) {
      bridge.current.panTo(location.lat, location.lng);
      centeredOn.current = 'me';
    } else if (centeredOn.current === 'none' && hideouts[0]) {
      bridge.current.panTo(hideouts[0].lat, hideouts[0].lng);
      centeredOn.current = 'hideout';
    }
  }, [location, hideouts, mapKey]);

  // Same array across unrelated re-renders (marker taps, location ticks), so the map doesn't
  // tear down and rebuild every marker each time.
  const pins = useMemo(() => hideouts.map(({ id, lat, lng, grade }) => ({ id, lat, lng, grade })), [hideouts]);

  if (mapFailed) {
    return (
      <SafeAreaView style={[styles.screen, styles.centerBox]}>
        <Text style={styles.body}>지도를 불러오지 못했어요. 다시 해볼까요?</Text>
        <Pill
          label="다시 시도"
          onPress={() => {
            setMapFailed(false);
            centeredOn.current = 'none';
            setMapKey((k) => k + 1);
          }}
        />
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.screen}>
      <MapBridge
        key={mapKey}
        ref={bridge}
        hideouts={pins}
        myLocation={location}
        center={CITY_HALL}
        onHideoutTap={setSelectedId}
        fog={fog.cells}
        onIdle={dongAt.onIdle}
        catColor={catColor}
        onCatTap={() => bridge.current?.catSay(pickCatLine(dongAt.dong?.ratio ?? null, catTaps.current++))}
        onError={(reason) => {
          console.warn('지도 오류', reason);
          setMapFailed(true);
        }}
      />

      <SafeAreaView edges={['top']} style={styles.top} pointerEvents="box-none">
        <DongBadge dong={offline ? null : dongAt.dong} />
        {permission === 'denied' && (
          <View style={styles.banner}>
            <Text style={styles.bannerText}>위치를 켜두시면 지금 있는 곳을 보여드릴게요</Text>
            <Pill label="설정 열기" onPress={() => Linking.openSettings()} />
          </View>
        )}
        {offline && (
          <View style={styles.banner}>
            <Text style={styles.bannerText}>연결이 끊겨 있어요. 마지막으로 본 지도예요.</Text>
          </View>
        )}
        {queue.pending > 0 && (
          <View style={styles.banner}>
            <Text style={styles.bannerText}>챙겨둔 발자국 {queue.pending}개</Text>
          </View>
        )}
        {status === 'error' && (
          <View style={styles.banner}>
            <Text style={styles.bannerText}>아지트를 불러오지 못했어요</Text>
            <Pill label="다시 시도" onPress={retry} />
          </View>
        )}
        {status === 'ready' && hideouts.length === 0 && (
          <View style={styles.banner}>
            <Text style={styles.bannerText}>아직 발자국이 없어요. 가까운 곳부터 같이 가볼까요?</Text>
          </View>
        )}
      </SafeAreaView>

      {location && (
        <View style={styles.locate}>
          <Pill label="내 위치로" onPress={() => bridge.current?.panTo(location.lat, location.lng)} />
        </View>
      )}

      {checkin.state.name === 'queued' && (
        <View style={styles.checkinNote}>
          <Text style={styles.bannerText}>발자국을 챙겨뒀어요. 연결되면 남길게요 🐾</Text>
          <View style={styles.row}>
            <Pill label="닫기" onPress={checkin.close} />
          </View>
        </View>
      )}
      {queue.dropped > 0 && checkin.state.name === 'idle' && (
        <View style={styles.checkinNote}>
          <Text style={styles.bannerText}>챙겨둔 발자국 {queue.dropped}개는 남기지 못했어요. 너무 멀었거나 위치가 흐렸어요.</Text>
          <View style={styles.row}>
            <Pill label="닫기" onPress={queue.clearDropped} />
          </View>
        </View>
      )}
      {(locating || checkin.state.name === 'failed') && (
        <View style={styles.checkinNote}>
          <Text style={styles.bannerText}>
            {checkin.state.name === 'failed' ? checkin.state.message : '잠깐, 위치를 확인하고 있어요…'}
          </Text>
          {locating && (
            <View style={styles.row}>
              <Pill label="닫기" onPress={checkin.close} />
            </View>
          )}
          {checkin.state.name === 'failed' && (
            <View style={styles.row}>
              <Pill label="다시 해볼게요" onPress={checkin.start} />
              {checkin.state.needsSettings && <Pill label="설정 열기" onPress={() => Linking.openSettings()} />}
              <Pill label="닫기" onPress={checkin.close} />
            </View>
          )}
        </View>
      )}

      <View style={styles.stampWrap} pointerEvents="box-none">
        <Pressable
          onPress={() => {
            setSelectedId(null); // the card sits where the check-in messages appear
            checkin.start();
          }}
          disabled={locating}
          accessibilityRole="button"
          accessibilityLabel="발자국 남기기"
          accessibilityState={{ disabled: locating }}
          style={[styles.stamp, locating && styles.stampBusy]}>
          <Text style={styles.stampText}>발자국 남기기</Text>
        </Pressable>
      </View>

      {selected && (
        <View style={styles.card}>
          <Image source={{ uri: markerFor(selected.grade).uri }} style={styles.cardArt} />
          <View style={styles.cardText}>
            <Text style={styles.cardTitle}>{selected.name}</Text>
            <Text style={styles.caption}>{GRADE_LABEL[selected.grade]}</Text>
            <Text style={styles.body}>지금까지 {selected.footprintCount}번 다녀왔어요</Text>
            {thresholds && <Text style={styles.caption}>{nextStageHint(selected.footprintCount, thresholds)}</Text>}
          </View>
          <Pill label="닫기" onPress={() => setSelectedId(null)} />
        </View>
      )}

      {checkin.state.name === 'choosing' && (
        <CheckinSheet state={checkin.state} footprintsById={footprintsById} onChoose={checkin.choose} onClose={checkin.close} />
      )}
      {shown && (
        <Celebration
          result={shown}
          thresholds={thresholds}
          onClose={() => {
            if (celebrated) {
              checkin.close();
              retry(); // the marker should show the grown hideout
              fog.refresh(); // the new footprint's cell clears
              dongAt.refresh(); // ratio and stage move with it
            } else {
              queue.next(); // 새로고침은 올라갈 때 이미 했다
            }
            shouldOfferArrival(shown.footprintCount)
              .then(setArrivalOffer)
              .catch((e) => console.warn('도착 알림 카드 확인 실패', e));
          }}
        />
      )}
      {arrivalOffer && (
        <ArrivalOffer
          onAnswer={(accept) => {
            setArrivalOffer(false);
            answerArrivalOffer(accept)
              .then((granted) => {
                if (granted) retry(); // 다시 불러오면서 감시 목록을 등록한다
              })
              .catch((e) => console.warn('도착 알림 켜기 실패', e));
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  checkinNote: {
    position: 'absolute',
    left: space.gutter,
    right: space.gutter,
    bottom: 96,
    backgroundColor: color.surfaceCard,
    borderRadius: radius.card,
    padding: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: color.line,
  },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  stampWrap: { position: 'absolute', left: 0, right: 0, bottom: 24, alignItems: 'center' },
  stamp: {
    minHeight: 52,
    paddingHorizontal: 28,
    borderRadius: radius.pill,
    backgroundColor: color.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stampBusy: { opacity: 0.6 },
  stampText: { fontFamily: font.semibold, fontSize: 16, color: color.onPrimary },
  screen: { flex: 1, backgroundColor: color.surface },
  centerBox: { alignItems: 'center', justifyContent: 'center', gap: 16, paddingHorizontal: space.gutter },
  top: { position: 'absolute', left: space.gutter, right: space.gutter, top: 0, gap: 8 },
  banner: {
    marginTop: 8,
    backgroundColor: color.surfaceCard,
    borderRadius: radius.card,
    padding: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: color.line,
  },
  bannerText: { ...type.body, color: color.ink },
  locate: { position: 'absolute', right: space.gutter, bottom: 180 },
  pill: {
    alignSelf: 'flex-start',
    minHeight: space.tapMin,
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderRadius: radius.pill,
    backgroundColor: color.primary,
  },
  pillText: { fontFamily: font.semibold, fontSize: 15, color: color.onPrimary },
  card: {
    position: 'absolute',
    left: space.gutter,
    right: space.gutter,
    bottom: 96,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderRadius: radius.sheet,
    backgroundColor: color.surfaceCard,
    borderWidth: 1,
    borderColor: color.line,
  },
  cardArt: { width: 56, height: 56 },
  cardText: { flex: 1, gap: 2 },
  cardTitle: { ...type.subtitle, color: color.ink },
  body: { ...type.body, color: color.ink },
  caption: { ...type.caption, color: color.inkSub },
});
