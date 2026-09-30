// mobile/src/features/checkin/__tests__/Celebration.test.tsx
import { fireEvent, render, screen } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';
import { useReducedMotion } from 'react-native-reanimated';
import { Celebration } from '../Celebration';

jest.mock('expo-haptics', () => ({ notificationAsync: jest.fn(), NotificationFeedbackType: { Success: 'success' } }));
jest.mock('@/features/memories/MemoryButton', () => {
  const { Text } = require('react-native');
  return { MemoryButton: (p: { aidutId: string }) => <Text>memory:{p.aidutId}</Text> };
});
jest.mock('react-native-reanimated', () => ({ ...jest.requireActual('react-native-reanimated/mock'), useReducedMotion: jest.fn(() => false) }));

const T = { box: 2, hut: 5, tower: 10, palace: 20 };
const up = { aidutId: 'a', name: '카페', footprintCount: 5, grade: 'hut' as const, gradeChanged: true, newCellsCleared: 0 };

beforeEach(() => jest.clearAllMocks());

test('등급업 문구·햅틱·닫기', async () => {
  const onClose = jest.fn();
  await render(<Celebration result={up} thresholds={T} onClose={onClose} />);
  expect(screen.getByText('작은 집이 됐어요 🛖 자주 오시는군요.')).toBeTruthy();
  expect(screen.getByText('카페')).toBeTruthy();
  expect(Haptics.notificationAsync).toHaveBeenCalledWith('success');
  await fireEvent.press(screen.getByRole('button', { name: '좋아요' }));
  expect(onClose).toHaveBeenCalled();
});

test('같은 등급은 다음 단계 힌트까지', async () => {
  await render(<Celebration result={{ ...up, footprintCount: 6, gradeChanged: false }} thresholds={T} onClose={jest.fn()} />);
  expect(screen.getByText('🐾 발자국을 남겼어요')).toBeTruthy();
  expect(screen.getByText('4번 더 오면 캣타워가 돼요')).toBeTruthy();
});

test('모션 줄이기면 애니메이션 없이도 같은 내용', async () => {
  (useReducedMotion as jest.Mock).mockReturnValue(true);
  await render(<Celebration result={up} thresholds={T} onClose={jest.fn()} />);
  expect(screen.getByText('작은 집이 됐어요 🛖 자주 오시는군요.')).toBeTruthy();
});

test('동네 단계가 오르면 한 줄 더', async () => {
  await render(
    <Celebration result={{ ...up, dong: { name: '사직동', stage: 'sprout', stageChanged: true } }} thresholds={T} onClose={jest.fn()} />,
  );
  expect(screen.getByText('우리 동네가 이제 개척지가 됐어요 🌱')).toBeTruthy();
});

test('memory가 있으면 순간 남기기 버튼, 없으면 없음', async () => {
  const { rerender } = await render(<Celebration result={up} thresholds={T} onClose={jest.fn()} />);
  expect(screen.queryByText('memory:a')).toBeNull();
  await rerender(<Celebration result={up} thresholds={T} onClose={jest.fn()} memory={{ aidutId: 'a', fix: { lat: 1, lng: 2, accuracy: 3 } }} />);
  expect(screen.getByText('memory:a')).toBeTruthy();
});
