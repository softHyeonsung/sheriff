// mobile/src/features/onboarding/__tests__/Tutorial.test.tsx
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Tutorial } from '../Tutorial';

test('세 컷을 넘기고 마지막에 알겠어요', async () => {
  const onDone = jest.fn();
  await render(<Tutorial onDone={onDone} />);
  expect(screen.getByText('다녀온 곳에 발자국을 남기고')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: '다음' }));
  expect(screen.getByText('발자국이 쌓이면 아지트가 자라요')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: '다음' }));
  expect(screen.getByText('안개가 걷히면 제가 뛰어놀 곳이 넓어져요.')).toBeTruthy();
  expect(onDone).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: '알겠어요' }));
  expect(onDone).toHaveBeenCalled();
});
