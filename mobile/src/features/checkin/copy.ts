// mobile/src/features/checkin/copy.ts
import type { GradeThresholds } from '@/features/map/useMyHideouts';
import { nextStageHint } from '@/features/map/nextStageHint';
import type { DongStage } from '@/features/territory/stages';
import type { Grade } from '@/map/grades';
import type { CheckinResult } from './checkinApi';
import { CheckinError } from './errors';

export const MSG = {
  locating: '잠깐, 위치를 확인하고 있다냥…',
  denied: '위치가 꺼져 있어서 발자국을 남기기 어렵다냥. 켜두면 내가 도와줄게냥.',
  unknown: '앗, 잠깐 문제가 생겼다냥. 다시 해볼까냥?',
  offline: '연결이 끊겨 있다냥. 잠시 뒤에 다시 해볼까냥?',
};

const GRADE_UP: Record<Exclude<Grade, 'paw'>, string> = {
  box: '여기 박스가 생겼다냥 📦 마음에 드나 보다냥.',
  hut: '작은 집이 됐다냥 🛖 자주 오는구냥.',
  tower: '캣타워다냥 🗼 여긴 우리 단골이냥.',
  palace: '🏰 캣 팰리스다냥. 여긴 네 인생 장소냥.',
};

export function messageFor(e: unknown): string {
  if (!(e instanceof CheckinError)) return MSG.unknown;
  switch (e.code) {
    case 'too_far':
      return '조금만 더 가까이 가면 발자국을 남길 수 있다냥.';
    case 'weak_gps':
      return MSG.locating;
    case 'cooldown': {
      const d = e.nextAt ? new Date(e.nextAt) : null;
      // A missing or unparsable time must not render as "NaN시".
      if (!d || Number.isNaN(d.getTime())) return '여긴 아까 다녀왔다냥. 조금 뒤에 다시 남겨볼까냥?';
      return `여긴 아까 다녀왔다냥. ${d.getHours()}시 ${d.getMinutes()}분부터 다시 남길 수 있다냥.`;
    }
    case 'offline':
      return MSG.offline;
    case 'location_off':
      return '휴대폰의 위치 서비스가 꺼져 있다냥. 켜고 다시 해볼까냥?';
    default:
      return MSG.unknown;
  }
}

export function celebrationCopy(r: CheckinResult, t: GradeThresholds | null): { title: string; hint: string | null } {
  if (r.footprintCount === 1) return { title: '🐾 첫 발자국이 찍혔다냥. 여기서부터 시작이냥.', hint: null };
  if (r.gradeChanged && r.grade !== 'paw') return { title: GRADE_UP[r.grade], hint: null };
  return { title: '🐾 발자국을 남겼다냥', hint: t ? nextStageHint(r.footprintCount, t) : null };
}

const DONG_UP: Record<Exclude<DongStage, 'fog'>, string> = {
  sprout: '우리 동네가 이제 개척지가 됐다냥 🌱',
  cozy: '우리 동네가 이제 아늑한 동네가 됐다냥 🏘️',
  cat: '여기, 이제 고양이 영역이다냥 🐾 네가 이만큼 누볐다냥.',
  kingdom: '우리 동네가 이제 고양이 왕국이 됐다냥 👑',
};

export function dongStageLine(r: CheckinResult): string | null {
  if (!r.dong?.stageChanged || r.dong.stage === 'fog') return null;
  return DONG_UP[r.dong.stage];
}

export function wishLine(r: CheckinResult): string | null {
  return r.wishAchieved ? `가고 싶다던 ${r.name}, 드디어 왔다냥!` : null;
}
