// mobile/src/app/(tabs)/__tests__/profile.test.tsx
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { Alert, Linking } from 'react-native';
import { TERMS_LINKS } from '@/constants/terms';
import { useAuthSession } from '@/features/auth/useAuthSession';
import { useArrivalSwitch } from '@/features/profile/useArrivalSwitch';
import { useMeStore } from '@/stores/meStore';
import ProfileScreen from '../profile';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('@/features/auth/useAuthSession', () => ({ useAuthSession: jest.fn() }));
jest.mock('@/features/profile/useArrivalSwitch', () => ({ useArrivalSwitch: jest.fn() }));

const me = { onboarded: true, nickname: '나비집사', catName: '나비', catColor: 'mackerel' as const, homeDong: '서울특별시 종로구 사직동', hasHideout: true };
type AlertButton = { text: string; onPress?: () => void | Promise<void> };
const alertButton = async (label: string) => {
  const buttons = (Alert.alert as jest.Mock).mock.calls.at(-1)![2] as AlertButton[];
  await act(async () => {
    await buttons.find((b) => b.text === label)!.onPress?.();
  });
};
const auth = { signOut: jest.fn(), deleteAccount: jest.fn(), session: null, loading: false };
const sw = (over = {}) => ({ on: false, busy: false, needsSettings: false, toggle: jest.fn(), ...over });

beforeEach(() => {
  jest.clearAllMocks();
  useMeStore.setState({ me });
  (useAuthSession as jest.Mock).mockReturnValue(auth);
  (useArrivalSwitch as jest.Mock).mockReturnValue(sw());
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

test('닉네임·고양이·동네를 보여주고 바꾸기로 간다', async () => {
  await render(<ProfileScreen />);
  expect(screen.getByText('나비집사')).toBeTruthy();
  expect(screen.getByText('나비')).toBeTruthy();
  expect(screen.getByText('서울특별시 종로구 사직동')).toBeTruthy();
  const buttons = screen.getAllByRole('button', { name: '바꾸기' });
  await fireEvent.press(buttons[0]);
  await fireEvent.press(buttons[1]);
  await fireEvent.press(buttons[2]);
  expect((router.push as jest.Mock).mock.calls.map((c) => c[0])).toEqual(['/settings/nickname', '/settings/cat', '/settings/home']);
});

test('닉네임이 없으면 정하기, 동네가 없으면 안내', async () => {
  useMeStore.setState({ me: { ...me, nickname: null, homeDong: null } });
  await render(<ProfileScreen />);
  expect(screen.getByText('아직 닉네임이 없어요')).toBeTruthy();
  expect(screen.getByRole('button', { name: '정하기' })).toBeTruthy();
  expect(screen.getByText('아직 정하지 않았어요')).toBeTruthy();
});

test('도착 알림 스위치, 설정이 필요하면 안내 + 설정 열기', async () => {
  const s = sw({ needsSettings: true });
  (useArrivalSwitch as jest.Mock).mockReturnValue(s);
  const open = jest.spyOn(Linking, 'openSettings').mockResolvedValue();
  await render(<ProfileScreen />);
  await fireEvent(screen.getByRole('switch', { name: '도착 알림' }), 'valueChange', true);
  expect(s.toggle).toHaveBeenCalledWith(true);
  expect(screen.getByText("설정에서 위치를 '항상 허용'으로 바꿔주세요")).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: '설정 열기' }));
  expect(open).toHaveBeenCalled();
});

test('약관 링크를 연다', async () => {
  const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
  await render(<ProfileScreen />);
  await fireEvent.press(screen.getByRole('link', { name: '개인정보 처리방침' }));
  expect(openURL).toHaveBeenCalledWith(TERMS_LINKS.privacy);
});

test('로그아웃은 한 번 확인하고', async () => {
  await render(<ProfileScreen />);
  await fireEvent.press(screen.getByRole('button', { name: '로그아웃' }));
  expect((Alert.alert as jest.Mock).mock.calls[0][0]).toBe('로그아웃할까요?');
  expect(auth.signOut).not.toHaveBeenCalled();
  await alertButton('로그아웃');
  expect(auth.signOut).toHaveBeenCalled();
});

test('탈퇴: 확인 문구, 떠나기를 누르면 진행, 실패하면 안내', async () => {
  auth.deleteAccount.mockRejectedValueOnce(new Error('500'));
  jest.spyOn(console, 'error').mockImplementation(() => {});
  await render(<ProfileScreen />);
  await fireEvent.press(screen.getByRole('button', { name: '계정 탈퇴' }));
  const [title, body, buttons] = (Alert.alert as jest.Mock).mock.calls[0];
  expect(title).toBe('정말 떠나시겠어요?');
  expect(body).toBe('그동안 함께 누빈 동네와 순간들이 모두 지워져요.');
  expect((buttons as AlertButton[]).map((b) => b.text)).toEqual(['취소', '떠나기']);
  await alertButton('떠나기');
  expect(auth.deleteAccount).toHaveBeenCalled();
  expect(screen.getByText('지금은 떠날 수 없어요. 잠시 뒤 다시 해볼까요?')).toBeTruthy();
});
