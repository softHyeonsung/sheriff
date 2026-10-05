// mobile/src/app/(tabs)/index.tsx
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Icon, ICON, IconButton, Popup } from '@/components/kit';
import { color, radius, shadow, space, type } from '@/constants/tokens';
import { ArrivalOffer } from '@/features/arrival/ArrivalOffer';
import { answerArrivalOffer, shouldOfferArrival } from '@/features/arrival/register';
import { useArrivalTap } from '@/features/arrival/useArrivalTap';
import { Celebration } from '@/features/checkin/Celebration';
import { CheckinSheet } from '@/features/checkin/CheckinSheet';
import { nameFor } from '@/features/checkin/candidates';
import { useCheckin } from '@/features/checkin/useCheckin';
import { useDwell } from '@/features/checkin/useDwell';
import { checkinNextAt } from '@/features/checkin/checkinApi';
import { messageFor, MSG } from '@/features/checkin/copy';
import { CheckinError } from '@/features/checkin/errors';
import { useCheckinQueue } from '@/features/checkin/useCheckinQueue';
import { bareName, COURSE } from '@/features/course/copy';
import { CourseCard } from '@/features/course/CourseCard';
import { type Course, findKakaoPlace, suggestCourse } from '@/features/course/courseApi';
import { looksShared } from '@/features/wishlist/sharedText';
import { useWishes } from '@/features/wishlist/useWishes';
import { type Place, searchPlaces } from '@/features/wishlist/wishlistApi';
import { useShareStore } from '@/stores/shareStore';
import { onOnline } from '@/lib/network';
import { isNetworkError } from '@/lib/networkError';
import { nextStageHint } from '@/features/map/nextStageHint';
import { useMyHideouts } from '@/features/map/useMyHideouts';
import { useMyLocation } from '@/features/map/useMyLocation';
import { pickCatLine } from '@/features/territory/catLine';
import { DongBadge } from '@/features/territory/DongBadge';
import { useDongAt } from '@/features/territory/useDongAt';
import { useMyFog } from '@/features/territory/useMyFog';
import { useWalkFog } from '@/features/territory/useWalkFog';
import { GRADE_LABEL } from '@/map/grades';
import { MapBridge, type MapBridgeHandle } from '@/map/MapBridge';
import { catArt } from '@/map/catArt';
import { markerFor } from '@/map/markers';
import { useMeStore } from '@/stores/meStore';

const CITY_HALL = { lat: 37.5665, lng: 126.978 };
// 길을 보러 갈 때(내 위치로·검색한 곳)의 줌: 수채 세계가 걷히고 실제 지도가 보이는 단계.
const STREET_LEVEL = 3;
const NO_PINS: { placeId: string; lat: number; lng: number }[] = [];

