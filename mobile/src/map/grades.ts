// mobile/src/map/grades.ts
export type Grade = 'paw' | 'box' | 'hut' | 'tower' | 'palace';

export const GRADES: Grade[] = ['paw', 'box', 'hut', 'tower', 'palace'];

export const GRADE_LABEL: Record<Grade, string> = {
  paw: '발자국',
  box: '박스',
  hut: '작은 집',
  tower: '캣타워',
  palace: '캣 팰리스',
};

export function isGrade(v: unknown): v is Grade {
  return typeof v === 'string' && (GRADES as string[]).includes(v);
}
