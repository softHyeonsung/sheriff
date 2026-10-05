// mobile/src/features/checkin/__tests__/CheckinSheet.test.tsx
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { Choosing } from '../useCheckin';
import { CheckinSheet } from '../CheckinSheet';

const mine = { kind: 'mine' as const, aidutId: 'a1', name: '단골 카페', grade: 'box' as const, distanceM: 12 };
const kakao = { kind: 'kakao' as const, placeId: 'p1', name: '공원', lat: 37.5, lng: 126.9, roadAddress: '서울 2', distanceM: 43.6 };
const state = (over: Partial<Choosing> = {}): Choosing => ({
  name: 'choosing', fix: { lat: 37.5, lng: 126.9, accuracy: 10 }, hereAddress: '서울 테스트로 1',
  candidates: [mine, kakao], offline: false, busy: false, error: null, ...over,
});
const props = { footprintsById: { a1: 3 }, onChoose: jest.fn(), onClose: jest.fn() };

beforeEach(() => jest.clearAllMocks());

test('첫 후보를 물어보고, 맞으면 그 장소로', async () => {
  await render(<CheckinSheet {...props} state={state()} />);
  expect(screen.getByText('여기 단골 카페 맞냥?')).toBeTruthy();
  expect(screen.getByText('지금까지 3번 다녀왔다냥')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: '발자국 남기기' }));
  expect(props.onChoose).toHaveBeenCalledWith({ kind: 'mine', aidutId: 'a1' });
});

test('다른 곳이에요 → 목록(거리) → 카카오 장소 선택', async () => {
  await render(<CheckinSheet {...props} state={state()} />);
  await fireEvent.press(screen.getByRole('button', { name: '다른 곳이에요' }));
  expect(screen.getByText('약 44m')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: '공원' }));
  expect(props.onChoose).toHaveBeenCalledWith({ kind: 'kakao', placeId: 'p1', name: '공원', lat: 37.5, lng: 126.9, roadAddress: '서울 2' });
});

test('여기에 새로 만들기 → 그 건물 이름과 현재 주소로', async () => {
  await render(<CheckinSheet {...props} state={state({ hereName: '새 곳' })} />);
  await fireEvent.press(screen.getByRole('button', { name: '다른 곳이에요' }));
  await fireEvent.press(screen.getByRole('button', { name: '여기에 새로 만들기' }));
  expect(props.onChoose).toHaveBeenCalledWith({ kind: 'new', roadAddress: '서울 테스트로 1', name: '새 곳' });
});

test('후보도 건물 이름도 없으면 장소를 찾을 수 없다고 알리고, 새로 만들기는 없다', async () => {
  await render(<CheckinSheet {...props} dwell state={state({ candidates: [] })} />);
  expect(screen.getByText('주변에서 장소를 찾을 수 없다냥. 가게나 건물 가까이에서 다시 해볼까냥?')).toBeTruthy();
  expect(screen.queryByRole('button', { name: '여기에 새로 만들기' })).toBeNull();
  expect(screen.queryByText(/3분 동안/)).toBeNull();
});

test('이름 없는 자리에서는 후보가 있어도 새로 만들기가 없다', async () => {
  await render(<CheckinSheet {...props} state={state()} />);
  await fireEvent.press(screen.getByRole('button', { name: '다른 곳이에요' }));
  expect(screen.queryByRole('button', { name: '여기에 새로 만들기' })).toBeNull();
});

test('3분 머물러야 남는 화면에서는 그렇게 한다고 미리 알린다', async () => {
  await render(<CheckinSheet {...props} dwell state={state()} />);
  expect(screen.getByText('3분 동안 여기 머물면 발자국이 남는다냥. 3분 뒤에 위치를 한 번 더 확인할게냥.')).toBeTruthy();
});

test('건물 이름을 알면 새로 만들기에 주소 대신 그 이름을 보여주고 같이 보낸다', async () => {
  await render(<CheckinSheet {...props} state={state({ candidates: [], hereName: '경복궁' })} />);
  expect(screen.getByText('경복궁')).toBeTruthy();
  expect(screen.queryByText('서울 테스트로 1')).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: '여기에 새로 만들기' }));
  expect(props.onChoose).toHaveBeenCalledWith({ kind: 'new', roadAddress: '서울 테스트로 1', name: '경복궁' });
});

test('거절 안내는 시트 안에', async () => {
  await render(<CheckinSheet {...props} state={state({ error: '조금만 더 가까이 가면 발자국을 남길 수 있다냥.' })} />);
  expect(screen.getByText('조금만 더 가까이 가면 발자국을 남길 수 있다냥.')).toBeTruthy();
});

test('저장 중엔 닫히지 않는다', async () => {
  await render(<CheckinSheet {...props} state={state({ busy: true })} />);
  await fireEvent.press(screen.getByRole('button', { name: '닫기' }));
  expect(props.onClose).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: '발자국 남기기', disabled: true })).toBeTruthy();
});

test('오프라인이면 내 아지트만 보여준다고 알린다', async () => {
  await render(<CheckinSheet state={state({ offline: true })} {...props} />);
  expect(screen.getByText('연결이 끊겨 있어서 내 아지트만 보여준다냥')).toBeTruthy();
});

test('✕ 버튼으로 닫고, 다른 곳이에요는 저장 중엔 비활성으로 읽힌다', async () => {
  const { rerender } = await render(<CheckinSheet {...props} state={state()} />);
  expect(screen.getAllByRole('button', { name: '닫기' })).toHaveLength(1); // 배경은 따로 읽히지 않는다
  await fireEvent.press(screen.getByRole('button', { name: '닫기' }));
  expect(props.onClose).toHaveBeenCalledTimes(1);
  await rerender(<CheckinSheet {...props} state={state({ busy: true })} />);
  expect(screen.getByRole('button', { name: '다른 곳이에요', disabled: true })).toBeTruthy();
});
