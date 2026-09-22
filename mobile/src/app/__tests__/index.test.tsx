import { render, screen } from '@testing-library/react-native';
import Index from '../index';

test('홈 화면이 크래시 없이 렌더된다', () => {
  render(<Index />);
  expect(screen).toBeDefined();
});
