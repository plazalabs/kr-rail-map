/* 화면 점검(e2e)용 최소 CDP 헬퍼 — 외부 패키지 없음 (Node 22 내장 fetch / WebSocket)
 *
 * 출처: 2026-11-07 세션 점검 도구 cdp.js 를 저장소 기준으로 옮김.
 * 바꾼 점:
 *  - 크롬 위치를 환경에 맞춰 찾는다 (CHROME_PATH → Windows 기본 경로 → Linux 의 google-chrome/chromium)
 *  - 크롬 프로필을 OS 임시 폴더에 새로 만든다 (서비스워커·캐시가 남지 않게, 저장소에 쌓이지 않게)
 *  - Linux(CI)에서는 --no-sandbox (GitHub Actions 우분투 러너의 사용자 네임스페이스 제한 대응)
 *  - 결과 파일(스크린샷·JSON)은 E2E_OUT(기본: OS 임시 폴더/kr-rail-map-e2e) 아래에 쓴다
 */
'use strict';
const { spawn, execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const sleep = ms => new Promise(r => setTimeout(r, ms));

const BASE = process.env.E2E_BASE || 'http://127.0.0.1:8124/index.html';

function findChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const cands = process.platform === 'win32'
    ? ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']
    : process.platform === 'darwin'
      ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
      : [];
  for (const c of cands) if (fs.existsSync(c)) return c;
  if (process.platform !== 'win32') {
    for (const n of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']) {
      try { const p = execFileSync('which', [n], { encoding: 'utf8' }).trim(); if (p) return p; } catch (e) { /* 다음 후보 */ }
    }
  }
  throw new Error('크롬을 찾지 못했습니다. CHROME_PATH 환경 변수로 위치를 알려 주세요.');
}

function outDir(name) {
  const d = path.join(process.env.E2E_OUT || path.join(os.tmpdir(), 'kr-rail-map-e2e'), name);
  fs.mkdirSync(d, { recursive: true });
  return d;
}

// invest: true 면 페이지가 뜨기 전에 투자 모드(localStorage krrail-mode=invest)로 맞춘다 (js/mode.js, 기본은 철도 모드)
async function launch({ port = 9555, w = 1440, h = 1000, mobile = false, invest = false, guide = false, tip = false } = {}) {
  const prof = path.join(os.tmpdir(), `kr-rail-map-e2e-prof-${port}-${process.pid}-${Date.now()}`);
  const args = [
    '--headless=new', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check',
    '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    `--window-size=${w},${h}`, `--remote-debugging-port=${port}`,
    '--user-data-dir=' + prof,
  ];
  if (process.platform === 'linux') args.push('--no-sandbox', '--disable-dev-shm-usage');
  args.push('about:blank');
  const chrome = spawn(findChrome(), args, { stdio: 'ignore' });
  let target = null;
  for (let i = 0; i < 80 && !target; i++) {
    await sleep(250);
    try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(t => t.type === 'page'); } catch {}
  }
  if (!target) { chrome.kill(); throw new Error('chrome connect fail (port ' + port + ')'); }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener('open', r));
  let id = 0; const pending = new Map(); const logs = []; const handlers = [];
  ws.addEventListener('message', ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result); return; }
    if (m.method === 'Runtime.consoleAPICalled') logs.push(`[${m.params.type}] ` + m.params.args.map(a => a.value ?? a.description ?? a.type).join(' '));
    if (m.method === 'Runtime.exceptionThrown') { const d = m.params.exceptionDetails; logs.push('[EXC] ' + (d.exception && d.exception.description || d.text)); }
    if (m.method === 'Log.entryAdded') logs.push(`[log:${m.params.entry.level}] ${m.params.entry.text} ${m.params.entry.url || ''}`);
    if (m.method === 'Page.javascriptDialogOpening') { send('Page.handleJavaScriptDialog', Object.assign({ accept: true }, process.env.PROMPT_TEXT ? { promptText: process.env.PROMPT_TEXT } : {})); logs.push('[dialog] ' + m.params.message); }
    handlers.forEach(h => h(m));
  });
  function send(method, params = {}) { return new Promise((resolve, reject) => { const i = ++id; pending.set(i, { resolve, reject }); ws.send(JSON.stringify({ id: i, method, params })); }); }
  await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable'); await send('Network.enable');
  // CI 러너처럼 느린 기계를 흉내 낸다 (E2E_CPU_THROTTLE=4 → CPU 4배 느리게). 로컬에서 CI 전용 실패를 재현할 때 쓴다
  if (+process.env.E2E_CPU_THROTTLE > 1) await send('Emulation.setCPUThrottlingRate', { rate: +process.env.E2E_CPU_THROTTLE });
  // 처음 온 사람 안내 카드(js/guide.js)는 다른 점검의 클릭을 가릴 수 있어 기본으로 '본 것' 으로 둔다. guide 점검만 끈다(guide: true)
  if (!guide) await send('Page.addScriptToEvaluateOnNewDocument', { source: `try { localStorage.setItem('krrail-guide-seen', '1'); } catch (e) {}` });
  // 투자 모드 첫 안내(js/mode.js)도 같은 이유로 기본 '본 것'. first-hints 점검만 끈다(tip: true)
  if (!tip) await send('Page.addScriptToEvaluateOnNewDocument', { source: `try { localStorage.setItem('krrail-invest-tip-seen', '1'); } catch (e) {}` });
  if (invest) await send('Page.addScriptToEvaluateOnNewDocument', { source: `try { localStorage.setItem('krrail-mode', 'invest'); } catch (e) {}` });
  if (mobile) await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 2, mobile: true });
  await send('Browser.grantPermissions', { permissions: ['geolocation', 'clipboardReadWrite', 'clipboardSanitizedWrite'] }).catch(() => {});
  // 내 위치: 서울역 좌표 주입 (실제 GPS 대신)
  await send('Emulation.setGeolocationOverride', { latitude: 37.5547, longitude: 126.9706, accuracy: 30 }).catch(() => {});
  async function evaluate(expr) {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error('eval: ' + (r.exceptionDetails.exception && r.exceptionDetails.exception.description || r.exceptionDetails.text));
    return r.result.value;
  }
  async function goto(url, wait = 4000) { await send('Page.navigate', { url }); await sleep(wait); }
  async function shot(file, clip) {
    const r = await send('Page.captureScreenshot', Object.assign({ format: 'png' }, clip ? { clip } : {}));
    fs.writeFileSync(file, Buffer.from(r.data, 'base64'));
  }
  async function click(x, y) {
    for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased'])
      await send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
  }
  async function key(k, code, keyCode) {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code: code || k, windowsVirtualKeyCode: keyCode || 0 });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code: code || k, windowsVirtualKeyCode: keyCode || 0 });
  }
  async function type(text) { await send('Input.insertText', { text }); }
  function close() {
    try { ws.close(); } catch {}
    chrome.kill();
    // 이 실행이 만든 임시 프로필만 정리 (크롬이 손을 놓을 때까지 조금 기다린다)
    setTimeout(() => { try { fs.rmSync(prof, { recursive: true, force: true }); } catch (e) {} }, 1500);
  }
  return { send, evaluate, goto, shot, click, key, type, logs, close, sleep, handlers };
}

