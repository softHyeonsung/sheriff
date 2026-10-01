// mobile/src/features/auth/__tests__/TermsSheet.test.tsx
import { fireEvent, render, screen } from '@testing-library/react-native';
import * as WebBrowser from 'expo-web-browser';
import { TERMS_LINKS } from '@/constants/terms';
import { TermsSheet } from '../TermsSheet';

jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn(() => Promise.resolve()) }));

const REQUIRED = ['만 14세 이상이에요', '[필수] 이용약관', '[필수] 개인정보 수집·이용', '[필수] 위치기반서비스 이용약관'];
const AGREE = '동의하고 시작하기';
const props = { visible: true, busy: false, failed: false, onAgree: jest.fn(), onClose: jest.fn() };

beforeEach(() => jest.clearAllMocks());

test('필수 4개를 모두 체크하기 전엔 동의 버튼이 비활성', async () => {
  await render(<TermsSheet {...props} />);
  expect(screen.getByRole('button', { name: AGREE, disabled: true })).toBeTruthy();
  for (const label of REQUIRED.slice(0, 3)) await fireEvent.press(screen.getByRole('checkbox', { name: label }));
  expect(screen.getByRole('button', { name: AGREE, disabled: true })).toBeTruthy();
  await fireEvent.press(screen.getByRole('checkbox', { name: REQUIRED[3] }));
  await fireEvent.press(screen.getByRole('button', { name: AGREE, disabled: false }));
  expect(props.onAgree).toHaveBeenCalledTimes(1);
});

test('모두 동의가 전부 켜고 끈다', async () => {
  await render(<TermsSheet {...props} />);
  await fireEvent.press(screen.getByRole('checkbox', { name: '모두 동의할게요' }));
  for (const label of REQUIRED) expect(screen.getByRole('checkbox', { name: label, checked: true })).toBeTruthy();
  await fireEvent.press(screen.getByRole('checkbox', { name: '모두 동의할게요' }));
  for (const label of REQUIRED) expect(screen.getByRole('checkbox', { name: label, checked: false })).toBeTruthy();
});

test('처리 중엔 다 체크돼 있어도 동의 버튼이 비활성 (연타 방지)', async () => {
  await render(<TermsSheet {...props} busy />);
  await fireEvent.press(screen.getByRole('checkbox', { name: '모두 동의할게요' }));
  expect(screen.getByRole('button', { name: AGREE, disabled: true })).toBeTruthy();
});

test('보기는 약관 원문을 인앱 브라우저로 연다', async () => {
  await render(<TermsSheet {...props} />);
  await fireEvent.press(screen.getByRole('link', { name: '[필수] 위치기반서비스 이용약관 보기' }));
  expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith(TERMS_LINKS.location);
});

test('닫으면 체크가 초기화된다', async () => {
  const { rerender } = await render(<TermsSheet {...props} />);
  await fireEvent.press(screen.getByRole('checkbox', { name: '모두 동의할게요' }));
  await fireEvent.press(screen.getByRole('button', { name: '닫기' }));
  expect(props.onClose).toHaveBeenCalledTimes(1);
  await rerender(<TermsSheet {...props} />);
  expect(screen.getByRole('checkbox', { name: '모두 동의할게요', checked: false })).toBeTruthy();
});

test('실패하면 시트 안에 다시 해보라는 안내', async () => {
  await render(<TermsSheet {...props} failed />);
  expect(screen.getByText('앗, 잠깐 문제가 생겼어요. 다시 해볼까요?')).toBeTruthy();
});

test('저장 중엔 닫히지 않는다', async () => {
  const { rerender } = await render(<TermsSheet {...props} busy />);
  await fireEvent.press(screen.getByRole('button', { name: '닫기' }));
  expect(props.onClose).not.toHaveBeenCalled();
  await rerender(<TermsSheet {...props} />);
  await fireEvent.press(screen.getByRole('button', { name: '닫기' }));
  expect(props.onClose).toHaveBeenCalledTimes(1);
});
