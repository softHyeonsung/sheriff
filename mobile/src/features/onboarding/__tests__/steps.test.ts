// mobile/src/features/onboarding/__tests__/steps.test.ts
import { nextStep, type Progress, type Step } from '../steps';

const fresh: Progress = { catName: null, homeDong: null, hasHideout: false, locationAsked: false, notificationsAsked: false };
const walk = (p: Progress) => {
  const seen: Step[] = ['welcome'];
  while (seen[seen.length - 1] !== 'done') seen.push(nextStep(seen[seen.length - 1], p));
  return seen;
};

test('처음이면 전부', () => {
  expect(walk(fresh)).toEqual(['welcome', 'cat', 'location', 'notifications', 'homeDong', 'tutorial', 'firstFootprint', 'done']);
});

test('이어하기: 이미 한 것은 건너뛴다(환영·튜토리얼은 항상)', () => {
  expect(walk({ catName: '나비', homeDong: '사직동', hasHideout: false, locationAsked: true, notificationsAsked: true }))
    .toEqual(['welcome', 'tutorial', 'firstFootprint', 'done']);
});

test('아지트 있으면 firstFootprint 건너뜀(기존 계정)', () => {
  expect(walk({ ...fresh, hasHideout: true })).toEqual(['welcome', 'cat', 'location', 'notifications', 'homeDong', 'tutorial', 'done']);
});

test('단계를 마친 뒤 바뀐 진행 상황을 반영한다', () => {
  expect(nextStep('cat', { ...fresh, catName: '나비' })).toBe('location');
  expect(nextStep('location', { ...fresh, locationAsked: true, notificationsAsked: true })).toBe('homeDong');
  expect(nextStep('done', fresh)).toBe('done');
});
