// mobile/src/features/onboarding/NicknameStep.tsx
// 닉네임 정하기(온보딩·프로필 설정 공용). 추천으로 시작하고 🎲로 계속 새로 뽑는다.
import { useState } from 'react';
import { StyleSheet, Text, TextInput } from 'react-native';
import { color, font, radius, type } from '@/constants/tokens';
import { MSG } from '@/features/checkin/copy';
import { randomNickname, validNickname } from '@/features/profile/nickname';
import { setNickname } from './onboardingApi';
import { PrimaryButton, StepScreen, TextButton } from './ui';

export const NICKNAME_MSG = {
  invalid: '2~12자의 한글·영문·숫자·_ 로 지어달라냥.',
  taken: '다른 집사가 쓰고 있다냥. 다른 이름은 어떠냥?',
};

type Props = { onDone: (name: string) => void; initial?: string; cta?: string; onBack?: () => void };

export function NicknameStep({ onDone, initial, cta = '이걸로 할게요', onBack }: Props) {
  const [name, setName] = useState(() => initial ?? randomNickname());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ok = validNickname(name);

  const reroll = () => {
    setName((n) => randomNickname(n));
    setError(null);
  };

  const submit = async () => {
    if (!ok || saving) return;
    const n = name.trim();
    setSaving(true);
    setError(null);
    try {
      await setNickname(n);
      onDone(n);
    } catch (e) {
      const code = (e as { message?: unknown } | null)?.message;
      if (code === 'nickname_taken') {
        setError(NICKNAME_MSG.taken);
        setName(randomNickname(n)); // 바로 쓸 수 있는 새 추천
      } else if (code === 'invalid_nickname') {
        setError(NICKNAME_MSG.invalid);
      } else {
        console.error('닉네임 저장 실패', e);
        setError(MSG.unknown);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <StepScreen onBack={onBack} footer={<PrimaryButton label={cta} onPress={submit} disabled={!ok || saving} />}>
      <Text style={styles.title} accessibilityRole="header">
        뭐라고 부를까냥?
      </Text>
      <TextInput
        value={name}
        onChangeText={(t) => {
          setName(t);
          setError(null);
        }}
        accessibilityLabel="닉네임"
        maxLength={20}
        autoCorrect={false}
        style={styles.input}
        returnKeyType="done"
        onSubmitEditing={submit}
      />
      <TextButton label="🎲 다른 이름" onPress={reroll} />
      <Text style={styles.hint}>2~12자, 한글·영문·숫자·_</Text>
      {!ok && !error && <Text style={styles.hint}>{NICKNAME_MSG.invalid}</Text>}
      {error && <Text style={styles.error}>{error}</Text>}
    </StepScreen>
  );
}

const styles = StyleSheet.create({
  title: { ...type.subtitle, color: color.ink, textAlign: 'center' },
  input: {
    alignSelf: 'stretch',
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
  hint: { ...type.caption, color: color.inkSub, textAlign: 'center' },
  error: { ...type.body, color: color.ink, textAlign: 'center' },
});