export default function MapScreen() {
  const { hideouts, thresholds, status, retry } = useMyHideouts();
  const { location, permission } = useMyLocation();
  const checkin = useCheckin();
  const fog = useMyFog();
  const dongAt = useDongAt();
  const offline = status === 'offline';
  const wishList = useWishes();
  const [wishId, setWishId] = useState<string | null>(null);
  const wishPins = useMemo(
    () => wishList.wishes.filter((w) => !w.achievedAt).map(({ placeId, lat, lng }) => ({ placeId, lat, lng })),
    [wishList.wishes],
  );
  const selectedWish = wishList.wishes.find((w) => w.placeId === wishId) ?? null;
  // 찜한 곳 모아 보기: 지도는 핀이 모두 보이게 맞추고, 아래 판에 목록이 올라온다.
  const [wishOpen, setWishOpen] = useState(false);
  // 찜 핀은 별을 켰을 때만 지도에 뜬다(켜져 있으면 별이 노랗게 채워진다). 목록 판은 따로 닫을 수 있다.
  const [wishPinsOn, setWishPinsOn] = useState(false);
  // 아래 창(고양이 한마디 + 발자국 남기기)은 끌 수 있다. 꺼 두면 오른쪽 도구에 다시 여는 버튼이 생긴다.
  const [dockOpen, setDockOpen] = useState(true);

  // 공유로 들어온 글이 기다리고 있으면 찜 화면으로(지도에 도착했다 = 로그인·온보딩 끝).
  const pendingShare = useShareStore((s) => s.pending);
  const setPendingShare = useShareStore((s) => s.setPending);
  useEffect(() => {
    if (!pendingShare) return;
    setPendingShare(null);
    router.push({ pathname: '/wishlist', params: { shared: pendingShare } });
  }, [pendingShare, setPendingShare]);
  const { refresh: refreshFog } = fog;
  const { refresh: refreshDong } = dongAt;
  // 걸어 지나간 자리도 걷힌다: 새 칸이 걷히면 안개와 개척률을 새로 불러온다.
  useWalkFog(
    location,
    useCallback(() => {
      refreshFog();
      refreshDong();
    }, [refreshFog, refreshDong]),
  );
  // 챙겨둔 발자국이 올라가면 지도를 새로 불러온다(마커·안개·동).
  const queue = useCheckinQueue(
    useCallback(() => {
      retry();
      refreshFog();
      refreshDong();
    }, [retry, refreshFog, refreshDong]),
  );
  // 저장본을 보고 있다가 다시 연결되면 지도를 새로 불러온다(챙긴 발자국이 없어도).
  const offlineRef = useRef(offline);
  useEffect(() => {
    offlineRef.current = offline;
  }, [offline]);
  useEffect(
    () =>
      onOnline(() => {
        if (!offlineRef.current) return;
        retry();
        refreshFog();
      }),
    [retry, refreshFog],
  );
  const { flush: flushQueue } = queue;
  // 발자국은 3분 머문 뒤에 남는다. 다 머물면 올리고(축하는 대기열이 띄운다) 지도를 새로 불러온다 —
  // 앱을 내려놓은 사이 이미 올라갔을 수도 있다.
  const dwell = useDwell(
    useCallback(() => {
      flushQueue();
      retry();
      refreshFog();
      refreshDong();
    }, [flushQueue, retry, refreshFog, refreshDong]),
  );
  // 챙기자마자 한 번 올려 본다: 연결이 살아 있으면(서버만 느렸던 경우) 바로 올라간다.
  useEffect(() => {
    if (checkin.state.name === 'queued') flushQueue();
  }, [checkin.state.name, flushQueue]);
  const catTaps = useRef(0);
  const catColor = useMeStore((s) => s.me?.catColor) ?? 'cheese';
  const footprintsById = useMemo(() => Object.fromEntries(hideouts.map((h) => [h.id, h.footprintCount])), [hideouts]);
  const locating = checkin.state.name === 'locating';
  const bridge = useRef<MapBridgeHandle>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const catName = useMeStore((s) => s.me?.catName) ?? '고양이';
  // 코스(고양이의 산책 제안): 화면 상태로만 든다. 요청 번호로 닫은 뒤 늦게 온 응답을 버린다.
  const [course, setCourse] = useState<Course | null>(null);
  const [courseKey, setCourseKey] = useState(0); // 새 코스 = 새 카드(줄마다의 찜 상태를 비운다)
  const [courseBusy, setCourseBusy] = useState(false);
  const [courseNote, setCourseNote] = useState<string | null>(null);
  const courseReq = useRef(0);
  // 방금 받은 추천: 간격 안에 다시 누르면 새로 찾는 대신 이걸 다시 보여준다.
  const lastCourse = useRef<Course | null>(null);
  const coursePlan = useMemo(
    () => (course ? { stops: course.stops.map(({ lat, lng }) => ({ lat, lng })), route: course.route } : null),
    [course],
  );
  const closeCourse = () => {
    courseReq.current++;
    setCourse(null);
    setCourseNote(null);
    setCourseBusy(false);
  };
  const startCourse = async () => {
    closeCourse();
    if (!location) {
      setCourseNote(COURSE.noLocation);
      return;
    }
    const id = courseReq.current;
    setSelectedId(null);
    setWishId(null);
    setCourseBusy(true);
    try {
      const got = await suggestCourse(location.lat, location.lng);
      if (id !== courseReq.current) return;
      if (got.waitS > 0 && !lastCourse.current) {
        setCourseNote(COURSE.tooSoon(got.waitS)); // 앱을 다시 켜서 받아 둔 게 없다
        return;
      }
      const c = got.waitS > 0 && lastCourse.current ? lastCourse.current : got;
      lastCourse.current = c;
      if (c.stops.length === 0) setCourseNote(COURSE.empty);
      else {
        setCourse(c);
        setCourseKey(id);
      }
    } catch (e) {
      if (id !== courseReq.current) return;
      if (!isNetworkError(e)) console.error('코스 추천 실패', e);
      setCourseNote(isNetworkError(e) ? MSG.offline : MSG.unknown);
    } finally {
      if (id === courseReq.current) setCourseBusy(false);
    }
  };
  // 장소 검색: 위의 검색창 → 결과 목록 → 고르면 지도가 그곳으로 가고 아래 판에 그 장소가 뜬다.
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Place[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchNote, setSearchNote] = useState<string | null>(null);
  const [found, setFound] = useState<Place | null>(null);
  const searchReq = useRef(0);
  const focus = useMemo(() => (found ? { lat: found.lat, lng: found.lng } : null), [found]);
  const clearSearch = () => {
    searchReq.current++;
    setQuery('');
    setResults(null);
    setSearchNote(null);
    setSearching(false);
  };
  const runSearch = async () => {
    const q = query.trim();
    if (!q) return;
    // 붙여넣은 공유 링크·글은 찜 화면이 풀어 준다(지도 링크를 따라가 가게를 찾는다).
    if (looksShared(q)) {
      router.push({ pathname: '/wishlist', params: { shared: q } });
      return;
    }
    const id = ++searchReq.current;
    setSearching(true);
    setSearchNote(null);
    setResults(null);
    try {
      const places = await searchPlaces(q, location ? { lat: location.lat, lng: location.lng } : null);
      if (id !== searchReq.current) return;
      if (places.length === 0) setSearchNote('음, 못 찾았다냥. 다른 이름으로 찾아볼까냥?');
      else setResults(places.slice(0, 5));
    } catch (e) {
      if (id !== searchReq.current) return;
      if (!isNetworkError(e)) console.error('장소 검색 실패', e);
      setSearchNote(isNetworkError(e) ? MSG.offline : MSG.unknown);
    } finally {
      if (id === searchReq.current) setSearching(false);
    }
  };
  const pick = (p: Place) => {
    setResults(null);
    setSelectedId(null);
    setWishId(null);
    setFound(p);
    bridge.current?.panTo(p.lat, p.lng, STREET_LEVEL);
  };
  const openWishes = () => {
    setSelectedId(null);
    setFound(null);
    setWishId(null);
    setWishOpen(true);
    setWishPinsOn(true);
    // 하나뿐이면 범위 맞추기가 끝까지 당겨 버린다: 길이 보이는 줌으로 간다.
    if (wishPins.length === 1) bridge.current?.panTo(wishPins[0].lat, wishPins[0].lng, STREET_LEVEL);
    else bridge.current?.fit(wishPins);
  };
  const closeWishes = () => {
    setWishPinsOn(false);
    setWishOpen(false);
    setWishId(null);
  };
  const showWish = (w: { placeId: string; lat: number; lng: number }) => {
    setSelectedId(null);
    setFound(null);
    setWishId(w.placeId);
    bridge.current?.panTo(w.lat, w.lng, STREET_LEVEL);
  };
  const [mapFailed, setMapFailed] = useState(false);
  const [mapKey, setMapKey] = useState(0);
  // What the map was last centered on. A ref, not state: updating it must not re-render.
  const centeredOn = useRef<'none' | 'hideout' | 'me'>('none');
  const [arrivalOffer, setArrivalOffer] = useState(false);
  // 고른 곳이 아까 다녀온 곳일 때의 안내(3분을 기다리게 하지 않고 바로 알린다).
  const [visitedNote, setVisitedNote] = useState<string | null>(null);
  const celebrated = checkin.state.name === 'celebrating' ? checkin.state.result : null;
  const celebratedFix = checkin.state.name === 'celebrating' ? checkin.state.fix : null;
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
  const pins = useMemo(() => hideouts.map(({ id, lat, lng, grade, name }) => ({ id, lat, lng, grade, name })), [hideouts]);

  if (mapFailed) {
    return (
      <SafeAreaView style={[styles.screen, styles.centerBox]}>
        <Text style={styles.body}>지도를 불러오지 못했다냥. 다시 해볼까냥?</Text>
        <Button
          label="다시 시도"
          variant="tonal"
          onPress={() => {
            setMapFailed(false);
            centeredOn.current = 'none';
            setMapKey((k) => k + 1);
          }}
        />
      </SafeAreaView>
    );
  }

  const idle = checkin.state.name === 'idle';
  const failed = checkin.state.name === 'failed' ? checkin.state : null;
  const showWishes = wishOpen && idle && !selected && !selectedWish && !found;
  const showCourse = !!course && idle && !selected && !selectedWish && !found && !wishOpen;
  // 아래 판에 따로 보여줄 것이 없을 때만 고양이의 한마디가 나온다.
  const quiet =
    !arrivalOffer && idle && !dwell.pending && !selected && !selectedWish && !found && !wishOpen && !course && !courseBusy && !courseNote && queue.dropped === 0 && queue.droppedMemories === 0;

  // 아래 창에 카드가 하나라도 떠 있는가(아래 JSX의 카드들과 같은 조건).
  const card = !!(
    arrivalOffer ||
    selected ||
    selectedWish ||
    showWishes ||
    showCourse ||
    (idle && (dwell.pending || queue.dropped > 0 || queue.droppedMemories > 0 || found || courseBusy))
  );
  // 꺼 둔 창도 보여줄 카드(아지트·찜·검색·코스·안내)가 생기면 그동안은 다시 나온다.
  const showDock = dockOpen || !quiet;

  return (
    <View style={styles.screen}>
      <MapBridge
        key={mapKey}
        ref={bridge}
        hideouts={pins}
        myLocation={location}
        center={CITY_HALL}
        onHideoutTap={(id) => {
          setWishId(null);
          setFound(null);
          setSelectedId(id);
        }}
        wishes={wishPinsOn ? wishPins : NO_PINS}
        onWishTap={(id) => {
          setSelectedId(null);
          setFound(null);
          setWishId(id);
        }}
        fog={fog.cells}
        onIdle={dongAt.onIdle}
        catColor={catColor}
        course={coursePlan}
        focus={focus}
        onCatTap={() => bridge.current?.catSay(pickCatLine(dongAt.dong?.ratio ?? null, catTaps.current++))}
        onError={(reason) => {
          console.warn('지도 오류', reason);
          setMapFailed(true);
        }}
      />

      {/* 위: 장소 검색창과 찜한 곳. 그 아래로 검색 결과, 지금 보는 동네, 지금 알아야 할 상태 한 줄씩. */}
      <SafeAreaView edges={['top']} style={styles.top} pointerEvents="box-none">
        <View style={styles.topRow} pointerEvents="box-none">
          <View style={styles.search}>
            <Icon name={ICON.search} size={20} tint={color.inkSub} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              accessibilityLabel="장소 검색"
              placeholder="장소 검색"
              placeholderTextColor={color.inkSub}
              style={styles.searchInput}
              returnKeyType="search"
              onSubmitEditing={runSearch}
            />
            {(query.length > 0 || results || searchNote) && (
              <Pressable onPress={clearSearch} accessibilityRole="button" accessibilityLabel="검색어 지우기" hitSlop={10}>
                <Icon name={ICON.close} size={18} tint={color.inkSub} />
              </Pressable>
            )}
          </View>
          <IconButton icon={ICON.star} label="찜한 곳" onPress={wishPinsOn ? closeWishes : openWishes}>
            {wishPinsOn ? <Text style={styles.starOn}>★</Text> : undefined}
          </IconButton>
        </View>
        {(searching || searchNote) && (
          <View style={styles.banner}>
            <Text style={styles.bannerText}>{searching ? '찾고 있다냥…' : searchNote}</Text>
          </View>
        )}
        {results && (
          <View style={styles.results}>
            {results.map((p, i) => (
              <Pressable
                key={p.placeId}
                onPress={() => pick(p)}
                accessibilityRole="button"
                accessibilityLabel={p.name}
                style={({ pressed }) => [styles.result, i > 0 && styles.resultLine, pressed && styles.resultPressed]}>
                <Text style={styles.resultName} numberOfLines={1}>
                  {p.name}
                </Text>
                <Text style={styles.caption} numberOfLines={1}>
                  {[p.roadAddress, p.distanceM != null ? `약 ${Math.round(p.distanceM)}m` : null].filter(Boolean).join(' · ')}
                </Text>
              </Pressable>
            ))}
          </View>
        )}
        {!results && <DongBadge dong={offline ? null : dongAt.dong} />}
        {/* 발자국 실패 안내가 같은 말과 [설정 열기]를 이미 보여주고 있으면 이 배너는 숨긴다. */}
        {permission === 'denied' && !failed?.needsSettings && (
          <View style={styles.banner}>
            <Text style={[styles.bannerText, styles.grow]}>위치를 켜두면 지금 있는 곳을 보여줄게냥</Text>
            <Button label="설정 열기" variant="tonal" onPress={() => Linking.openSettings()} />
          </View>
        )}
        {offline && (
          <View style={styles.banner}>
            <Text style={styles.bannerText}>연결이 끊겨 있다냥. 마지막으로 본 지도냥.</Text>
          </View>
        )}
        {queue.pending > 0 && (
          <View style={styles.banner}>
            <Text style={styles.bannerText}>챙겨둔 발자국 {queue.pending}개</Text>
          </View>
        )}
        {status === 'error' && (
          <View style={styles.banner}>
            <Text style={[styles.bannerText, styles.grow]}>아지트를 불러오지 못했다냥</Text>
            <Button label="다시 시도" variant="tonal" onPress={retry} />
          </View>
        )}
      </SafeAreaView>

      {/* 아래: 지도 도구(오른쪽)는 판 바로 위에 붙어 다니고, 판 하나에 안내·카드·가장 중요한 버튼이 모인다. */}
      <View style={styles.bottom} pointerEvents="box-none">
        <View style={styles.rail} pointerEvents="box-none">
          <IconButton round icon={ICON.walk} label={COURSE.button} onPress={startCourse} disabled={courseBusy} />
          {location && <IconButton round icon={ICON.locate} label="내 위치로" onPress={() => bridge.current?.panTo(location.lat, location.lng, STREET_LEVEL)} />}
          {!showDock && <IconButton round icon={ICON.footprint} label="발자국 남기기 창 열기" onPress={() => setDockOpen(true)} />}
        </View>

        {showDock && (
        <View style={styles.dock}>
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

          {queue.dropped > 0 && idle && (
            <View style={styles.note}>
              <Text style={styles.noteText}>챙겨둔 발자국 {queue.dropped}개는 남기지 못했다냥. 너무 멀었거나 위치가 흐렸다냥.</Text>
              <View style={styles.actions}>
                <Button label="닫기" variant="plain" onPress={queue.clearDropped} />
              </View>
            </View>
          )}
          {dwell.pending && idle && (
            <View style={styles.note}>
              <Text style={styles.placeTitle}>{dwell.pending.name}에 머무는 중이다냥</Text>
              <Text style={styles.noteText}>
                {dwell.remainingS > 0
                  ? `${Math.floor(dwell.remainingS / 60)}분 ${dwell.remainingS % 60}초 뒤에도 여기 있으면 발자국이 남는다냥.`
                  : '아직 여기 있는지 확인하고 있다냥…'}
              </Text>
              <View style={styles.actions}>
                <Button label="그만두기" variant="plain" onPress={dwell.cancel} />
              </View>
            </View>
          )}
          {queue.droppedMemories > 0 && queue.dropped === 0 && idle && (
            <View style={styles.note}>
              <Text style={styles.noteText}>남긴 순간 {queue.droppedMemories}개는 올리지 못했다냥. 너무 멀었거나 위치가 흐렸다냥.</Text>
              <View style={styles.actions}>
                <Button label="닫기" variant="plain" onPress={queue.clearDroppedMemories} />
              </View>
            </View>
          )}

          {selected && (
            <View style={styles.note}>
              <View style={styles.place}>
                <Image source={{ uri: markerFor(selected.grade).uri }} style={styles.placeArt} />
                <View style={styles.grow}>
                  <Text style={styles.placeTitle}>{selected.name}</Text>
                  <Text style={styles.caption}>{GRADE_LABEL[selected.grade]}</Text>
                </View>
              </View>
              <Text style={styles.noteText}>지금까지 {selected.footprintCount}번 다녀왔다냥</Text>
              {thresholds && <Text style={styles.caption}>{nextStageHint(selected.footprintCount, thresholds)}</Text>}
              <View style={styles.actions}>
                <Button label="추억 보기" variant="tonal" onPress={() => router.push({ pathname: '/aidut/[id]', params: { id: selected.id } })} />
                <Button label="닫기" variant="plain" onPress={() => setSelectedId(null)} />
              </View>
            </View>
          )}

          {selectedWish && (
            <View style={styles.note}>
              <View>
                <Text style={styles.placeTitle}>{selectedWish.name}</Text>
                <Text style={styles.caption}>고양이가 찜한 곳</Text>
              </View>
              {selectedWish.roadAddress && <Text style={styles.noteText}>{selectedWish.roadAddress}</Text>}
              <View style={styles.actions}>
                <Button
                  label="찜 해제"
                  variant="tonal"
                  onPress={() => {
                    setWishId(null);
                    wishList.remove(selectedWish.placeId).catch((e) => console.warn('찜 해제 실패', e));
                  }}
                />
                <Button label="닫기" variant="plain" onPress={() => setWishId(null)} />
              </View>
            </View>
          )}

          {found && idle && (
            <View style={styles.note}>
              <View>
                <Text style={styles.placeTitle}>{found.name}</Text>
                {found.roadAddress && <Text style={styles.caption}>{found.roadAddress}</Text>}
              </View>
              <View style={styles.actions}>
                {wishList.wishes.some((w) => w.placeId === found.placeId) ? (
                  <Text style={styles.done}>찜한 곳이다냥</Text>
                ) : (
                  <Button
                    label="찜하기"
                    variant="tonal"
                    onPress={() => {
                      setWishPinsOn(true); // 방금 찜한 곳이 핀으로 보이게
                      wishList.add(found).catch((e) => console.warn('찜 실패', e));
                    }}
                  />
                )}
                <Button label="닫기" variant="plain" onPress={() => setFound(null)} />
              </View>
            </View>
          )}

          {showWishes && (
            <View style={styles.note}>
              <View style={styles.place}>
                <Text style={[styles.placeTitle, styles.grow]}>찜한 곳</Text>
                <Button label="닫기" variant="plain" onPress={() => setWishOpen(false)} />
              </View>
              {wishList.wishes.length === 0 ? (
                <>
                  <Text style={styles.noteText}>아직 저장한 장소가 없다냥. 장소를 찾아볼까냥?</Text>
                  <View style={styles.actions}>
                    <Button
                      label="장소 추천받기"
                      variant="tonal"
                      onPress={() => {
                        setWishOpen(false);
                        startCourse();
                      }}
                    />
                  </View>
                </>
              ) : (
                <ScrollView style={styles.wishList}>
                  {wishList.wishes.map((w, i) => (
                    <Pressable
                      key={w.placeId}
                      onPress={() => showWish(w)}
                      accessibilityRole="button"
                      accessibilityLabel={w.name}
                      style={({ pressed }) => [styles.wishRow, i > 0 && styles.resultLine, pressed && styles.resultPressed]}>
                      <View style={styles.grow}>
                        <Text style={styles.resultName} numberOfLines={1}>
                          {w.name}
                        </Text>
                        {w.roadAddress && (
                          <Text style={styles.caption} numberOfLines={1}>
                            {w.roadAddress}
                          </Text>
                        )}
                      </View>
                      {w.achievedAt && <Text style={styles.done}>달성 ✓</Text>}
                    </Pressable>
                  ))}
                </ScrollView>
              )}
            </View>
          )}

          {/* 발자국 안내와 같은 자리라, 체크인이 진행 중이면 코스 쪽을 잠깐 숨긴다(핀은 남는다). */}
          {idle && courseBusy && (
            <View style={styles.note}>
              <Text style={styles.noteText}>{COURSE.finding}</Text>
              <View style={styles.actions}>
                <Button label="닫기" variant="plain" onPress={closeCourse} />
              </View>
            </View>
          )}
          {showCourse && course && (
            <CourseCard
              key={courseKey}
              catName={catName}
              course={course}
              onWish={async (stop) => {
                const place = await findKakaoPlace(stop);
                if (!place) return false;
                await wishList.add(place);
                setWishPinsOn(true);
                return true;
              }}
              onFind={(stop) => router.push({ pathname: '/wishlist', params: { shared: bareName(stop.name) } })}
              onClose={closeCourse}
            />
          )}

          {quiet && (
            <View style={styles.place}>
              <Image source={{ uri: catArt(catColor, 'sit') }} style={styles.cat} />
              <View style={styles.grow}>
                {status === 'ready' && hideouts.length === 0 ? (
                  <Text style={styles.noteText}>아직 발자국이 없다냥. 가까운 곳부터 같이 가볼까냥?</Text>
                ) : (
                  <>
                    <Text style={styles.placeTitle}>오늘은 어디로 가볼까냥?</Text>
                    {status === 'ready' && <Text style={styles.caption}>함께 누빈 아지트 {hideouts.length}곳</Text>}
                  </>
                )}
              </View>
              <Pressable onPress={() => setDockOpen(false)} accessibilityRole="button" accessibilityLabel="발자국 남기기 창 닫기" hitSlop={10} style={styles.dockClose}>
                <Icon name={ICON.close} size={20} tint={color.inkSub} />
              </Pressable>
            </View>
          )}

          {/* 카드(아지트·찜·검색·장소 추천·안내)는 발자국과 다른 일이다: 카드가 떠 있는 동안엔 발자국 버튼을 두지 않는다. */}
          {!card && (
            <Button
              label="발자국 남기기"
              size="lg"
              busy={locating}
              onPress={() => {
                setSelectedId(null); // 아지트 카드 자리에 발자국 안내가 나온다
                checkin.start();
              }}
            />
          )}
        </View>
        )}
      </View>

      {/* 발자국 남기기의 진행·실패·챙김: 가운데 알림 창. ✕로 끈다. */}
      {(locating || failed || checkin.state.name === 'queued') && (
        <Popup onClose={checkin.close}>
          <Text style={styles.noteText}>
            {failed ? failed.message : locating ? '잠깐, 위치를 확인하고 있다냥…' : '발자국을 챙겨뒀다냥. 연결되면 남길게냥 🐾'}
          </Text>
          {failed && (
            <View style={styles.actions}>
              <Button label="다시 시도" variant="tonal" onPress={checkin.start} />
              {failed.needsSettings && <Button label="설정 열기" variant="tonal" onPress={() => Linking.openSettings()} />}
            </View>
          )}
        </Popup>
      )}
      {/* 장소 추천이 안 될 때(위치 꺼짐·오류·없음): 알림 창으로 확인받는다. */}
      {visitedNote && (
        <Popup onClose={() => setVisitedNote(null)}>
          <Text style={styles.noteText}>{visitedNote}</Text>
          <View style={styles.actions}>
            <Button label="확인" onPress={() => setVisitedNote(null)} />
          </View>
        </Popup>
      )}
      {dwell.left && (
        <Popup onClose={dwell.clearLeft}>
          <Text style={styles.noteText}>3분 동안 머물지 않아서 발자국을 남기지 못했다냥.</Text>
          <View style={styles.actions}>
            <Button label="확인" onPress={dwell.clearLeft} />
          </View>
        </Popup>
      )}
      {queue.cooled > 0 && (
        <Popup onClose={queue.clearCooled}>
          <Text style={styles.noteText}>여긴 아까 다녀온 곳이라 이번 발자국은 남지 않았다냥. 조금 뒤에 다시 남겨볼까냥?</Text>
          <View style={styles.actions}>
            <Button label="확인" onPress={queue.clearCooled} />
          </View>
        </Popup>
      )}
      {courseNote && (
        <Popup onClose={closeCourse}>
          <Text style={styles.noteText}>{courseNote}</Text>
          <View style={styles.actions}>
            <Button label="확인" onPress={closeCourse} />
            {courseNote === COURSE.noLocation && permission === 'denied' && (
              <Button label="설정 열기" variant="tonal" onPress={() => Linking.openSettings()} />
            )}
          </View>
        </Popup>
      )}
      {checkin.state.name === 'choosing' && (
        <CheckinSheet
          dwell
          state={checkin.state}
          footprintsById={footprintsById}
          onChoose={async (target) => {
            if (checkin.state.name !== 'choosing') return;
            const { fix, candidates } = checkin.state;
            checkin.close();
            // 못 물어봤으면(끊김 등) 그냥 머무름을 시작한다: 남길 때 서버가 다시 본다.
            const nextAt = await checkinNextAt(fix, target).catch(() => null);
            if (nextAt) {
              setVisitedNote(messageFor(new CheckinError('cooldown', nextAt)));
              return;
            }
            dwell.start({ fix, target, name: nameFor(target, candidates) }).catch((e) => console.warn('머무름 시작 실패', e));
          }}
          onClose={checkin.close}
        />
      )}
      {shown && (
        <Celebration
          result={shown}
          memory={celebrated && celebratedFix ? { aidutId: celebrated.aidutId, fix: celebratedFix } : undefined}
          thresholds={thresholds}
          onClose={() => {
            if (celebrated) {
              checkin.close();
              retry(); // the marker should show the grown hideout
              wishList.refresh(); // 찜한 곳이었으면 ⭐ 핀이 사라진다(달성)
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
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.surface },
  centerBox: { alignItems: 'center', justifyContent: 'center', gap: 16, paddingHorizontal: space.gutter },
  grow: { flex: 1 },
  top: { position: 'absolute', left: 12, right: 12, top: 0, gap: 8 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  search: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 44,
    paddingHorizontal: 14,
    borderRadius: radius.btn,
    backgroundColor: color.surfaceCard,
    ...shadow.card,
  },
  searchInput: { flex: 1, ...type.body, lineHeight: undefined, color: color.ink, paddingVertical: 0 },
  results: { backgroundColor: color.surfaceCard, borderRadius: radius.card, overflow: 'hidden', ...shadow.card },
  result: { paddingVertical: 12, paddingHorizontal: 16, gap: 2 },
  resultLine: { borderTopWidth: 1, borderTopColor: color.line },
  resultPressed: { backgroundColor: color.surfaceSunk },
  resultName: { ...type.bodyStrong, color: color.ink },
  wishList: { maxHeight: 264 },
  wishRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12 },
  done: { ...type.label, color: color.natureInk, paddingHorizontal: 8 },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: color.surfaceCard,
    borderRadius: radius.card,
    paddingVertical: 10,
    paddingHorizontal: 14,
    ...shadow.card,
  },
  bannerText: { ...type.caption, fontSize: 14, lineHeight: 20, color: color.ink },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  rail: { alignSelf: 'flex-end', gap: 8, marginRight: 12, marginBottom: 12 },
  // 아래쪽에 떠 있는 창: 지도 위에 사방이 둥근 카드.
  dock: {
    backgroundColor: color.surfaceCard,
    borderRadius: radius.sheet,
    marginHorizontal: 12,
    marginBottom: 12,
    padding: space.gutter,
    gap: 16,
    ...shadow.card,
  },
  dockClose: { alignSelf: 'flex-start' },
  starOn: { fontSize: 24, lineHeight: 28, color: color.primary },
  note: { gap: 8 },
  noteText: { ...type.body, color: color.ink },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  place: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  placeArt: { width: 48, height: 48 },
  placeTitle: { ...type.subtitle, color: color.ink },
  cat: { width: 44, height: 44 },
  body: { ...type.body, color: color.ink },
  caption: { ...type.caption, color: color.inkSub },
});
