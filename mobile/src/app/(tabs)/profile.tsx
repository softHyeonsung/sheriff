// mobile/src/app/(tabs)/profile.tsx
// 프로필 = 설정: 닉네임·고양이·동네 바꾸기, 도착 알림, 약관, 로그아웃, 탈퇴.
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Image, Linking, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Card, Row } from '@/components/kit';
import { color, space, type } from '@/constants/tokens';
import { TERMS_LINKS } from '@/constants/terms';
import { useAuthSession } from '@/features/auth/useAuthSession';
import { useArrivalSwitch } from '@/features/profile/useArrivalSwitch';
import { catArt } from '@/map/catArt';
import { CAT_COLOR_LABEL } from '@/map/catColors';
import { useMeStore } from '@/stores/meStore';

// 걷힌 땅 = 초원(DESIGN.md §4). 고양이가 서 있는 자리에 쓴다.
const MEADOW = require('@/assets/images/meadow.jpg');

const TERMS: { label: string; url: string }[] = [
  { label: '이용약관', url: TERMS_LINKS.service },
  { label: '개인정보 처리방침', url: TERMS_LINKS.privacy },
  { label: '위치정보 이용약관', url: TERMS_LINKS.location },
];

export default function ProfileScreen() {
  const me = useMeStore((s) => s.me);
  const { signOut, deleteAccount } = useAuthSession();
  const arrival = useArrivalSwitch();
  const [leaving, setLeaving] = useState(false);
  const [leaveFailed, setLeaveFailed] = useState(false);

  const confirmSignOut = () =>
    Alert.alert('로그아웃할까냥?', '다음에 또 만나자냥.', [ // 카피톤 §3.7
      { text: '취소', style: 'cancel' },
      { text: '로그아웃', onPress: () => signOut() },
    ]);

  const leave = async () => {
    setLeaving(true);
    setLeaveFailed(false);
    try {
      await deleteAccount(); // 성공하면 세션이 사라져 가드가 로그인 화면으로 보낸다
    } catch (e) {
      console.error('탈퇴 실패', e);
      setLeaveFailed(true);
      setLeaving(false);
    }
  };

  const confirmLeave = () =>
    Alert.alert('정말 떠나냥?', '그동안 함께 누빈 동네와 순간들이 모두 지워진다냥.', [
      { text: '취소', style: 'cancel' },
      { text: '떠나기', style: 'destructive', onPress: leave },
    ]);

  const catColor = me?.catColor ?? 'cheese';

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* 이 화면의 주인공은 고양이: 크게, 초원 위에. 나머지는 조용한 목록. */}
        <View style={styles.hero}>
          <Image source={MEADOW} style={styles.hill} />
          <Image source={{ uri: catArt(catColor, 'sit') }} style={styles.cat} />
          <Text style={styles.catName}>{me?.catName ?? ''}</Text>
          <Text style={styles.caption}>{me?.nickname ? `${me.nickname} 님의 동네 짝꿍` : '동네 짝꿍'}</Text>
        </View>

        <Card style={styles.group}>
          <Row label="닉네임" value={me?.nickname ?? '아직 닉네임이 없다냥'} onPress={() => router.push('/settings/nickname')} />
          <View style={styles.divider} />
          <Row label="내 고양이" value={CAT_COLOR_LABEL[catColor]} onPress={() => router.push('/settings/cat')} />
          <View style={styles.divider} />
          <Row label="내 동네" value={me?.homeDong ?? '아직 정하지 않았다냥'} onPress={() => router.push('/settings/home')} />
        </Card>

        <Card style={styles.group}>
          <Row
            label="도착 알림"
            right={
              <View style={styles.switch}>
                <Switch
                  value={arrival.on}
                  onValueChange={arrival.toggle}
                  disabled={arrival.busy}
                  accessibilityLabel="도착 알림"
                  accessibilityRole="switch"
                  trackColor={{ false: color.fog, true: color.sky }}
                  thumbColor={color.surfaceCard}
                />
              </View>
            }
          />
          <Text style={[styles.caption, styles.hint]}>아지트 근처에 도착하면 내가 알려줄게냥</Text>
          {arrival.needsSettings && (
            <View style={styles.settings}>
              <Text style={[styles.caption, styles.grow]}>설정에서 위치를 &apos;항상 허용&apos;으로 바꿔달라냥</Text>
              <Button label="설정 열기" variant="tonal" onPress={() => Linking.openSettings()} />
            </View>
          )}
        </Card>

        <View style={styles.links}>
          {TERMS.map((t) => (
            <Pressable key={t.label} onPress={() => Linking.openURL(t.url)} accessibilityRole="link" accessibilityLabel={t.label} hitSlop={8}>
              <Text style={styles.link}>{t.label}</Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.exit}>
          <Button label="로그아웃" variant="plain" onPress={confirmSignOut} />
          <Pressable
            onPress={confirmLeave}
            disabled={leaving}
            accessibilityRole="button"
            accessibilityLabel="계정 탈퇴"
            accessibilityState={{ disabled: leaving }}
            hitSlop={8}>
            <Text style={styles.leave}>{leaving ? '떠나는 중…' : '계정 탈퇴'}</Text>
          </Pressable>
        </View>
        {leaveFailed && <Text style={styles.body}>지금은 떠날 수 없다냥. 잠시 뒤 다시 해볼까냥?</Text>}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.surface },
  content: { padding: space.gutter, gap: 16 },
  hero: { alignItems: 'center', paddingTop: 8, paddingBottom: 12, gap: 2 },
  // 고양이가 앉은 초원: 수채 초원 그림을 둥글게.
  hill: { position: 'absolute', top: 44, width: 208, height: 208, borderRadius: 104 },
  cat: { width: 168, height: 168 },
  catName: { ...type.title, color: color.ink, marginTop: 28 },
  group: { padding: 0, gap: 0, overflow: 'hidden' },
  divider: { height: 1, backgroundColor: color.line, marginLeft: 16 },
  switch: { flex: 1, alignItems: 'flex-end' },
  hint: { paddingHorizontal: 16, paddingBottom: 14, marginTop: -6 },
  settings: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 14 },
  grow: { flex: 1 },
  body: { ...type.body, color: color.ink },
  caption: { ...type.caption, color: color.inkSub },
  links: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 16, rowGap: 8, paddingHorizontal: 4, marginTop: 8 },
  link: { ...type.caption, color: color.inkSub, textDecorationLine: 'underline' },
  exit: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4 },
  leave: { ...type.caption, color: color.inkSub, textDecorationLine: 'underline' },
});
