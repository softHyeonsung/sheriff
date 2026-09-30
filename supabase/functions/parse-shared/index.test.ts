// supabase/functions/parse-shared/index.test.ts
import { assertEquals } from 'jsr:@std/assert';
import { fetchTitle, lineCandidates, parseShared, titleFrom, urlsIn } from './index.ts';

const place = (id: string, name = id) => ({ placeId: id, name, roadAddress: null, lat: 1, lng: 1, distanceM: null });

Deno.test('urlsIn·lineCandidates: 링크와 이름 줄을 가른다', () => {
  const text = '[네이버 지도]\n스타벅스 성수점\n서울 성동구 성수이로 1\nhttps://naver.me/abc';
  assertEquals(urlsIn(text), ['https://naver.me/abc']);
  assertEquals(lineCandidates(text), ['스타벅스 성수점', '서울 성동구 성수이로 1']);
  assertEquals(lineCandidates('https://kko.to/x'), []);
  assertEquals(lineCandidates('010-1234-5678\n' + 'y'.repeat(41) + '\n진짜 이름'), ['진짜 이름']);
});

Deno.test('titleFrom: 지도 사이트 제목에서 가게 이름만, 인스타는 설명 첫 부분', () => {
  assertEquals(titleFrom('<meta property="og:title" content="스타벅스 성수점 : 네이버">', 'm.place.naver.com'), '스타벅스 성수점');
  assertEquals(titleFrom('<title>카페 어니언 | 카카오맵</title>', 'place.map.kakao.com'), '카페 어니언');
  assertEquals(
    titleFrom('<meta property="og:description" content="120 likes, 3 comments - cafe_lover on May 1: &quot;성수 카페 어니언 다녀옴\n빵 최고&quot;">', 'www.instagram.com'),
    '성수 카페 어니언 다녀옴',
  );
  assertEquals(titleFrom('<html></html>', 'kko.to'), null);
});

Deno.test('fetchTitle: 허용된 곳만 따라가고, 밖으로 튀면 멈춘다', async () => {
  const seen: string[] = [];
  const fake = ((url: string) => {
    seen.push(url);
    if (url === 'https://naver.me/abc') return Promise.resolve(new Response(null, { status: 302, headers: { Location: 'https://m.place.naver.com/restaurant/1' } }));
    if (url === 'https://m.place.naver.com/restaurant/1') return Promise.resolve(new Response('<meta property="og:title" content="스타벅스 성수점 : 네이버">'));
    if (url === 'https://kko.to/evil') return Promise.resolve(new Response(null, { status: 302, headers: { Location: 'http://169.254.169.254/' } }));
    return Promise.resolve(new Response('nope'));
  }) as unknown as typeof fetch;
  assertEquals(await fetchTitle('https://naver.me/abc', fake), '스타벅스 성수점');
  assertEquals(await fetchTitle('https://kko.to/evil', fake), null);
  assertEquals(await fetchTitle('https://example.com/x', fake), null);
  assertEquals(seen.includes('http://169.254.169.254/'), false);
  assertEquals(seen.includes('https://example.com/x'), false);
});

Deno.test('parseShared: 링크 제목 → 글 줄 순으로 최대 3개 이름을 검색, 합쳐서 중복 제거', async () => {
  const searched: string[] = [];
  const r = await parseShared('스타벅스 성수점\n서울 성동구\nhttps://naver.me/abc\nhttps://example.com/x', null, {
    fetchTitle: (url) => Promise.resolve(url === 'https://naver.me/abc' ? '스타벅스 성수점' : 'SHOULD NOT'),
    search: (q) => {
      searched.push(q);
      return Promise.resolve(q === '스타벅스 성수점' ? [place('1', '스타벅스 성수점')] : [place('1'), place('2')]);
    },
  });
  assertEquals(searched, ['스타벅스 성수점', '서울 성동구']);
  assertEquals(r.places.map((p) => p.placeId), ['1', '2']);
  assertEquals(r.query, '스타벅스 성수점');
});

Deno.test('parseShared: 아무것도 못 찾으면 빈 목록, 검색 실패는 건너뛴다', async () => {
  const r = await parseShared('https://example.com/x', null, {
    fetchTitle: () => Promise.resolve(null),
    search: () => Promise.reject(new Error('kakao down')),
  });
  assertEquals(r, { places: [], query: null });
});
