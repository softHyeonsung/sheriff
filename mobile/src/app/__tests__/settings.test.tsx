// mobile/src/app/__tests__/settings.test.tsx
/* eslint-disable @typescript-eslint/no-explicit-any -- loosely typed test doubles */
import { act, render } from '@testing-library/react-native';
import { router } from 'expo-router';
import { useMeStore } from '@/stores/meStore';
import CatSettings from '../settings/cat';
import HomeSettings from '../settings/home';
import NicknameSettings from '../settings/nickname';

let mockProps: Record<string, any> = {};
jest.mock('expo-router', () => ({ router: { back: jest.fn() } }));
jest.mock('@/features/onboarding/NicknameStep', () => ({ NicknameStep: (p: any) => ((mockProps = p), null) }));
jest.mock('@/features/onboarding/CatStep', () => ({ CatStep: (p: any) => ((mockProps = p), null) }));
jest.mock('@/features/onboarding/HomeDongStep', () => ({ HomeDongStep: (p: any) => ((mockProps = p), null) }));

const me = { onboarded: true, nickname: '나비집사', catName: '나비', catColor: 'mackerel' as const, homeDong: '사직동', hasHideout: true };

beforeEach(() => {
  jest.clearAllMocks();
  useMeStore.setState({ me });
});

test('닉네임: 지금 값으로 시작, 저장하면 스토어·뒤로', async () => {
  await render(<NicknameSettings />);
  expect(mockProps).toMatchObject({ initial: '나비집사', cta: '저장할게요' });
  await act(async () => mockProps.onDone('용감한고등어'));
  expect(useMeStore.getState().me?.nickname).toBe('용감한고등어');
  expect(router.back).toHaveBeenCalled();
});

test('닉네임이 없던 계정은 추천으로 시작', async () => {
  useMeStore.setState({ me: { ...me, nickname: null } });
  await render(<NicknameSettings />);
  expect(mockProps.initial).toBeUndefined();
});

test('고양이: 지금 이름·털색으로 시작, 저장하면 스토어(지도 고양이 색)·뒤로', async () => {
  await render(<CatSettings />);
  expect(mockProps).toMatchObject({ initialName: '나비', initialColor: 'mackerel', cta: '저장할게요' });
  await act(async () => mockProps.onDone('치즈', 'cheese'));
  expect(useMeStore.getState().me).toMatchObject({ catName: '치즈', catColor: 'cheese' });
  expect(router.back).toHaveBeenCalled();
});

test('동네: 저장하면 스토어·뒤로', async () => {
  await render(<HomeSettings />);
  await act(async () => mockProps.onDone('서울특별시 종로구 사직동'));
  expect(useMeStore.getState().me?.homeDong).toBe('서울특별시 종로구 사직동');
  expect(router.back).toHaveBeenCalled();
});

test('세 화면 모두 저장하지 않고 돌아갈 수 있다(실수로 들어와도 동네가 바뀌지 않게)', async () => {
  for (const Screen of [NicknameSettings, CatSettings, HomeSettings]) {
    (router.back as jest.Mock).mockClear();
    const { unmount } = await render(<Screen />);
    await act(async () => mockProps.onBack());
    expect(router.back).toHaveBeenCalledTimes(1);
    expect(useMeStore.getState().me).toEqual(me);
    await unmount();
  }
});
