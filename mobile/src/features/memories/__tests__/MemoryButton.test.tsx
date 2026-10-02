// mobile/src/features/memories/__tests__/MemoryButton.test.tsx
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert, Linking } from 'react-native';
import { keepMemory } from '../memoryQueue';
import { flushMemoriesNow } from '../memoriesApi';
import { MemoryButton } from '../MemoryButton';
import { pickMemoryPhoto } from '../photo';

jest.mock('../photo', () => ({ pickMemoryPhoto: jest.fn() }));
jest.mock('../memoryQueue', () => ({ keepMemory: jest.fn() }));
jest.mock('../memoriesApi', () => ({ flushMemoriesNow: jest.fn() }));

const fix = { lat: 37.5, lng: 127, accuracy: 20 };
type AlertButton = { text: string; onPress?: () => void };
const choose = async (label: string) => {
  const buttons = (Alert.alert as jest.Mock).mock.calls.at(-1)![2] as AlertButton[];
  await act(async () => buttons.find((b) => b.text === label)!.onPress!());
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  (keepMemory as jest.Mock).mockResolvedValue(undefined);
  (flushMemoriesNow as jest.Mock).mockResolvedValue({ attached: [], dropped: 0 });
});

test('누르면 찍기/고르기/닫기를 묻는다', async () => {
  await render(<MemoryButton aidutId="a1" getFix={async () => fix} />);
  await fireEvent.press(screen.getByRole('button', { name: '순간 남기기 📷' }));
  const [title, , buttons] = (Alert.alert as jest.Mock).mock.calls[0];
  expect(title).toBe('순간 남기기 📷');
  expect((buttons as AlertButton[]).map((b) => b.text)).toEqual(['사진 찍기', '앨범에서 고르기', '닫기']);
});

test('찍으면 그 위치로 챙기고 알린 뒤 올려 본다, 올라가면 onUploaded', async () => {
  (pickMemoryPhoto as jest.Mock).mockResolvedValue({ status: 'ok', id: 'p1', uri: 'file:///doc/memories/p1.jpg' });
  (flushMemoriesNow as jest.Mock).mockResolvedValue({ attached: ['a1'], dropped: 0 });
  const onUploaded = jest.fn();
  await render(<MemoryButton aidutId="a1" getFix={async () => fix} onUploaded={onUploaded} />);
  await fireEvent.press(screen.getByRole('button', { name: '순간 남기기 📷' }));
  await choose('사진 찍기');
  expect(pickMemoryPhoto).toHaveBeenCalledWith('camera');
  expect(keepMemory).toHaveBeenCalledWith({ id: 'p1', aidutId: 'a1', fix, localUri: 'file:///doc/memories/p1.jpg' });
  expect(screen.getByText('순간을 남겼다냥 📷')).toBeTruthy();
  await waitFor(() => expect(onUploaded).toHaveBeenCalled());
});

test('취소하면 아무것도 안 한다', async () => {
  (pickMemoryPhoto as jest.Mock).mockResolvedValue({ status: 'canceled' });
  const getFix = jest.fn().mockResolvedValue(fix);
  await render(<MemoryButton aidutId="a1" getFix={getFix} />);
  await fireEvent.press(screen.getByRole('button', { name: '순간 남기기 📷' }));
  await choose('앨범에서 고르기');
  expect(pickMemoryPhoto).toHaveBeenCalledWith('library');
  expect(keepMemory).not.toHaveBeenCalled();
});

test('사진 권한 거절 → 안내 + 설정 열기', async () => {
  (pickMemoryPhoto as jest.Mock).mockResolvedValue({ status: 'denied' });
  const open = jest.spyOn(Linking, 'openSettings').mockResolvedValue();
  await render(<MemoryButton aidutId="a1" getFix={async () => fix} />);
  await fireEvent.press(screen.getByRole('button', { name: '순간 남기기 📷' }));
  await choose('사진 찍기');
  expect(screen.getByText('사진을 쓰려면 권한이 필요하다냥.')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: '설정 열기' }));
  expect(open).toHaveBeenCalled();
});

test('위치 권한이 없으면 위치 안내, 사진을 찍기 전에 멈춘다', async () => {
  (pickMemoryPhoto as jest.Mock).mockResolvedValue({ status: 'ok', id: 'p1', uri: 'u' });
  await render(<MemoryButton aidutId="a1" getFix={async () => 'denied'} />);
  await fireEvent.press(screen.getByRole('button', { name: '순간 남기기 📷' }));
  await choose('사진 찍기');
  expect(screen.getByText('위치가 꺼져 있어서 발자국을 남기기 어렵다냥. 켜두면 내가 도와줄게냥.')).toBeTruthy();
  expect(pickMemoryPhoto).not.toHaveBeenCalled();
  expect(keepMemory).not.toHaveBeenCalled();
});

test('준비가 실패하면 다시 해보자고', async () => {
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  (pickMemoryPhoto as jest.Mock).mockRejectedValue(new Error('resize'));
  await render(<MemoryButton aidutId="a1" getFix={async () => fix} />);
  await fireEvent.press(screen.getByRole('button', { name: '순간 남기기 📷' }));
  await choose('사진 찍기');
  expect(screen.getByText('사진을 준비하지 못했다냥. 다시 해볼까냥?')).toBeTruthy();
});

test('disabled면 누를 수 없다', async () => {
  await render(<MemoryButton aidutId="a1" getFix={async () => fix} disabled />);
  expect(screen.getByRole('button', { name: '순간 남기기 📷', disabled: true })).toBeTruthy();
});

test('위치가 흐리거나 멀면 찍기 전에 알려 준다(사진을 잃지 않게)', async () => {
  await render(<MemoryButton aidutId="a1" getFix={async () => ({ problem: '위치가 흐리다냥. 조금 뒤에 다시 해볼까냥?' })} />);
  await fireEvent.press(screen.getByRole('button', { name: '순간 남기기 📷' }));
  await choose('사진 찍기');
  expect(screen.getByText('위치가 흐리다냥. 조금 뒤에 다시 해볼까냥?')).toBeTruthy();
  expect(pickMemoryPhoto).not.toHaveBeenCalled();
});

test('바로 올렸는데 서버가 거절하면 알려 준다', async () => {
  (pickMemoryPhoto as jest.Mock).mockResolvedValue({ status: 'ok', id: 'p1', uri: 'u' });
  (flushMemoriesNow as jest.Mock).mockResolvedValue({ attached: [], dropped: 1 });
  await render(<MemoryButton aidutId="a1" getFix={async () => fix} />);
  await fireEvent.press(screen.getByRole('button', { name: '순간 남기기 📷' }));
  await choose('사진 찍기');
  await waitFor(() => expect(screen.getByText('남긴 순간을 올리지 못했다냥. 너무 멀었거나 위치가 흐렸다냥.')).toBeTruthy());
});
