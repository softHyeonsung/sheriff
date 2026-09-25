import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { signInWithKakao } from '@/features/auth/kakaoLogin';
import LoginScreen from '../login';

jest.mock('@/features/auth/kakaoLogin', () => ({ signInWithKakao: jest.fn() }));
jest.mock('expo-router', () => ({ router: { replace: jest.fn() } }));
// Decorative hero; reanimated's jest mock has no useReducedMotion.
jest.mock('@/features/auth/FogReveal', () => ({ FogReveal: () => null }));

const ERROR = '앗, 잠깐 문제가 생겼어요. 다시 해볼까요?';
const signIn = signInWithKakao as jest.Mock;

beforeEach(() => jest.clearAllMocks());

test('로그인에 성공하면 프로필로 간다', async () => {
  signIn.mockResolvedValue(undefined);
  await render(<LoginScreen />);
  await fireEvent.press(screen.getByRole('button', { name: '카카오로 시작하기' }));
  await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/profile'));
  expect(screen.queryByText(ERROR)).toBeNull();
});

test('사용자가 카카오 로그인을 취소하면 에러를 띄우지 않는다', async () => {
  signIn.mockRejectedValue(new Error('ClientError(reason=Cancelled)'));
  await render(<LoginScreen />);
  await fireEvent.press(screen.getByRole('button', { name: '카카오로 시작하기' }));
  await waitFor(() => expect(signIn).toHaveBeenCalled());
  expect(screen.queryByText(ERROR)).toBeNull();
  expect(router.replace).not.toHaveBeenCalled();
});

test('진짜 실패면 다시 해보라는 안내를 띄운다', async () => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  signIn.mockRejectedValue(new Error('kakao-custom-token failed: 500'));
  await render(<LoginScreen />);
  await fireEvent.press(screen.getByRole('button', { name: '카카오로 시작하기' }));
  expect(await screen.findByText(ERROR)).toBeTruthy();
});
