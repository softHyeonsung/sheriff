// mobile/src/features/onboarding/HomeDongStep.tsx
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from 'react-native';
import { color, font, radius, type } from '@/constants/tokens';
import { getFreshFix } from '@/features/checkin/checkinApi';
import { MSG } from '@/features/checkin/copy';
import { regionAt, searchRegion, setHomeDong } from './onboardingApi';
import { PrimaryButton, StepScreen, TextButton } from './ui';

const GUESS_TIMEOUT_MS = 10000; // GPS가 멈춰도 검색으로 넘어간다

function within<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('timeout')), ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}

type Mode = { name: 'guessing' } | { name: 'confirm'; dong: string } | { name: 'search' };

export function HomeDongStep({ onDone }: { onDone: (name: string) => void }) {
  const [mode, setMode] = useState<Mode>({ name: 'guessing' });
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        // One deadline for the whole guess (GPS + lookup), not just the fix.
        const dongs = await within(
          getFreshFix().then((fix) => (fix === 'denied' ? [] : regionAt(fix))),
          GUESS_TIMEOUT_MS,
        );
        if (alive) setMode(dongs[0] ? { name: 'confirm', dong: dongs[0] } : { name: 'search' });
      } catch (e) {
        console.warn('동네 추정 실패', e);
        if (alive) setMode({ name: 'search' });
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const save = async (dong: string) => {
    if (busy) return;
    setBusy(true);
    setError(false);
    try {
      await setHomeDong(dong);
      onDone(dong);
    } catch (e) {
      console.error('동네 저장 실패', e);
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  const search = async () => {
    const q = query.trim();
    if (!q || busy) return;
    setBusy(true);
    setError(false);
    try {
      setResults(await searchRegion(q));
    } catch (e) {
      console.error('동네 검색 실패', e);
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  if (mode.name === 'guessing') {
    return (
      <StepScreen>
        <ActivityIndicator color={color.primary} />
      </StepScreen>
    );
  }

  if (mode.name === 'confirm') {
    return (
      <StepScreen
        footer={
          <>
            <PrimaryButton label="맞아요" onPress={() => save(mode.dong)} disabled={busy} />
            <TextButton label="다른 동네예요" onPress={() => setMode({ name: 'search' })} />
          </>
        }>
        <Text style={styles.title} accessibilityRole="header">
          여기가 우리 동네가 맞나요?
        </Text>
        <Text style={styles.dong}>{mode.dong}</Text>
        {error && <Text style={styles.body}>{MSG.unknown}</Text>}
      </StepScreen>
    );
  }

  return (
    <StepScreen>
      <Text style={styles.title} accessibilityRole="header">
        우리 동네 이름을 알려주세요
      </Text>
      <View style={styles.row}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          accessibilityLabel="동네 이름"
          placeholder="사직동"
          placeholderTextColor={color.inkSub}
          style={styles.input}
          returnKeyType="search"
          onSubmitEditing={search}
        />
        <View style={styles.find}>
          <PrimaryButton label="찾기" onPress={search} disabled={busy || !query.trim()} />
        </View>
      </View>
      {results?.length === 0 && <Text style={styles.body}>음, 못 찾았어요. 다른 이름으로 찾아볼까요?</Text>}
      {results?.map((d) => (
        <TextButton key={d} label={d} onPress={() => save(d)} />
      ))}
      {error && <Text style={styles.body}>{MSG.unknown}</Text>}
    </StepScreen>
  );
}

const styles = StyleSheet.create({
  title: { ...type.title, color: color.ink, textAlign: 'center' },
  dong: { ...type.subtitle, color: color.primaryDeep, textAlign: 'center' },
  body: { ...type.body, color: color.ink, textAlign: 'center' },
  row: { alignSelf: 'stretch', flexDirection: 'row', gap: 8 },
  input: {
    flex: 1,
    height: 52,
    borderRadius: radius.btn,
    borderWidth: 1,
    borderColor: color.line,
    backgroundColor: color.surfaceCard,
    paddingHorizontal: 16,
    fontFamily: font.regular,
    fontSize: 16,
    color: color.ink,
  },
  find: { width: 88 },
});
