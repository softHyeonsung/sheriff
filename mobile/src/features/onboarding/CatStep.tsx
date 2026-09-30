// mobile/src/features/onboarding/CatStep.tsx
import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { color, font, radius, type } from '@/constants/tokens';
import { MSG } from '@/features/checkin/copy';
import { catArt } from '@/map/catArt';
import { CAT_COLOR_LABEL, CAT_COLORS, type CatColor } from '@/map/catColors';
import { saveCat } from './onboardingApi';
import { PrimaryButton, StepScreen } from './ui';

// 서버(save_cat)와 같은 규칙: 앞뒤 공백 제거 후 1~10자, 이모지 1개 = 1자.
const valid = (name: string) => {
  const n = Array.from(name.trim()).length;
  return n >= 1 && n <= 10;
};

export function CatStep({
  onDone,
  initialName = '',
  initialColor = 'cheese',
  cta = '이 친구로 할게요',
  onBack,
}: {
  onDone: (name: string, color: CatColor) => void;
  initialName?: string;
  initialColor?: CatColor;
  cta?: string;
  onBack?: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [coat, setCoat] = useState<CatColor>(initialColor);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const ok = valid(name);

  const submit = async () => {
    if (!ok || saving) return;
    setSaving(true);
    setError(false);
    try {
      await saveCat(name.trim(), coat);
      onDone(name.trim(), coat);
    } catch (e) {
      console.error('고양이 저장 실패', e);
      setError(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <StepScreen onBack={onBack} footer={<PrimaryButton label={cta} onPress={submit} disabled={!ok || saving} />}>
      <Image testID="cat-preview" source={{ uri: catArt(coat, 'sit') }} style={styles.cat} />
      <Text style={styles.title} accessibilityRole="header">
        이 친구, 이름을 지어줄래요? 털색도 골라봐요.
      </Text>
      <TextInput
        value={name}
        onChangeText={setName}
        accessibilityLabel="고양이 이름"
        placeholder="나비"
        placeholderTextColor={color.inkSub}
        style={styles.input}
        returnKeyType="done"
        onSubmitEditing={submit}
      />
      {!ok && <Text style={styles.hint}>이름은 1~10자로 지어주세요</Text>}
      <View style={styles.coats} accessibilityRole="radiogroup">
        {CAT_COLORS.map((c) => (
          <Pressable
            key={c}
            onPress={() => setCoat(c)}
            accessibilityRole="radio"
            accessibilityLabel={CAT_COLOR_LABEL[c]}
            accessibilityState={{ selected: coat === c }}
            style={[styles.coat, coat === c && styles.coatOn]}>
            <Image source={{ uri: catArt(c, 'sit') }} style={styles.coatArt} />
            <Text style={styles.coatLabel}>{CAT_COLOR_LABEL[c]}</Text>
          </Pressable>
        ))}
      </View>
      {error && <Text style={styles.error}>{MSG.unknown}</Text>}
    </StepScreen>
  );
}

const styles = StyleSheet.create({
  cat: { width: 120, height: 120 },
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
  hint: { ...type.caption, color: color.inkSub },
  coats: { flexDirection: 'row', gap: 12 },
  coat: { alignItems: 'center', padding: 8, borderRadius: radius.card, borderWidth: 2, borderColor: 'transparent' },
  coatOn: { borderColor: color.primary, backgroundColor: color.surfaceCard },
  coatArt: { width: 56, height: 56 },
  coatLabel: { ...type.caption, color: color.ink },
  error: { ...type.body, color: color.ink, textAlign: 'center' },
});
