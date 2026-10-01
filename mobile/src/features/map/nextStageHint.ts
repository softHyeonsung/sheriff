// mobile/src/features/map/nextStageHint.ts
import { GRADE_LABEL } from '@/map/grades';
import type { GradeThresholds } from './useMyHideouts';

const NEXT: ('box' | 'hut' | 'tower' | 'palace')[] = ['box', 'hut', 'tower', 'palace'];

// 받침 있으면 "이", 없으면 "가" (작은 집이 / 박스가).
export const subject = (word: string) => {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  return word + (code >= 0 && code % 28 !== 0 ? '이' : '가');
};

export function nextStageHint(footprintCount: number, t: GradeThresholds): string {
  const next = NEXT.find((g) => footprintCount < t[g]);
  if (!next) return '🏰 캣 팰리스. 여긴 당신의 인생 장소예요.';
  const left = t[next] - footprintCount;
  const name = subject(GRADE_LABEL[next]);
  return left === 1 ? `한 번 더 오면 여기가 ${name} 돼요` : `${left}번 더 오면 ${name} 돼요`;
}
