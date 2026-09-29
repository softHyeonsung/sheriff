// mobile/src/features/onboarding/__tests__/HomeDongStep.test.tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { getFreshFix } from '@/features/checkin/checkinApi';
import { regionAt, searchRegion, setHomeDong } from '../onboardingApi';
import { HomeDongStep } from '../HomeDongStep';

jest.mock('../onboardingApi', () => ({ regionAt: jest.fn(), searchRegion: jest.fn(), setHomeDong: jest.fn() }));
jest.mock('@/features/checkin/checkinApi', () => ({ getFreshFix: jest.fn() }));

beforeEach(() => {
  jest.clearAllMocks();
  (setHomeDong as jest.Mock).mockResolvedValue(undefined);
});

test('GPS로 추정 → 맞아요 → 저장', async () => {
  (getFreshFix as jest.Mock).mockResolvedValue({ lat: 37.5, lng: 126.9, accuracy: 10 });
  (regionAt as jest.Mock).mockResolvedValue(['서울특별시 종로구 사직동']);
  const onDone = jest.fn();
  await render(<HomeDongStep onDone={onDone} />);
  await waitFor(() => expect(screen.getByText('서울특별시 종로구 사직동')).toBeTruthy());
  expect(screen.getByText('여기가 우리 동네가 맞나요?')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: '맞아요' }));
  expect(setHomeDong).toHaveBeenCalledWith('서울특별시 종로구 사직동');
  expect(onDone).toHaveBeenCalledWith('서울특별시 종로구 사직동');
});

test('위치 없으면 바로 검색, 결과를 골라 저장', async () => {
  (getFreshFix as jest.Mock).mockResolvedValue('denied');
  (searchRegion as jest.Mock).mockResolvedValue(['서울특별시 종로구 사직동', '부산광역시 동래구 사직동']);
  const onDone = jest.fn();
  await render(<HomeDongStep onDone={onDone} />);
  await waitFor(() => expect(screen.getByText('우리 동네 이름을 알려주세요')).toBeTruthy());
  expect(regionAt).not.toHaveBeenCalled();
  await fireEvent.changeText(screen.getByLabelText('동네 이름'), '사직동');
  await fireEvent.press(screen.getByRole('button', { name: '찾기' }));
  await fireEvent.press(await screen.findByRole('button', { name: '부산광역시 동래구 사직동' }));
  expect(onDone).toHaveBeenCalledWith('부산광역시 동래구 사직동');
});

test('추정 실패 → 검색, 0건이면 못 찾았어요', async () => {
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  (getFreshFix as jest.Mock).mockRejectedValue(new Error('gps'));
  (searchRegion as jest.Mock).mockResolvedValue([]);
  await render(<HomeDongStep onDone={jest.fn()} />);
  await waitFor(() => expect(screen.getByText('우리 동네 이름을 알려주세요')).toBeTruthy());
  await fireEvent.changeText(screen.getByLabelText('동네 이름'), '없는동');
  await fireEvent.press(screen.getByRole('button', { name: '찾기' }));
  expect(await screen.findByText('음, 못 찾았어요. 다른 이름으로 찾아볼까요?')).toBeTruthy();
});

test('다른 동네예요 → 검색 모드', async () => {
  (getFreshFix as jest.Mock).mockResolvedValue({ lat: 37.5, lng: 126.9, accuracy: 10 });
  (regionAt as jest.Mock).mockResolvedValue(['서울특별시 종로구 사직동']);
  await render(<HomeDongStep onDone={jest.fn()} />);
  await fireEvent.press(await screen.findByRole('button', { name: '다른 동네예요' }));
  expect(screen.getByText('우리 동네 이름을 알려주세요')).toBeTruthy();
});

test('저장 실패 → 오류, 다시 누를 수 있음', async () => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  (getFreshFix as jest.Mock).mockResolvedValue({ lat: 37.5, lng: 126.9, accuracy: 10 });
  (regionAt as jest.Mock).mockResolvedValue(['서울특별시 종로구 사직동']);
  (setHomeDong as jest.Mock).mockRejectedValueOnce(new Error('net')).mockResolvedValueOnce(undefined);
  const onDone = jest.fn();
  await render(<HomeDongStep onDone={onDone} />);
  await fireEvent.press(await screen.findByRole('button', { name: '맞아요' }));
  expect(screen.getByText('앗, 잠깐 문제가 생겼어요. 다시 해볼까요?')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: '맞아요' }));
  expect(onDone).toHaveBeenCalled();
});
