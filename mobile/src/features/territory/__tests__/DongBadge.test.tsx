import { render, screen } from '@testing-library/react-native';
import { DongBadge } from '../DongBadge';

test('동 · 단계 · 개척률', async () => {
  await render(<DongBadge dong={{ code: '1', name: '사직동', stage: 'sprout', hideoutCount: 3, exploredCells: 12, totalCells: 100, ratio: 12 }} />);
  expect(screen.getByLabelText('사직동 · 🌱 개척지 · 개척률 12%')).toBeTruthy();
  expect(screen.getByText('사직동')).toBeTruthy();
});

test('null이면 안 그린다', async () => {
  await render(<DongBadge dong={null} />);
  expect(screen.toJSON()).toBeNull();
});