/* 판정 기록 — 마지막에 finish() 가 요약을 찍고 실패가 있으면 종료 코드 1 */
function recorder(name) {
  const rows = [];
  function check(item, ok, note) {
    rows.push({ item, ok: ok === null ? null : !!ok, note });
    const tag = ok === null ? '미검증' : ok ? 'PASS' : 'FAIL';
    console.log(`[${tag}] ${item}${note === undefined ? '' : ' — ' + (typeof note === 'string' ? note : JSON.stringify(note))}`.slice(0, 600));
  }
  function finish(extra) {
    const pass = rows.filter(r => r.ok === true).length, fail = rows.filter(r => r.ok === false).length, unv = rows.filter(r => r.ok === null).length;
    console.log(`E2E-SUMMARY ${name}: pass ${pass} fail ${fail} 미검증 ${unv}`);
    try { fs.writeFileSync(path.join(outDir(name), 'result.json'), JSON.stringify({ name, pass, fail, unverified: unv, rows, extra }, null, 1)); } catch (e) {}
    process.exitCode = fail ? 1 : 0;
    return { pass, fail, unv };
  }
  return { check, finish, rows };
}

/* 지도에서 역을 실제로 클릭한다 — 그 역이 '클릭으로 잡히는' 상태가 될 때까지 기다린 뒤에.
 *
 * 지도를 처음 가 보는 곳으로 옮기면(jumpTo) 역 점이 그려져 queryRenderedFeatures 에 잡히기까지 시간이 걸린다.
 * 2026-11-09 측정: 보통 속도에서 0.3초 안에 못 잡힘 6/15, CPU 6배 느리게 하면 1.8초 뒤에도 못 잡힘 1/15.
 * 예전 테스트는 1.8초 고정으로 기다린 뒤 눈감고 클릭해서, 전체 e2e 처럼 바쁠 때 가끔 빗나갔다
 * (fav-stations '서울 시청만 해제', focus-return '마우스: 지도에서 역 클릭' FLAKY 의 원인).
 * 앱의 클릭 처리(app.js map.on('click') — 클릭 지점 18px 안의 역)와 같은 조건으로 잡히는지 본다.
 * 반환: { ok, waitedMs, why } — ok 면 클릭까지 했다. */
async function clickStation(b, id, { timeout = 10000 } = {}) {
  const t0 = Date.now();
  let pt = null;
  while (Date.now() - t0 < timeout) {
    pt = await b.evaluate(`(() => { const s = STATIONS.find(f => f.properties.id === ${JSON.stringify(id)}); if (!s) return null;
      const p = map.project(s.geometry.coordinates); const r = map.getCanvas().getBoundingClientRect();
      const hit = map.queryRenderedFeatures([[p.x - 18, p.y - 18], [p.x + 18, p.y + 18]], { layers: ['rail-stations'] });
      return { x: r.x + p.x, y: r.y + p.y, first: hit.length ? hit[0].properties.id : null }; })()`).catch(() => null);
    if (pt && pt.first === id) break;
    await sleep(150);
  }
  if (!pt) return { ok: false, waitedMs: Date.now() - t0, why: '역 없음' };
  if (pt.first !== id) return { ok: false, waitedMs: Date.now() - t0, why: '시간 안에 클릭으로 잡히지 않음 (잡힌 것: ' + pt.first + ')' };
  await b.click(pt.x, pt.y);
  return { ok: true, waitedMs: Date.now() - t0 };
}

module.exports = { launch, sleep, BASE, outDir, recorder, findChrome, clickStation };
