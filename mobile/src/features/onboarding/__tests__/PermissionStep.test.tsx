// mobile/src/features/onboarding/__tests__/PermissionStep.test.tsx
import { fireEvent, render, screen } from '@testing-library/react-native';
import { PermissionStep } from '../PermissionStep';

test('켜기 → 요청 후 다음으로(거절해도 다음으로)', async () => {
  const ask = jest.fn().mockResolvedValue(false);
  const onDone = jest.fn();
  await render(<PermissionStep text="위치를 켜주실래요?" ask={ask} onDone={onDone} />);
  await fireEvent.press(screen.getByRole('button', { name: '켜기' }));
  expect(ask).toHaveBeenCalled();
  expect(onDone).toHaveBeenCalled();
});

test('요청이 실패해도 다음으로', async () => {
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  const onDone = jest.fn();
  await render(<PermissionStep text="t" ask={() => Promise.reject(new Error('x'))} onDone={onDone} />);
  await fireEvent.press(screen.getByRole('button', { name: '켜기' }));
  expect(onDone).toHaveBeenCalled();
});

test('나중에 → 요청 없이 다음으로', async () => {
  const ask = jest.fn();
  const onDone = jest.fn();
  await render(<PermissionStep text="t" ask={ask} onDone={onDone} />);
  await fireEvent.press(screen.getByRole('button', { name: '나중에' }));
  expect(ask).not.toHaveBeenCalled();
  expect(onDone).toHaveBeenCalled();
});
