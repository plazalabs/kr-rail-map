// 회귀(숙제 34, 회장 결정 11-17): 슬로건은 "철도의 축, 도시의 내일" 하나만.
// 고치기 전: 옛 슬로건 '축을 읽으면, 도시의 미래가 보인다'가 index.html 상태줄·TOP 10 공유 그림(station-share.js)·랭킹 og 그림(build_og_rank.js)에 남아 있었다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.env.KR_RAIL_ROOT || process.cwd();
const SLOGAN = '철도의 축, 도시의 내일';
const OLD = /축을 읽으면|도시의 미래가 보인다/;

// 화면·그림을 만드는 파일: 맨 위 *.html · site.webmanifest · js/*.js · data/*.js(그림·자료 굽는 스크립트)
function files() {
  const out = readdirSync(ROOT).filter(f => f.endsWith('.html') || f === 'site.webmanifest');
  for (const d of ['js', 'data']) for (const f of readdirSync(join(ROOT, d))) if (f.endsWith('.js')) out.push(d + '/' + f);
  return out;
}

test('[R-34] 화면·그림 만드는 코드에 옛 슬로건 0', () => {
  const bad = [];
  for (const f of files()) readFileSync(join(ROOT, f), 'utf8').split(/\r?\n/).forEach((ln, i) => { if (OLD.test(ln)) bad.push(`${f}:${i + 1}: ${ln.trim().slice(0, 80)}`); });
  assert.deepEqual(bad, []);
});

test('[R-34] 슬로건 자리(상태줄·TOP 10 공유 그림·랭킹 og 그림)에 "철도의 축, 도시의 내일"', () => {
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
  const status = (html.match(/<div id="status"[^>]*>([^<]*)</) || [])[1] || '';
  assert.ok(status.startsWith(SLOGAN), 'index.html 상태줄: ' + status);
  for (const f of ['js/station-share.js', 'data/build_og_rank.js'])
    assert.ok(readFileSync(join(ROOT, f), 'utf8').includes(`fillText('${SLOGAN}'`), f + ' 에 슬로건 글자 없음');
});
