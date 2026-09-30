// mobile/src/app/__tests__/onboarding.test.tsx
/* eslint-disable @typescript-eslint/no-explicit-any -- loosely typed test doubles */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { useMeStore } from '@/stores/meStore';
import { completeOnboarding } from '@/features/onboarding/onboardingApi';
import { locationAsked, notificationsAsked } from '@/features/onboarding/permissions';
import Onboarding from '../onboarding';

jest.mock('@/features/onboarding/onboardingApi', () => ({ completeOnboarding: jest.fn() }));
jest.mock('@/features/onboarding/permissions', () => ({
  locationAsked: jest.fn(), notificationsAsked: jest.fn(), askLocation: jest.fn(), askNotifications: jest.fn(),
}));
// 각 조각은 "지금 이 단계" 표시 + onDone만 — 조각 자체는 각자 테스트에서.
let mockProps: Record<string, any> = {};
const stub = (id: string) => function Stub(p: any) {
  const { Text } = require('react-native');
  mockProps = p;
  return <Text testID="step">{id}</Text>;
};
jest.mock('@/features/onboarding/Welcome', () => ({ Welcome: (p: any) => stub('welcome')(p) }));
jest.mock('@/features/onboarding/NicknameStep', () => ({ NicknameStep: (p: any) => stub('nickname')(p) }));
jest.mock('@/features/onboarding/CatStep', () => ({ CatStep: (p: any) => stub('cat')(p) }));
jest.mock('@/features/onboarding/PermissionStep', () => ({ PermissionStep: (p: any) => stub(`perm:${p.text.slice(0, 5)}`)(p) }));
jest.mock('@/features/onboarding/HomeDongStep', () => ({ HomeDongStep: (p: any) => stub('homeDong')(p) }));
jest.mock('@/features/onboarding/Tutorial', () => ({ Tutorial: (p: any) => stub('tutorial')(p) }));
jest.mock('@/features/onboarding/FirstFootprintStep', () => ({ FirstFootprintStep: (p: any) => stub('firstFootprint')(p) }));

const fresh = { onboarded: false, nickname: null, catName: null, catColor: null, homeDong: null, hasHideout: false };
const current = () => screen.getByTestId('step').props.children;
const done = async (...args: unknown[]) => act(async () => mockProps.onDone(...args));

beforeEach(() => {
  jest.clearAllMocks();
  (completeOnboarding as jest.Mock).mockResolvedValue(undefined);
  (locationAsked as jest.Mock).mockResolvedValue(false);
  (notificationsAsked as jest.Mock).mockResolvedValue(false);
});

test('처음부터 끝까지 → 완료 저장 → 스토어 onboarded', async () => {
  useMeStore.setState({ me: fresh });
  await render(<Onboarding />);
  await waitFor(() => expect(current()).toBe('welcome'));
  await done();
  expect(current()).toBe('nickname');
  await done('나비집사');
  expect(useMeStore.getState().me).toMatchObject({ nickname: '나비집사' });
  expect(current()).toBe('cat');
  await done('나비', 'mackerel');
  expect(useMeStore.getState().me).toMatchObject({ catName: '나비', catColor: 'mackerel' });
  expect(current()).toBe('perm:어디를 다');
  await done();
  expect(current()).toBe('perm:도착하면 ');
  await done();
  expect(current()).toBe('homeDong');
  await done('서울특별시 종로구 사직동');
  expect(current()).toBe('tutorial');
  await done();
  expect(current()).toBe('firstFootprint');
  await done(true);
  expect(completeOnboarding).toHaveBeenCalled();
  expect(useMeStore.getState().me).toMatchObject({ onboarded: true, hasHideout: true, homeDong: '서울특별시 종로구 사직동' });
});

test('이어하기: 기존 계정(고양이·동네·아지트 있음, 권한 물어봄)은 환영 → 튜토리얼 → 끝', async () => {
  (locationAsked as jest.Mock).mockResolvedValue(true);
  (notificationsAsked as jest.Mock).mockResolvedValue(true);
  useMeStore.setState({ me: { ...fresh, nickname: '나비집사', catName: '나비', catColor: 'mackerel', homeDong: '사직동', hasHideout: true } });
  await render(<Onboarding />);
  await waitFor(() => expect(current()).toBe('welcome'));
  await done();
  expect(current()).toBe('tutorial');
  await done();
  expect(completeOnboarding).toHaveBeenCalled();
});

test('완료 저장 실패 → 오류 + 다시 시도', async () => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  (locationAsked as jest.Mock).mockResolvedValue(true);
  (notificationsAsked as jest.Mock).mockResolvedValue(true);
  (completeOnboarding as jest.Mock).mockRejectedValueOnce(new Error('net')).mockResolvedValueOnce(undefined);
  useMeStore.setState({ me: { ...fresh, nickname: '나비집사', catName: '나비', homeDong: '사직동', hasHideout: true } });
  await render(<Onboarding />);
  await waitFor(() => expect(current()).toBe('welcome'));
  await done();
  await done();
  expect(screen.getByText('앗, 잠깐 문제가 생겼어요. 다시 해볼까요?')).toBeTruthy();
  expect(useMeStore.getState().me?.onboarded).toBe(false);
  await fireEvent.press(screen.getByRole('button', { name: '다시 시도' }));
  expect(useMeStore.getState().me?.onboarded).toBe(true);
});

test('완료 저장 중엔 기다림 표시(빈 화면 아님)', async () => {
  (locationAsked as jest.Mock).mockResolvedValue(true);
  (notificationsAsked as jest.Mock).mockResolvedValue(true);
  (completeOnboarding as jest.Mock).mockReturnValue(new Promise(() => {}));
  useMeStore.setState({ me: { ...fresh, nickname: '나비집사', catName: '나비', homeDong: '사직동', hasHideout: true } });
  await render(<Onboarding />);
  await waitFor(() => expect(current()).toBe('welcome'));
  await done();
  await done();
  expect(screen.getByTestId('saving')).toBeTruthy();
});
