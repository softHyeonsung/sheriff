// mobile/src/features/map/__tests__/nextStageHint.test.ts
import { nextStageHint } from '../nextStageHint';

const t = { box: 2, hut: 5, tower: 10, palace: 20 };

test('다음 단계까지 남은 횟수와 조사', () => {
  expect(nextStageHint(1, t)).toBe('한 번 더 오면 여기가 박스가 돼요');
  expect(nextStageHint(2, t)).toBe('3번 더 오면 작은 집이 돼요');
  expect(nextStageHint(4, t)).toBe('한 번 더 오면 여기가 작은 집이 돼요');
  expect(nextStageHint(5, t)).toBe('5번 더 오면 캣타워가 돼요');
  expect(nextStageHint(19, t)).toBe('한 번 더 오면 여기가 캣 팰리스가 돼요');
});

test('최고 단계', () => {
  expect(nextStageHint(20, t)).toBe('🏰 캣 팰리스. 여긴 당신의 인생 장소예요.');
  expect(nextStageHint(57, t)).toBe('🏰 캣 팰리스. 여긴 당신의 인생 장소예요.');
});
