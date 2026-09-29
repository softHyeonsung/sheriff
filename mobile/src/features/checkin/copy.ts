// mobile/src/features/checkin/copy.ts
import type { GradeThresholds } from '@/features/map/useMyHideouts';
import { nextStageHint } from '@/features/map/nextStageHint';
import type { DongStage } from '@/features/territory/stages';
import type { Grade } from '@/map/grades';
import type { CheckinResult } from './checkinApi';
import { CheckinError } from './errors';

export const MSG = {
  locating: '잠깐, 위치를 확인하고 있어요…',
  denied: '위치가 꺼져 있어서 발자국을 남기기 어려워요. 켜두시면 제가 도와드릴게요.',
  unknown: '앗, 잠깐 문제가 생겼어요. 다시 해볼까요?',
  offline: '연결이 끊겨 있어요. 잠시 뒤에 다시 해볼까요?',
};

const GRADE_UP: Record<Exclude<Grade, 'paw'>, string> = {
  box: '여기 박스가 생겼어요 📦 마음에 드나 봐요.',
  hut: '작은 집이 됐어요 🛖 자주 오시는군요.',
  tower: '캣타워예요 🗼 여긴 우리 단골이네요.',
  palace: '🏰 캣 팰리스. 여긴 당신의 인생 장소예요.',
};

export function messageFor(e: unknown): string {
  if (!(e instanceof CheckinError)) return MSG.unknown;
  switch (e.code) {
    case 'too_far':
      return '조금만 더 가까이 가면 발자국을 남길 수 있어요.';
    case 'weak_gps':
      return MSG.locating;
    case 'cooldown': {
      const d = e.nextAt ? new Date(e.nextAt) : null;
      // A missing or unparsable time must not render as "NaN시".
      if (!d || Number.isNaN(d.getTime())) return '여긴 아까 다녀왔어요. 조금 뒤에 다시 남겨볼까요?';
      return `여긴 아까 다녀왔어요. ${d.getHours()}시 ${d.getMinutes()}분부터 다시 남길 수 있어요.`;
    }
    case 'offline':
      return MSG.offline;
    default:
      return MSG.unknown;
  }
}

export function celebrationCopy(r: CheckinResult, t: GradeThresholds | null): { title: string; hint: string | null } {
  if (r.footprintCount === 1) return { title: '🐾 첫 발자국이 찍혔어요. 여기서부터 시작이에요.', hint: null };
  if (r.gradeChanged && r.grade !== 'paw') return { title: GRADE_UP[r.grade], hint: null };
  return { title: '🐾 발자국을 남겼어요', hint: t ? nextStageHint(r.footprintCount, t) : null };
}

const DONG_UP: Record<Exclude<DongStage, 'fog'>, string> = {
  sprout: '우리 동네가 이제 개척지가 됐어요 🌱',
  cozy: '우리 동네가 이제 아늑한 동네가 됐어요 🏘️',
  cat: '여기, 이제 고양이 영역이에요 🐾 당신이 이만큼 누볐어요.',
  kingdom: '우리 동네가 이제 고양이 왕국이 됐어요 👑',
};

export function dongStageLine(r: CheckinResult): string | null {
  if (!r.dong?.stageChanged || r.dong.stage === 'fog') return null;
  return DONG_UP[r.dong.stage];
}
