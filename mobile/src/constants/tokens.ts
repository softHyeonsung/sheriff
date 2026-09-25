// Native mirror of design-tokens.css (theme "앰버 마을"). Screens reference these, never raw hex.
export const color = {
  surface: '#FBF6EC',
  surfaceCard: '#FFFFFF',
  primary: '#E6A552',
  primaryDeep: '#C98A3C',
  nature: '#9FBF9C',
  natureDeep: '#6E8F6B',
  fog: '#CFC8BA',
  sky: '#BFD8DF',
  ink: '#4A3D30',
  inkSub: '#8A7A68',
  line: '#ECE3D2',
  onPrimary: '#3B2A16',
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
  semibold: 'Pretendard-SemiBold',
  bold: 'Pretendard-Bold',
} as const;

export const type = {
  display: { fontFamily: font.bold, fontSize: 28, lineHeight: 36 },
  title: { fontFamily: font.bold, fontSize: 22, lineHeight: 30 },
  subtitle: { fontFamily: font.semibold, fontSize: 18, lineHeight: 26 },
  body: { fontFamily: font.regular, fontSize: 16, lineHeight: 24 },
  caption: { fontFamily: font.regular, fontSize: 13, lineHeight: 18 },
} as const;

export const radius = { card: 16, btn: 12, sheet: 24, pill: 999, min: 8 } as const;
export const space = { gutter: 20, section: 24, tapMin: 44 } as const;
