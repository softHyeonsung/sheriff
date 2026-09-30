// mobile/src/features/onboarding/__tests__/NicknameStep.test.tsx
import { fireEvent, render, screen } from '@testing-library/react-native';
import { randomNickname } from '@/features/profile/nickname';
import { setNickname } from '../onboardingApi';
import { NicknameStep } from '../NicknameStep';

jest.mock('../onboardingApi', () => ({ setNickname: jest.fn() }));
jest.mock('@/features/profile/nickname', () => ({
  ...jest.requireActual('@/features/profile/nickname'),
  randomNickname: jest.fn(),
}));

const input = () => screen.getByLabelText('닉네임');
const save = (label = '이걸로 할게요') => screen.getByRole('button', { name: label });

beforeEach(() => {
  jest.clearAllMocks();
  (randomNickname as jest.Mock).mockReturnValueOnce('졸린식빵').mockReturnValueOnce('용감한고등어').mockReturnValue('느긋한털뭉치');
  (setNickname as jest.Mock).mockResolvedValue(undefined);
});

test('처음부터 추천이 채워져 있고, 🎲 다른 이름으로 계속 바꿀 수 있다', async () => {
  await render(<NicknameStep onDone={jest.fn()} />);
  expect(screen.getByText('뭐라고 불러드릴까요?')).toBeTruthy();
  expect(input().props.value).toBe('졸린식빵');
  await fireEvent.press(screen.getByRole('button', { name: '🎲 다른 이름' }));
  expect(input().props.value).toBe('용감한고등어');
  expect(randomNickname).toHaveBeenLastCalledWith('졸린식빵');
  await fireEvent.press(screen.getByRole('button', { name: '🎲 다른 이름' }));
  expect(input().props.value).toBe('느긋한털뭉치');
});

test('저장하면 앞뒤 공백 없이 보내고 넘어간다', async () => {
  const onDone = jest.fn();
  await render(<NicknameStep onDone={onDone} />);
  await fireEvent.changeText(input(), '  나비집사 ');
  await fireEvent.press(save());
  expect(setNickname).toHaveBeenCalledWith('나비집사');
  expect(onDone).toHaveBeenCalledWith('나비집사');
});

test('규칙에 안 맞으면 저장 버튼 비활성 + 안내', async () => {
  await render(<NicknameStep onDone={jest.fn()} />);
  await fireEvent.changeText(input(), '공 백');
  expect(save().props.accessibilityState).toMatchObject({ disabled: true });
  expect(screen.getByText('2~12자의 한글·영문·숫자·_ 로 지어주세요.')).toBeTruthy();
});

test('겹치면 안내하고 새 추천을 채운다', async () => {
  (setNickname as jest.Mock).mockRejectedValue({ message: 'nickname_taken' });
  const onDone = jest.fn();
  await render(<NicknameStep onDone={onDone} />);
  await fireEvent.press(save());
  expect(screen.getByText('다른 집사가 쓰고 있어요. 다른 이름은 어때요?')).toBeTruthy();
  expect(input().props.value).toBe('용감한고등어');
  expect(onDone).not.toHaveBeenCalled();
});

test('그 밖의 실패는 공통 안내, 입력은 그대로', async () => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  (setNickname as jest.Mock).mockRejectedValue(new Error('network'));
  await render(<NicknameStep onDone={jest.fn()} />);
  await fireEvent.press(save());
  expect(screen.getByText('앗, 잠깐 문제가 생겼어요. 다시 해볼까요?')).toBeTruthy();
  expect(input().props.value).toBe('졸린식빵');
});

test('설정에서는 지금 닉네임으로 시작하고 버튼 문구가 다르다', async () => {
  await render(<NicknameStep onDone={jest.fn()} initial="나비집사" cta="저장할게요" />);
  expect(input().props.value).toBe('나비집사');
  expect(save('저장할게요')).toBeTruthy();
});
