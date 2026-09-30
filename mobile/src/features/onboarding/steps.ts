// mobile/src/features/onboarding/steps.ts
// 온보딩 이어하기 규칙의 전부: 순서 + "이미 한 것" 건너뛰기. 단계 기록은 따로 두지 않는다.
export type Step = 'welcome' | 'nickname' | 'cat' | 'location' | 'notifications' | 'homeDong' | 'tutorial' | 'firstFootprint' | 'done';
export type Progress = { nickname: string | null; catName: string | null; homeDong: string | null; hasHideout: boolean; locationAsked: boolean; notificationsAsked: boolean };

const ORDER: Step[] = ['welcome', 'nickname', 'cat', 'location', 'notifications', 'homeDong', 'tutorial', 'firstFootprint', 'done'];

function alreadyDone(step: Step, p: Progress): boolean {
  switch (step) {
    case 'nickname':
      return !!p.nickname;
    case 'cat':
      return !!p.catName;
    case 'location':
      return p.locationAsked;
    case 'notifications':
      return p.notificationsAsked;
    case 'homeDong':
      return !!p.homeDong;
    case 'firstFootprint':
      return p.hasHideout;
    default:
      return false;
  }
}

export function nextStep(step: Step, p: Progress): Step {
  let i = ORDER.indexOf(step) + 1;
  while (i < ORDER.length - 1 && alreadyDone(ORDER[i], p)) i++;
  return ORDER[Math.min(i, ORDER.length - 1)];
}
