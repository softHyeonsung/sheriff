// mobile/src/features/map/__tests__/nextStageHint.test.ts
import { nextStageHint, subject } from '../nextStageHint';

const t = { box: 2, hut: 5, tower: 10, palace: 20 };

test('다음 단계까지 남은 횟수와 조사', () => {
  expect(nextStageHint(1, t)).toBe('한 번 더 오면 여기가 박스가 된다냥');
  expect(nextStageHint(2, t)).toBe('3번 더 오면 작은 집이 된다냥');
  expect(nextStageHint(4, t)).toBe('한 번 더 오면 여기가 작은 집이 된다냥');
  expect(nextStageHint(5, t)).toBe('5번 더 오면 캣타워가 된다냥');
  expect(nextStageHint(19, t)).toBe('한 번 더 오면 여기가 캣 팰리스가 된다냥');
});

test('최고 단계', () => {
  expect(nextStageHint(20, t)).toBe('🏰 캣 팰리스다냥. 여긴 네 인생 장소냥.');
  expect(nextStageHint(57, t)).toBe('🏰 캣 팰리스다냥. 여긴 네 인생 장소냥.');
});

test('subject: 받침 있으면 이, 없으면 가, 한글이 아니면 (이)가', () => {
  expect(subject('콩')).toBe('콩이');
  expect(subject('나비')).toBe('나비가');
  expect(subject('Tom')).toBe('Tom(이)가');
  expect(subject('냥2')).toBe('냥2(이)가');
});
