// 회귀(숙제 83): gtx.html 링크 미리보기 — og·twitter 태그가 있고, 그림 파일이 1200×630 으로 있다.
// 배포본에서 그림 주소가 열리는지는 배포 때 확인(RUN-LOG).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.env.KR_RAIL_ROOT || process.cwd();
const html = readFileSync(join(ROOT, 'gtx.html'), 'utf8');
const meta = (attr, key) => { const m = new RegExp(`<meta ${attr}="${key}" content="([^"]*)"`).exec(html); return m ? m[1] : null; };
const SITE = 'https://plazalabs.github.io/kr-rail-map/';
const BANNED = ['떡상', '계단', '때문에', '오를', '사세요', '매수', '매도', '투자 추천'];

test('[R-83] gtx.html og·twitter 태그 (rank.html 과 같은 형식)', () => {
  for (const k of ['og:type', 'og:site_name', 'og:locale', 'og:url', 'og:title', 'og:description', 'og:image', 'og:image:width', 'og:image:height', 'og:image:alt'])
    assert.ok(meta('property', k), k);
  for (const k of ['twitter:card', 'twitter:title', 'twitter:description', 'twitter:image']) assert.ok(meta('name', k), k);
  assert.equal(meta('property', 'og:url'), SITE + 'gtx.html');
  assert.equal(meta('name', 'twitter:card'), 'summary_large_image');
  assert.equal(meta('property', 'og:image:width'), '1200');
  assert.equal(meta('property', 'og:image:height'), '630');
  assert.match(meta('property', 'og:description'), /집값 예측 아님/);
  const text = ['og:title', 'og:description', 'og:image:alt'].map(k => meta('property', k)).join(' ');
  assert.deepEqual(BANNED.filter(w => text.includes(w)), []);
});

test('[R-83] og:image 파일이 저장소에 있고 1200×630 JPEG', () => {
  const url = meta('property', 'og:image');
  assert.ok(url && url.startsWith(SITE), url);
  const p = join(ROOT, url.slice(SITE.length));
  assert.ok(existsSync(p), p);
  assert.equal(meta('name', 'twitter:image'), url);
  const b = readFileSync(p);
  assert.ok(b[0] === 0xff && b[1] === 0xd8, 'JPEG');
  let i = 2, wh = null;
  while (i < b.length) {
    const mk = b[i + 1], len = b.readUInt16BE(i + 2);
    if (mk >= 0xc0 && mk <= 0xc2) { wh = [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)]; break; }
    i += 2 + len;
  }
  assert.deepEqual(wh, [1200, 630]);
});

// 회귀(숙제 84): 이름 '몇분컷' — 제목·og 제목·그림에 'GTX 입구'·'GTX' 없음
test('[R-84] gtx.html 제목·og 제목에 GTX 없음, 몇분컷 있음 · og 그림 글자', () => {
  const title = (/<title>([^<]*)<\/title>/.exec(html) || [, ''])[1];
  const t = [title, meta('property', 'og:title'), meta('property', 'og:image:alt'), meta('name', 'twitter:title')];
  assert.deepEqual(t.filter(v => /GTX/.test(v)), []);
  assert.match(title, /몇분컷/);
  assert.match(meta('property', 'og:title'), /몇분컷/);
  assert.equal(meta('property', 'og:site_name'), '한국철도맵');
  const og = readFileSync(join(ROOT, 'data/build_og_gtx.js'), 'utf8').split(/\r?\n/).filter(l => /fillText/.test(l)).join(' ');
  assert.ok(og.includes('몇분컷'), 'og 그림에 몇분컷');
  assert.ok(!og.includes('GTX 입구'), 'og 그림에 GTX 입구 없음');
});
