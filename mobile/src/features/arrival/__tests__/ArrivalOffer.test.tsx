// mobile/src/features/arrival/__tests__/ArrivalOffer.test.tsx
import { fireEvent, render, screen } from '@testing-library/react-native';
import { ArrivalOffer } from '../ArrivalOffer';

test('문구와 두 버튼', async () => {
  const onAnswer = jest.fn();
  await render(<ArrivalOffer onAnswer={onAnswer} />);
  expect(screen.getByText('다음에 여기 오면 내가 알려줄까냥?')).toBeTruthy();
  expect(screen.getByText("앱을 안 켜도 알려주려면 위치를 '항상 허용'으로 바꿔달라냥.")).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: '좋아요' }));
  fireEvent.press(screen.getByRole('button', { name: '괜찮아요' }));
  expect(onAnswer.mock.calls).toEqual([[true], [false]]);
});
