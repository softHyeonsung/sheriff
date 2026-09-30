// mobile/src/app/(tabs)/profile.tsx
// 프로필 = 설정: 닉네임·고양이·동네 바꾸기, 도착 알림, 약관, 로그아웃, 탈퇴.
import { router } from 'expo-router';
import { type ReactNode, useState } from 'react';
import { Alert, Image, Linking, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { color, font, radius, space, type } from '@/constants/tokens';
import { TERMS_LINKS } from '@/constants/terms';
import { useAuthSession } from '@/features/auth/useAuthSession';
import { useArrivalSwitch } from '@/features/profile/useArrivalSwitch';
import { CAT_IMAGES } from '@/map/cat-image.generated';
import { CAT_COLOR_LABEL } from '@/map/catColors';
import { useMeStore } from '@/stores/meStore';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Pill({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={styles.pill} hitSlop={8}>
      <Text style={styles.pillText}>{label}</Text>
    </Pressable>
  );
}

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
    Alert.alert('로그아웃할까요?', undefined, [
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
    Alert.alert('정말 떠나시겠어요?', '그동안 함께 누빈 동네와 순간들이 모두 지워져요.', [
      { text: '취소', style: 'cancel' },
      { text: '떠나기', style: 'destructive', onPress: leave },
    ]);

  const catColor = me?.catColor ?? 'cheese';

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <Section title="닉네임">
          <View style={styles.row}>
            <Text style={me?.nickname ? styles.big : styles.body}>{me?.nickname ?? '아직 닉네임이 없어요'}</Text>
            <Pill label={me?.nickname ? '바꾸기' : '정하기'} onPress={() => router.push('/settings/nickname')} />
          </View>
        </Section>

        <Section title="내 고양이">
          <View style={styles.row}>
            <Image source={{ uri: CAT_IMAGES[catColor] }} style={styles.cat} />
            <View style={styles.grow}>
              <Text style={styles.body}>{me?.catName ?? ''}</Text>
              <Text style={styles.caption}>{CAT_COLOR_LABEL[catColor]}</Text>
            </View>
            <Pill label="바꾸기" onPress={() => router.push('/settings/cat')} />
          </View>
        </Section>

        <Section title="내 동네">
          <View style={styles.row}>
            <Text style={[styles.body, styles.grow]}>{me?.homeDong ?? '아직 정하지 않았어요'}</Text>
            <Pill label="바꾸기" onPress={() => router.push('/settings/home')} />
          </View>
        </Section>

        <Section title="도착 알림">
          <View style={styles.row}>
            <Text style={[styles.body, styles.grow]}>아지트 근처에 도착하면 알려드려요</Text>
            <Switch
              value={arrival.on}
              onValueChange={arrival.toggle}
              disabled={arrival.busy}
              accessibilityLabel="도착 알림"
              accessibilityRole="switch"
            />
          </View>
          {arrival.needsSettings && (
            <View style={styles.row}>
              <Text style={[styles.caption, styles.grow]}>설정에서 위치를 &apos;항상 허용&apos;으로 바꿔주세요</Text>
              <Pill label="설정 열기" onPress={() => Linking.openSettings()} />
            </View>
          )}
        </Section>

        <Section title="약관">
          {TERMS.map((t) => (
            <Pressable key={t.label} onPress={() => Linking.openURL(t.url)} accessibilityRole="link" accessibilityLabel={t.label} hitSlop={8}>
              <Text style={styles.link}>{t.label}</Text>
            </Pressable>
          ))}
        </Section>

        <Pill label="로그아웃" onPress={confirmSignOut} />

        <Pressable
          onPress={confirmLeave}
          disabled={leaving}
          accessibilityRole="button"
          accessibilityLabel="계정 탈퇴"
          accessibilityState={{ disabled: leaving }}
          hitSlop={8}>
          <Text style={styles.leave}>{leaving ? '떠나는 중…' : '계정 탈퇴'}</Text>
        </Pressable>
        {leaveFailed && <Text style={styles.body}>지금은 떠날 수 없어요. 잠시 뒤 다시 해볼까요?</Text>}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.surface },
  content: { padding: space.gutter, gap: space.section },
  section: { gap: 8 },
  sectionTitle: { ...type.caption, color: color.inkSub },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  grow: { flex: 1 },
  big: { ...type.subtitle, color: color.ink, flex: 1 },
  body: { ...type.body, color: color.ink },
  caption: { ...type.caption, color: color.inkSub },
  cat: { width: 48, height: 48 },
  link: { ...type.body, color: color.primary, paddingVertical: 4 },
  leave: { ...type.caption, color: color.inkSub, textDecorationLine: 'underline' },
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
