// Native mirror of design-tokens.css (theme "맑은 하늘", DESIGN.md 2026-10-02). Screens reference these, never raw hex.
// 역할 — 하늘(sky): 시그니처. 고른 것·보조 버튼·링 / 초원(nature): 걷힌 영역·성장·긍정 상태 /
// 햇살(primary): 화면에서 가장 중요한 행동 하나에만. 닫기·바꾸기 같은 조용한 행동은 잉크 글자만.
export const color = {
  surface: '#F6F8F4',
  surfaceCard: '#FFFFFF',
  surfaceSunk: '#EDF1EA', // 카드 안의 눌린 면(누름 상태)
  sky: '#5BAFE6',
  skyDeep: '#2F86C6',
  skyLight: '#DCEFFB',
  skyInk: '#1F6396', // skyLight 위 글자(5:1 이상) — skyDeep은 작은 글자엔 옅다
  nature: '#8FC658',
  natureDeep: '#5CA047',
  natureLight: '#D6EEB4',
  natureInk: '#3A6B2B', // 흰 바탕·natureLight 위 글자
  primary: '#F6B13C',
  primaryDeep: '#E8942A',
  primaryInk: '#8A5A1F', // 흰 바탕 위 앰버 계열 글자
  onPrimary: '#3B2A16',
  fog: '#CAD7D1',
  blossom: '#F2869B',
  ink: '#333B31',
  // DESIGN.md의 #7A857A는 바탕에서 3.7:1이라 같은 문서의 대비 기준(4.5:1)에 못 미친다: 같은 색조로 조금 진하게.
  inkSub: '#667166',
  line: '#E7EDE4',
} as const;

// Kakao login button colors are fixed by Kakao's design guide — not part of any theme pack.
export const kakao = {
  container: '#FEE500',
  symbol: '#000000',
  label: 'rgba(0, 0, 0, 0.85)',
} as const;

// Font files are embedded by the expo-font plugin (app.json); family = file name.
export const font = {
  regular: 'Pretendard-Regular',
  medium: 'Pretendard-Medium',
  semibold: 'Pretendard-SemiBold',
  bold: 'Pretendard-Bold',
} as const;

export const type = {
  display: { fontFamily: font.bold, fontSize: 28, lineHeight: 36, letterSpacing: -0.4 },
  title: { fontFamily: font.bold, fontSize: 22, lineHeight: 30, letterSpacing: -0.3 },
  subtitle: { fontFamily: font.semibold, fontSize: 18, lineHeight: 26, letterSpacing: -0.2 },
  body: { fontFamily: font.regular, fontSize: 16, lineHeight: 24 },
  bodyStrong: { fontFamily: font.medium, fontSize: 16, lineHeight: 24 },
  label: { fontFamily: font.semibold, fontSize: 15, lineHeight: 20 }, // 버튼 글자는 이것 하나
  caption: { fontFamily: font.regular, fontSize: 13, lineHeight: 18 },
} as const;

export const radius = { card: 16, btn: 12, sheet: 24, pill: 999, min: 8 } as const;
export const space = { gutter: 20, section: 24, tapMin: 44 } as const;

// 검정 그림자 금지(DESIGN.md §3): 잉크색의 부드러운 그림자. 테두리 선 대신 이것으로 면을 띄운다.
export const shadow = {
  card: { shadowColor: '#333B31', shadowOpacity: 0.1, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 3 },
  dock: { shadowColor: '#333B31', shadowOpacity: 0.12, shadowRadius: 20, shadowOffset: { width: 0, height: -4 }, elevation: 12 },
} as const;

// 반투명 가림막(시트·축하 뒤): 잉크색.
export const scrim = { light: 'rgba(51, 59, 49, 0.25)', strong: 'rgba(51, 59, 49, 0.4)' } as const;
