// mobile/src/features/onboarding/__tests__/Tutorial.test.tsx
import { fireEvent, render, screen } from '@testing-library/react-native';
import { useMeStore } from '@/stores/meStore';
import { Tutorial } from '../Tutorial';

jest.mock('@/map/catArt', () => ({ catArt: (c: string, p: string) => `art:${c}:${p}` }));

test('세 컷을 넘기고 마지막에 알겠어요', async () => {
  const onDone = jest.fn();
  await render(<Tutorial onDone={onDone} />);
  expect(screen.getByText('다녀온 곳에 발자국을 남기고')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: '다음' }));
  expect(screen.getByText('발자국이 쌓이면 아지트가 자란다냥')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: '다음' }));
  expect(screen.getByText('안개가 걷히면 내가 뛰어놀 곳이 넓어진다냥.')).toBeTruthy();
  expect(onDone).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: '알겠어요' }));
  expect(onDone).toHaveBeenCalled();
});

test('세 번째 장은 내 고양이가 걷는 그림', async () => {
  useMeStore.setState({ me: { onboarded: false, nickname: 'n', catName: '나비', catColor: 'mackerel', homeDong: null, hasHideout: false } });
  await render(<Tutorial onDone={jest.fn()} />);
  await fireEvent.press(screen.getByRole('button', { name: '다음' }));
  await fireEvent.press(screen.getByRole('button', { name: '다음' }));
  expect(screen.getByTestId('tutorial-art').props.source).toEqual({ uri: 'art:mackerel:walk' });
});
