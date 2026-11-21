// 회귀(숙제 87): 랭킹 링크 미리보기 그림 image/og-rank.jpg 의 숫자 기준.
// 고치기 전: 그림은 '전체 개통' 기준(의정부 448→125위), 홈 카드·랭킹은 '2031년까지' 기준(448→117위).
// 고침: data/build_og_rank.js 가 홈·랭킹과 같은 기본 기준(rank.json default_year)으로 굽고, 그림에 기준 글자를 넣는다.
// 그림 픽셀은 읽을 수 없어서, 굽는 스크립트가 그림에 쓴 값을 data/og-rank.json 에 같이 적고(그림 sha1 포함) 그것을 맞춰 본다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';

const ROOT = process.env.KR_RAIL_ROOT || process.cwd();
const read = p => readFileSync(join(ROOT, p), 'utf8');
const json = p => JSON.parse(read(p));
const req = createRequire(import.meta.url);

test('[R-87] og-rank 그림 기준 연도 = rank.json default_year, 그림에 기준 글자', () => {
  assert.ok(existsSync(join(ROOT, 'data/og-rank.json')), 'data/og-rank.json 없음 — node data/build_og_rank.js 로 그림과 같이 만든다');
  const og = json('data/og-rank.json'), rank = json('data/rank.json');
  const RT = req(join(ROOT, 'js/rank.js'));
  assert.equal(og.year, String(rank.default_year), `그림 기준 '${og.year}' ≠ default_year ${rank.default_year}`);
  assert.equal(og.year, RT.defaultYear(rank));
  assert.match(og.scenario, new RegExp('^' + og.year + '년까지 개통 가정'), '그림 기준 글자: ' + og.scenario);
});

test('[R-87] og-rank 그림 숫자 = 지금 rank.json 으로 다시 계산한 값, 그림 파일도 그때 구운 것', () => {
  const og = json('data/og-rank.json'), rank = json('data/rank.json');
  const B = req(join(ROOT, 'data/build_og_rank.js'));
  assert.equal(typeof B.ogData, 'function', 'build_og_rank.js 가 ogData 를 내보내지 않음 (require 만으로 크롬을 띄우면 안 됨)');
  const { jpg_sha1, ...meta } = og;
  assert.deepEqual(meta, B.ogData(rank), 'data/og-rank.json 이 지금 rank.json 과 다름 — 다시 굽기');
  const sha = createHash('sha1').update(readFileSync(join(ROOT, 'image/og-rank.jpg'))).digest('hex');
  assert.equal(jpg_sha1, sha, 'image/og-rank.jpg 가 data/og-rank.json 과 같이 구운 그림이 아님');
});

test('[R-87] og-rank 그림 숫자 = rank-top.json = 홈 카드 (의정부 448→117위)', () => {
  const og = json('data/og-rank.json'), top = json('data/rank-top.json');
  assert.equal(og.year, String(top.year), `그림 '${og.year}' ≠ rank-top '${top.year}'`);
  assert.equal(og.total, top.total);
  const pick = r => ({ n: r.n, now: r.now, aft: r.aft, ch: r.ch });
  assert.deepEqual(og.top.slice(0, top.top.length).map(pick), top.top.map(pick));
  assert.deepEqual(pick(og.top[0]), { n: '의정부', now: 448, aft: 117, ch: 331 });
  // 홈 카드는 rank-top.json 을 그대로 읽는다
  assert.match(read('js/home-cards.js'), /rank-top\.json/);
});
