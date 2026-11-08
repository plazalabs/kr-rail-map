/* e2e: 개발(공급) 패널 글자가 모든 테마에서 읽히는가 (IMPL12 건 5)
 *  - js/dev.js 가 쓰는 색 변수(--text·--text-2·--surface-2·--muted·--border)가 테마마다 정의돼 있는지
 *  - 역 상세 '앞으로 들어올 세대' 절의 글자 대비(WCAG): 본문 4.5:1 이상
 * 실행: node tests/e2e/run.js --only dev-theme
 */
'use strict';
const path = require('path');
const { launch, sleep, BASE, recorder, outDir } = require('./lib/cdp');
const R = recorder('dev-theme');
const OUT = outDir('dev-theme');
const CONTRAST = `(() => {
  const cv = document.createElement('canvas').getContext('2d');
  const rgb = c => { cv.clearRect(0, 0, 1, 1); cv.fillStyle = '#000'; cv.fillStyle = c; cv.fillRect(0, 0, 1, 1); const d = cv.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2]]; };
  const lum = c => { const m = rgb(c); const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(m[0]) + 0.7152 * f(m[1]) + 0.0722 * f(m[2]); };
  const opaque = b => { const m = b.match(/rgba?\(([^)]+)\)/); if (!m) return b !== 'transparent'; const p = m[1].split(/[ ,\/]+/).filter(Boolean); return p.length < 4 || parseFloat(p[3]) > 0.5; };
  const bgOf = el => { for (let e = el; e; e = e.parentElement) { const b = getComputedStyle(e).backgroundColor; if (opaque(b)) return b; }
    const v = getComputedStyle(document.body).getPropertyValue('--panel').trim(); return v || 'rgb(255,255,255)'; };
  const sec = [...document.querySelectorAll('#sd-body .sd-sec')].find(s => /앞으로 들어올 세대/.test(s.textContent));
  if (!sec) return null;
  const out = [];
  for (const el of sec.querySelectorAll('[class^="dv-"], [class*=" dv-"]')) {
    if (!el.textContent.trim() || !el.offsetParent) continue;
    const fg = getComputedStyle(el).color, bg = bgOf(el);
    const L1 = lum(fg), L2 = lum(bg), r = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    out.push({ cls: el.className, fg, bg, ratio: +r.toFixed(2) });
  }
  return out;
})()`;

(async () => {
  const b = await launch({ port: 9693, w: 1280, h: 900 });
  await b.send('Network.setBypassServiceWorker', { bypass: true });
  await b.goto(BASE, 3000);
  for (let i = 0; i < 120; i++) { await sleep(400); if (await b.evaluate(`typeof dataReady!=='undefined'&&dataReady&&map.loaded()`).catch(() => false)) break; }
  const vars = await b.evaluate(`(() => { const themes = [...document.querySelectorAll('#theme-row .theme-btn')].map(e => e.dataset.theme); const res = {};
    for (const t of themes) { document.body.dataset.theme = t; const cs = getComputedStyle(document.body);
      res[t] = ['--text','--text-2','--surface-2','--muted','--border'].filter(v => !cs.getPropertyValue(v).trim()); } return res; })()`);
  R.check('dev.js 색 변수가 모든 테마에 정의됨', Object.values(vars).every(a => a.length === 0), vars);
  const themes = Object.keys(vars);
  for (const t of themes) {
    await b.evaluate(`(() => { const btn = document.querySelector('#theme-row .theme-btn[data-theme="${t}"]'); if (btn) btn.click(); else document.body.dataset.theme = '${t}'; 0 })()`);
    await sleep(400);
    await b.evaluate(`(() => { const s = STATIONS.find(x => x.properties.name_ko === '노량진'); StationDetail.show(s); 0 })()`);
    let rows = null;
    for (let i = 0; i < 30 && !rows; i++) { await sleep(400); rows = await b.evaluate(CONTRAST); }
    if (!rows) { R.check(`${t}: 공급 절이 열림`, false); continue; }
    const low = rows.filter(r => r.ratio < 4.5);
    R.check(`${t}: 공급 절 글자 ${rows.length}개 모두 대비 4.5:1 이상`, low.length === 0, low.slice(0, 4));
    if (t === 'dark') {
      await b.evaluate(`(() => { const s = [...document.querySelectorAll('#sd-body .sd-sec')].find(x => /앞으로 들어올 세대/.test(x.textContent)); s.scrollIntoView({ block: 'start' }); 0 })()`);
      await sleep(300);
      await b.shot(path.join(OUT, 'dark-dev.png'));
    }
  }
  R.finish();
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
