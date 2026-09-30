// mobile/src/map/__tests__/catArt.test.ts
import { catArt, catPoses } from '../catArt';
import { CAT_COLOR_LABEL, CAT_COLORS, isCatColor } from '../catColors';

jest.mock('../cat-image.generated', () => ({
  CAT_IMAGES: {
    cheese: { sit: 'C-sit', walk: 'C-walk', lie: 'C-lie', happy: 'C-happy', look: 'C-look' },
    white: { sit: 'W-sit', walk: 'W-walk' },
    mackerel: {},
  },
}));

test('세 마리: 치즈·하양·고등어, 옛 값은 아니다', () => {
  expect(CAT_COLORS).toEqual(['cheese', 'white', 'mackerel']);
  expect(CAT_COLOR_LABEL).toEqual({ cheese: '치즈', white: '하양', mackerel: '고등어' });
  expect(isCatColor('white')).toBe(true);
  expect(isCatColor('gray')).toBe(false);
});

test('있는 자세는 그대로, 없는 자세는 그 고양이의 앉기, 고양이가 없으면 치즈 앉기', () => {
  expect(catArt('white', 'walk')).toBe('W-walk');
  expect(catArt('white', 'lie')).toBe('W-sit');
  expect(catArt('mackerel', 'happy')).toBe('C-sit');
});

test('지도용 묶음은 다섯 자세가 다 채워진다', () => {
  expect(catPoses('white')).toEqual({ sit: 'W-sit', walk: 'W-walk', lie: 'W-sit', happy: 'W-sit', look: 'W-sit' });
});
