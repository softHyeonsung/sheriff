import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { exchangeKakaoToken, loginWithKakao } from '@/features/auth/kakaoLogin';
import LoginScreen from '../login';

jest.mock('@/features/auth/kakaoLogin', () => ({ loginWithKakao: jest.fn(), exchangeKakaoToken: jest.fn() }));
jest.mock('expo-router', () => ({ router: { replace: jest.fn() } }));
jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn() }));
// Decorative hero; reanimated's jest mock has no useReducedMotion.
jest.mock('@/features/auth/FogReveal', () => ({ FogReveal: () => null }));

const ERROR = '앗, 잠깐 문제가 생겼다냥. 다시 해볼까냥?';
const SHEET_TITLE = '시작하기 전에 확인해 달라냥';
const login = loginWithKakao as jest.Mock;
const exchange = exchangeKakaoToken as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  login.mockResolvedValue('kakao-token');
});

const tapKakao = async () => fireEvent.press(screen.getByRole('button', { name: '카카오로 시작하기' }));
const agreeAll = async () => {
  await fireEvent.press(screen.getByRole('checkbox', { name: '모두 동의할게요' }));
  await fireEvent.press(screen.getByRole('button', { name: '동의하고 시작하기' }));
};

test('이미 동의한 사용자는 시트 없이 지도로', async () => {
  exchange.mockResolvedValue({ status: 'signed_in' });
  await render(<LoginScreen />);
  await tapKakao();
  await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/'));
  expect(screen.queryByText(SHEET_TITLE)).toBeNull();
});

test('신규 사용자는 시트 → 동의하면 같은 토큰+서버 버전으로 재요청 → 프로필', async () => {
  exchange.mockResolvedValueOnce({ status: 'terms_required', termsVersion: '2026-09-25' }).mockResolvedValueOnce({ status: 'signed_in' });
  await render(<LoginScreen />);
  await tapKakao();
  expect(await screen.findByText(SHEET_TITLE)).toBeTruthy();
  await agreeAll();
  await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/'));
  expect(exchange).toHaveBeenLastCalledWith('kakao-token', '2026-09-25');
  expect(login).toHaveBeenCalledTimes(1); // 카카오 재로그인 없음
});

test('재요청 실패 — 시트는 열린 채 안내가 보이고, 다시 누르면 같은 토큰으로 재시도', async () => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  exchange
    .mockResolvedValueOnce({ status: 'terms_required', termsVersion: '2026-09-25' })
    .mockRejectedValueOnce(new Error('Network request failed'))
    .mockResolvedValueOnce({ status: 'signed_in' });
  await render(<LoginScreen />);
  await tapKakao();
  await screen.findByText(SHEET_TITLE);
  await agreeAll();
  expect(await screen.findByText(ERROR)).toBeTruthy();
  expect(screen.getByText(SHEET_TITLE)).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: '동의하고 시작하기' })); // 체크 유지됨
  await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/'));
  expect(exchange).toHaveBeenLastCalledWith('kakao-token', '2026-09-25');
});

test('시트를 닫으면 로그인 화면으로 돌아오고 다음 탭은 새 카카오 로그인', async () => {
  exchange.mockResolvedValue({ status: 'terms_required', termsVersion: '2026-09-25' });
  await render(<LoginScreen />);
  await tapKakao();
  await screen.findByText(SHEET_TITLE);
  await fireEvent.press(screen.getByRole('button', { name: '닫기' }));
  await waitFor(() => expect(screen.queryByText(SHEET_TITLE)).toBeNull());
  await tapKakao();
  await waitFor(() => expect(login).toHaveBeenCalledTimes(2));
  expect(router.replace).not.toHaveBeenCalled();
});

test('동의 후 다음 신규 로그인에서는 체크가 비어 있다 (미리 체크된 동의 금지)', async () => {
  login.mockResolvedValueOnce('token-a').mockResolvedValueOnce('token-b');
  exchange
    .mockResolvedValueOnce({ status: 'terms_required', termsVersion: '2026-09-25' })
    .mockResolvedValueOnce({ status: 'signed_in' })
    .mockResolvedValueOnce({ status: 'terms_required', termsVersion: '2026-09-25' });
  await render(<LoginScreen />);
  await tapKakao();
  await screen.findByText(SHEET_TITLE);
  await agreeAll();
  await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/'));
  await tapKakao();
  await screen.findByText(SHEET_TITLE);
  expect(screen.getByRole('checkbox', { name: '모두 동의할게요', checked: false })).toBeTruthy();
  expect(screen.getByRole('button', { name: '동의하고 시작하기', disabled: true })).toBeTruthy();
});

test('사용자가 카카오 로그인을 취소하면 에러를 띄우지 않는다', async () => {
  login.mockRejectedValue(new Error('ClientError(reason=Cancelled)'));
  await render(<LoginScreen />);
  await tapKakao();
  await waitFor(() => expect(login).toHaveBeenCalled());
  expect(screen.queryByText(ERROR)).toBeNull();
  expect(exchange).not.toHaveBeenCalled();
});

test('진짜 실패면 로그인 화면에 다시 해보라는 안내', async () => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  exchange.mockRejectedValue(new Error('kakao-custom-token failed: 500'));
  await render(<LoginScreen />);
  await tapKakao();
  expect(await screen.findByText(ERROR)).toBeTruthy();
});
