// mobile/src/features/checkin/__tests__/CheckinSheet.test.tsx
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { Choosing } from '../useCheckin';
import { CheckinSheet } from '../CheckinSheet';

const mine = { kind: 'mine' as const, aidutId: 'a1', name: '단골 카페', grade: 'box' as const, distanceM: 12 };
const kakao = { kind: 'kakao' as const, placeId: 'p1', name: '공원', lat: 37.5, lng: 126.9, roadAddress: '서울 2', distanceM: 43.6 };
const state = (over: Partial<Choosing> = {}): Choosing => ({
  name: 'choosing', fix: { lat: 37.5, lng: 126.9, accuracy: 10 }, hereAddress: '서울 테스트로 1',
  candidates: [mine, kakao], busy: false, error: null, ...over,
});
const props = { footprintsById: { a1: 3 }, onChoose: jest.fn(), onClose: jest.fn() };

beforeEach(() => jest.clearAllMocks());

test('첫 후보를 물어보고, 맞으면 그 장소로', async () => {
  await render(<CheckinSheet {...props} state={state()} />);
  expect(screen.getByText('여기 단골 카페 맞나요?')).toBeTruthy();
  expect(screen.getByText('지금까지 3번 다녀왔어요')).toBeTruthy();
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

test('여기에 새로 만들기 → 현재 주소로', async () => {
  await render(<CheckinSheet {...props} state={state()} />);
  await fireEvent.press(screen.getByRole('button', { name: '다른 곳이에요' }));
  await fireEvent.press(screen.getByRole('button', { name: '여기에 새로 만들기' }));
  expect(props.onChoose).toHaveBeenCalledWith({ kind: 'new', roadAddress: '서울 테스트로 1' });
});

test('후보가 없으면 바로 목록(새로 만들기만)', async () => {
  await render(<CheckinSheet {...props} state={state({ candidates: [], hereAddress: null })} />);
  expect(screen.queryByText(/맞나요\?/)).toBeNull();
  expect(screen.getByText('이름 없는 골목')).toBeTruthy();
});

test('거절 안내는 시트 안에', async () => {
  await render(<CheckinSheet {...props} state={state({ error: '조금만 더 가까이 가면 발자국을 남길 수 있어요.' })} />);
  expect(screen.getByText('조금만 더 가까이 가면 발자국을 남길 수 있어요.')).toBeTruthy();
});

test('저장 중엔 닫히지 않는다', async () => {
  await render(<CheckinSheet {...props} state={state({ busy: true })} />);
  await fireEvent.press(screen.getByRole('button', { name: '닫기' }));
  expect(props.onClose).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: '발자국 남기기', disabled: true })).toBeTruthy();
});
