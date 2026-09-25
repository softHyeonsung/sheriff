// mobile/src/app/login.tsx
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { color, font, kakao, radius, space, type } from '@/constants/tokens';
import { FogReveal } from '@/features/auth/FogReveal';
import { signInWithKakao } from '@/features/auth/kakaoLogin';

// The native Kakao SDKs report a user-dismissed login as a "Cancelled" error. Backing out
// is a choice, not a failure, so it gets no error message.
const isCancel = (e: unknown) => /cancel/i.test(String((e as Error)?.message ?? e));

// ponytail: bubble drawn from Views; replace with the official symbol from Kakao's
// login-button resource pack before store submission (their guide forbids altering it).
function KakaoSymbol() {
  return (
    <View style={styles.symbol}>
      <View style={styles.symbolBubble} />
      <View style={styles.symbolTail} />
    </View>
  );
}

export default function LoginScreen() {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const onPress = async () => {
    setBusy(true);
    setFailed(false);
    try {
      await signInWithKakao();
      router.replace('/profile');
    } catch (e) {
      if (!isCancel(e)) {
        console.error('카카오 로그인 실패', e);
        setFailed(true);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <FogReveal />
      <View style={styles.body}>
        <Text style={styles.headline} accessibilityRole="header">
          저랑 같이 우리 동네를{'\n'}누벼볼까요?
        </Text>
        <Text style={styles.lede}>다녀온 곳마다 발자국이 남고,{'\n'}그 자리부터 안개가 걷혀요.</Text>

        <Pressable
          onPress={onPress}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="카카오로 시작하기"
          accessibilityState={{ busy, disabled: busy }}
          style={({ pressed }) => [styles.kakao, pressed && styles.kakaoPressed]}>
          {busy ? <ActivityIndicator color={kakao.symbol} /> : <KakaoSymbol />}
          <Text style={styles.kakaoLabel}>카카오로 시작하기</Text>
        </Pressable>

        <Text style={styles.error} accessibilityLiveRegion="polite">
          {failed ? '앗, 잠깐 문제가 생겼어요. 다시 해볼까요?' : ' '}
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.surface },
  body: { paddingHorizontal: space.gutter, paddingTop: space.section },
  headline: { ...type.display, color: color.ink },
  lede: { ...type.body, color: color.inkSub, marginTop: 8 },
  kakao: {
    marginTop: 32,
    height: 52,
    borderRadius: radius.btn,
    backgroundColor: kakao.container,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  kakaoPressed: { opacity: 0.8 },
  kakaoLabel: { fontFamily: font.semibold, fontSize: 16, color: kakao.label },
  error: { ...type.caption, color: color.ink, marginTop: 12, minHeight: 18 },
  symbol: { width: 20, height: 20, justifyContent: 'center' },
  symbolBubble: { width: 20, height: 17, borderRadius: 10, backgroundColor: kakao.symbol },
  symbolTail: {
    position: 'absolute',
    left: 4,
    bottom: 0,
    width: 0,
    height: 0,
    borderLeftWidth: 3,
    borderRightWidth: 3,
    borderTopWidth: 6,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: kakao.symbol,
    transform: [{ rotate: '20deg' }],
  },
});
