// mobile/src/features/checkin/__tests__/copy.test.ts
import { CheckinError } from '../errors';
import { celebrationCopy, dongStageLine, messageFor } from '../copy';

const T = { box: 2, hut: 5, tower: 10, palace: 20 };
const r = (over: object) => ({ aidutId: 'a', name: 'x', footprintCount: 3, grade: 'box', gradeChanged: false, newCellsCleared: 0, ...over }) as never;

test('거절 문구', () => {
  expect(messageFor(new CheckinError('too_far'))).toBe('조금만 더 가까이 가면 발자국을 남길 수 있어요.');
  expect(messageFor(new CheckinError('weak_gps'))).toBe('잠깐, 위치를 확인하고 있어요…');
  expect(messageFor(new CheckinError('not_yours'))).toBe('앗, 잠깐 문제가 생겼어요. 다시 해볼까요?');
  expect(messageFor(new Error('boom'))).toBe('앗, 잠깐 문제가 생겼어요. 다시 해볼까요?');
});

test('쿨다운은 현지 시각으로', () => {
  const at = '2026-09-28T09:05:00Z';
  const d = new Date(at);
  expect(messageFor(new CheckinError('cooldown', at))).toBe(
    `여긴 아까 다녀왔어요. ${d.getHours()}시 ${d.getMinutes()}분부터 다시 남길 수 있어요.`,
  );
});

test('쿨다운인데 시각을 모르면 시각 없는 문구', () => {
  expect(messageFor(new CheckinError('cooldown'))).toBe('여긴 아까 다녀왔어요. 조금 뒤에 다시 남겨볼까요?');
  expect(messageFor(new CheckinError('cooldown', 'not-a-date'))).toBe('여긴 아까 다녀왔어요. 조금 뒤에 다시 남겨볼까요?');
});

test('축하 문구: 첫 발자국 / 등급업 4종 / 같은 등급', () => {
  expect(celebrationCopy(r({ footprintCount: 1, grade: 'paw' }), T)).toEqual({ title: '🐾 첫 발자국이 찍혔어요. 여기서부터 시작이에요.', hint: null });
  expect(celebrationCopy(r({ footprintCount: 2, grade: 'box', gradeChanged: true }), T).title).toBe('여기 박스가 생겼어요 📦 마음에 드나 봐요.');
  expect(celebrationCopy(r({ footprintCount: 5, grade: 'hut', gradeChanged: true }), T).title).toBe('작은 집이 됐어요 🛖 자주 오시는군요.');
  expect(celebrationCopy(r({ footprintCount: 10, grade: 'tower', gradeChanged: true }), T).title).toBe('캣타워예요 🗼 여긴 우리 단골이네요.');
  expect(celebrationCopy(r({ footprintCount: 20, grade: 'palace', gradeChanged: true }), T).title).toBe('🏰 캣 팰리스. 여긴 당신의 인생 장소예요.');
  expect(celebrationCopy(r({ footprintCount: 3, grade: 'box' }), T)).toEqual({ title: '🐾 발자국을 남겼어요', hint: '2번 더 오면 작은 집이 돼요' });
  expect(celebrationCopy(r({ footprintCount: 3, grade: 'box' }), null)).toEqual({ title: '🐾 발자국을 남겼어요', hint: null });
});

const dongBase = { aidutId: 'a', name: '카페', footprintCount: 1, grade: 'paw' as const, gradeChanged: false, newCellsCleared: 1 };

test('동네 단계가 오르면 거시 문구', () => {
  expect(dongStageLine({ ...dongBase, dong: { name: '사직동', stage: 'cozy', stageChanged: true } })).toBe('우리 동네가 이제 아늑한 동네가 됐어요 🏘️');
  expect(dongStageLine({ ...dongBase, dong: { name: '사직동', stage: 'cat', stageChanged: true } })).toBe('여기, 이제 고양이 영역이에요 🐾 당신이 이만큼 누볐어요.');
});

test('안 올랐거나 동을 모르면 없음', () => {
  expect(dongStageLine({ ...dongBase, dong: { name: '사직동', stage: 'cozy', stageChanged: false } })).toBeNull();
  expect(dongStageLine({ ...dongBase, dong: null })).toBeNull();
  expect(dongStageLine(dongBase)).toBeNull();
});
