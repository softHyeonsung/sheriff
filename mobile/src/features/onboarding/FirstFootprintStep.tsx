// mobile/src/features/onboarding/FirstFootprintStep.tsx
// ③의 체크인 흐름을 그대로: 버튼 → 후보 시트 → 축하. 축하를 닫으면 온보딩 끝.
import { Linking, StyleSheet, Text } from 'react-native';
import { color, type } from '@/constants/tokens';
import { Celebration } from '@/features/checkin/Celebration';
import { CheckinSheet } from '@/features/checkin/CheckinSheet';
import { MSG } from '@/features/checkin/copy';
import { useCheckin } from '@/features/checkin/useCheckin';
import { askLocation, locationAsked } from './permissions';
import { PrimaryButton, StepScreen, TextButton } from './ui';

export function FirstFootprintStep({ onDone }: { onDone: (made: boolean) => void }) {
  const checkin = useCheckin();
  const { state } = checkin;
  const locating = state.name === 'locating';

  // "나중에" at the location step leaves it undetermined: ask now (the OS popup) instead of sending
  // the user to Settings, where iOS may not even list the app yet.
  const start = async () => {
    try {
      if (!(await locationAsked())) await askLocation();
    } catch (e) {
      console.warn('위치 권한 요청 실패', e);
    }
    checkin.start();
  };

  return (
    <StepScreen
      footer={
        <>
          <PrimaryButton label="발자국 남기기" onPress={start} disabled={locating} />
          {state.name === 'failed' && state.needsSettings && <TextButton label="설정 열기" onPress={() => Linking.openSettings()} />}
          <TextButton label="나중에 할게요" onPress={() => onDone(false)} />
        </>
      }>
      <Text style={styles.title} accessibilityRole="header">
        자, 지금 여기. 첫 발자국을 남겨볼까요?
      </Text>
      {locating && <Text style={styles.body}>{MSG.locating}</Text>}
      {state.name === 'failed' && <Text style={styles.body}>{state.message}</Text>}
      {state.name === 'choosing' && <CheckinSheet state={state} footprintsById={{}} onChoose={checkin.choose} onClose={checkin.close} />}
      {state.name === 'celebrating' && (
        <Celebration
          result={state.result}
          thresholds={null}
          onClose={() => {
            checkin.close();
            onDone(true);
          }}
        />
      )}
    </StepScreen>
  );
}

const styles = StyleSheet.create({
  title: { ...type.title, color: color.ink, textAlign: 'center' },
  body: { ...type.body, color: color.ink, textAlign: 'center' },
});
