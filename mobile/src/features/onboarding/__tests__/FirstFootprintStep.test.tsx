// mobile/src/features/onboarding/__tests__/FirstFootprintStep.test.tsx
/* eslint-disable @typescript-eslint/no-explicit-any -- loosely typed test doubles */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { useCheckin } from '@/features/checkin/useCheckin';
import { FirstFootprintStep } from '../FirstFootprintStep';

jest.mock('@/features/checkin/useCheckin', () => ({ useCheckin: jest.fn() }));
let mockCelebrationProps: Record<string, any> = {};
jest.mock('@/features/checkin/CheckinSheet', () => {
  const { View } = require('react-native');
  return { CheckinSheet: () => <View testID="checkin-sheet" /> };
});
jest.mock('@/features/checkin/Celebration', () => {
  const { View } = require('react-native');
  return { Celebration: (p: any) => { mockCelebrationProps = p; return <View testID="celebration" />; } };
});

const api = (state: object) => {
  const a = { state, start: jest.fn(), choose: jest.fn(), close: jest.fn() };
  (useCheckin as jest.Mock).mockReturnValue(a);
  return a;
};

test('발자국 남기기 → 체크인 시작', async () => {
  const a = api({ name: 'idle' });
  await render(<FirstFootprintStep onDone={jest.fn()} />);
  expect(screen.getByText('자, 지금 여기. 첫 발자국을 남겨볼까요?')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: '발자국 남기기' }));
  expect(a.start).toHaveBeenCalled();
});

test('축하를 닫으면 끝(찍음)', async () => {
  const a = api({ name: 'celebrating', result: { aidutId: 'a', name: '여기', footprintCount: 1, grade: 'paw', gradeChanged: false, newCellsCleared: 1 } });
  const onDone = jest.fn();
  await render(<FirstFootprintStep onDone={onDone} />);
  await act(async () => mockCelebrationProps.onClose());
  expect(a.close).toHaveBeenCalled();
  expect(onDone).toHaveBeenCalledWith(true);
});

test('실패(권한 없음) → 안내 + 설정 열기 + 나중에 할게요', async () => {
  api({ name: 'failed', message: '위치가 꺼져 있어서 발자국을 남기기 어려워요. 켜두시면 제가 도와드릴게요.', needsSettings: true });
  const onDone = jest.fn();
  await render(<FirstFootprintStep onDone={onDone} />);
  expect(screen.getByText('위치가 꺼져 있어서 발자국을 남기기 어려워요. 켜두시면 제가 도와드릴게요.')).toBeTruthy();
  expect(screen.getByRole('button', { name: '설정 열기' })).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: '나중에 할게요' }));
  expect(onDone).toHaveBeenCalledWith(false);
});

test('후보 고르는 중엔 시트', async () => {
  api({ name: 'choosing', fix: { lat: 1, lng: 2, accuracy: 3 }, hereAddress: null, candidates: [], busy: false, error: null });
  await render(<FirstFootprintStep onDone={jest.fn()} />);
  expect(screen.getByTestId('checkin-sheet')).toBeTruthy();
});
