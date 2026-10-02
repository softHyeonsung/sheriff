// mobile/src/features/onboarding/__tests__/CatStep.test.tsx
import { fireEvent, render, screen } from '@testing-library/react-native';
import { saveCat } from '../onboardingApi';
import { CatStep } from '../CatStep';

jest.mock('../onboardingApi', () => ({ saveCat: jest.fn() }));
jest.mock('@/map/catArt', () => ({ catArt: (c: string, p: string) => `art:${c}:${p}` }));

beforeEach(() => jest.clearAllMocks());

const name = () => screen.getByLabelText('고양이 이름');
const submit = () => screen.getByRole('button', { name: '이 친구로 할게요' });

test('이름·털색을 저장하고 넘어간다', async () => {
  (saveCat as jest.Mock).mockResolvedValue(undefined);
  const onDone = jest.fn();
  await render(<CatStep onDone={onDone} />);
  expect(screen.getByText('이 친구, 이름을 지어줄래냥? 털색도 골라보라냥.')).toBeTruthy();
  await fireEvent.changeText(name(), '  나비 ');
  await fireEvent.press(screen.getByRole('radio', { name: '하양' }));
  expect(screen.getByRole('radio', { name: '하양', selected: true })).toBeTruthy();
  await fireEvent.press(submit());
  expect(saveCat).toHaveBeenCalledWith('나비', 'white');
  expect(onDone).toHaveBeenCalledWith('나비', 'white');
});

test('공백만이면 비활성 + 안내, 10자 넘어도', async () => {
  await render(<CatStep onDone={jest.fn()} />);
  await fireEvent.changeText(name(), '   ');
  expect(submit().props.accessibilityState).toMatchObject({ disabled: true });
  expect(screen.getByText('이름은 1~10자로 지어달라냥')).toBeTruthy();
  await fireEvent.changeText(name(), '열한글자짜리이름입니다');
  expect(submit().props.accessibilityState).toMatchObject({ disabled: true });
  await fireEvent.changeText(name(), '🐱');
  expect(submit().props.accessibilityState).toMatchObject({ disabled: false });
});

test('저장 실패 → 입력 유지 + 오류 + 다시 누를 수 있음', async () => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  (saveCat as jest.Mock).mockRejectedValueOnce(new Error('net')).mockResolvedValueOnce(undefined);
  const onDone = jest.fn();
  await render(<CatStep onDone={onDone} />);
  await fireEvent.changeText(name(), '나비');
  await fireEvent.press(submit());
  expect(screen.getByText('앗, 잠깐 문제가 생겼다냥. 다시 해볼까냥?')).toBeTruthy();
  expect(name().props.value).toBe('나비');
  expect(onDone).not.toHaveBeenCalled();
  await fireEvent.press(submit());
  expect(onDone).toHaveBeenCalledWith('나비', 'cheese');
});

test('설정에서는 지금 이름·털색으로 시작하고 버튼 문구가 다르다', async () => {
  (saveCat as jest.Mock).mockResolvedValue(undefined);
  const onDone = jest.fn();
  await render(<CatStep onDone={onDone} initialName="나비" initialColor="mackerel" cta="저장할게요" />);
  expect(name().props.value).toBe('나비');
  expect(screen.getByRole('radio', { name: '고등어', selected: true })).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: '저장할게요' }));
  expect(onDone).toHaveBeenCalledWith('나비', 'mackerel');
});

test('세 마리가 앉은 그림으로 보이고, 고른 고양이가 크게', async () => {
  await render(<CatStep onDone={jest.fn()} />);
  await fireEvent.press(screen.getByRole('radio', { name: '하양' }));
  expect(screen.getByTestId('cat-preview').props.source).toEqual({ uri: 'art:white:sit' });
  expect(screen.getByRole('radio', { name: '고등어' })).toBeTruthy();
});
