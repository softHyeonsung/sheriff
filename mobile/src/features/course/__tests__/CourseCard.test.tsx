// mobile/src/features/course/__tests__/CourseCard.test.tsx
import { fireEvent, render, screen } from '@testing-library/react-native';
import { MSG } from '@/features/checkin/copy';
import { COURSE } from '../copy';
import { CourseCard } from '../CourseCard';

const a = { name: '세종로공원', address: '서울 종로구 세종대로 189', lat: 37.57, lng: 126.97, legM: 284 };
const b = { name: '경복궁', address: null, lat: 37.58, lng: 126.98, legM: 1200 };
const course = { stops: [a, b], route: [[37.5, 127]] as [number, number][], routeLimited: false };
const props = (over = {}) => ({ catName: '나비', course, onWish: jest.fn().mockResolvedValue(true), onFind: jest.fn(), onClose: jest.fn(), ...over });

test('제목·번호·이름·주소·거리·전체 거리·출처', async () => {
  await render(<CourseCard {...props()} />);
  expect(screen.getByText('나비가 가보고 싶대요')).toBeTruthy();
  expect(screen.getByText('1')).toBeTruthy();
  expect(screen.getByText('세종로공원')).toBeTruthy();
  expect(screen.getByText('서울 종로구 세종대로 189 · 약 280m')).toBeTruthy();
  expect(screen.getByText('약 1.2km')).toBeTruthy();
  expect(screen.getByText('전체 약 1.5km')).toBeTruthy(); // 구간 직선거리 합(284 + 1200), 자동차 길 거리(2680)가 아니다
  expect(screen.getByText(COURSE.source)).toBeTruthy();
});

test('받침 있는 이름은 "이"', async () => {
  await render(<CourseCard {...props({ catName: '콩' })} />);
  expect(screen.getByText('콩이 가보고 싶대요')).toBeTruthy();
});

test('한도로 길이 없으면 안내, 전체 거리는 그대로', async () => {
  await render(<CourseCard {...props({ course: { ...course, route: null, routeLimited: true } })} />);
  expect(screen.getByText(COURSE.limited)).toBeTruthy();
  expect(screen.getByText('전체 약 1.5km')).toBeTruthy();
});

test('길찾기 실패로 길이 없으면 한도 안내는 없다', async () => {
  await render(<CourseCard {...props({ course: { ...course, route: null } })} />);
  expect(screen.queryByText(COURSE.limited)).toBeNull();
});

test('찜 → "찜했어요"', async () => {
  const p = props();
  await render(<CourseCard {...p} />);
  await fireEvent.press(screen.getByRole('button', { name: '세종로공원 ⭐ 찜' }));
  expect(p.onWish).toHaveBeenCalledWith(a);
  expect(await screen.findByText(COURSE.wished)).toBeTruthy();
  expect(screen.getAllByRole('button', { name: /⭐ 찜$/ })).toHaveLength(1); // 다른 줄은 그대로
});

test('카카오에서 못 찾으면 안내 + 찜 화면에서 찾기', async () => {
  const p = props({ onWish: jest.fn().mockResolvedValue(false) });
  await render(<CourseCard {...p} />);
  await fireEvent.press(screen.getByRole('button', { name: '경복궁 ⭐ 찜' }));
  expect(await screen.findByText(COURSE.notFound)).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: '경복궁 찜 화면에서 찾기' }));
  expect(p.onFind).toHaveBeenCalledWith(b);
});

test('찜 실패 → 공통 문구, 버튼은 원래대로', async () => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  const p = props({ onWish: jest.fn().mockRejectedValue(new Error('boom')) });
  await render(<CourseCard {...p} />);
  await fireEvent.press(screen.getByRole('button', { name: '세종로공원 ⭐ 찜' }));
  expect(await screen.findByText(MSG.unknown)).toBeTruthy();
  expect(screen.getAllByRole('button', { name: /⭐ 찜$/ })).toHaveLength(2);
});

test('닫기', async () => {
  const p = props();
  await render(<CourseCard {...p} />);
  await fireEvent.press(screen.getByRole('button', { name: '닫기' }));
  expect(p.onClose).toHaveBeenCalled();
});

test('한글이 아닌 이름은 (이)가', async () => {
  await render(<CourseCard {...props({ catName: 'Tom' })} />);
  expect(screen.getByText('Tom(이)가 가보고 싶대요')).toBeTruthy();
});
