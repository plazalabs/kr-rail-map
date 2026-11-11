/* e2e 크롬 임시 프로필 정리 (2026-11-12)
 *
 * 왜: 크롬을 띄울 때마다 OS 임시 폴더에 kr-rail-map-e2e-prof-<port>-<pid>-<시각> (약 63MB)를 만든다.
 *     예전에는 close() 가 1.5초 뒤 지우기를 '예약'만 했는데, 점검 프로세스가 그 전에 끝나거나(process.exit),
 *     윈도우에서 크롬 하위 프로세스가 파일을 아직 잡고 있거나, 점검이 예외로 멈추면 그대로 남았다.
 *     11/9~11/11 사흘 동안 211개·13.3GB 가 쌓였다.
 * 어떻게:
 *  1) close() → 크롬 프로세스가 '실제로 끝난 뒤' 여러 번 다시 시도하며 지운다 (removeNow).
 *  2) 점검 프로세스가 끝날 때(정상·실패·예외·Ctrl+C) 이 프로세스가 만든 프로필을 동기로 한 번 더 지운다.
 *  3) 실행기(run.js)는 시작·끝에 sweep() — 주인 프로세스(pid)가 이미 없는 옛 프로필을 지운다.
 *     E2E_KEEP_PROFILES=1 이면 실패 추적용으로 남기되 최근 3개까지만 둔다.
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const PREFIX = 'kr-rail-map-e2e-prof-';
const KEEP_MAX = 3;
const mine = new Map();   // 프로필 경로 → 크롬 ChildProcess

function profilePath(port) {
  return path.join(os.tmpdir(), `${PREFIX}${port}-${process.pid}-${Date.now()}`);
}

// 동기 지우기 — 잠긴 파일이 풀릴 때까지 조금씩 다시 시도한다 (Node rmSync 의 maxRetries 는 EBUSY·EPERM 등에 재시도)
function rmSyncRetry(dir, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 8, retryDelay: 150 }); } catch (e) { /* 다음 시도 */ }
    if (!fs.existsSync(dir)) return true;
  }
  return !fs.existsSync(dir);
}

function killTree(child) {
  if (!child || child.exitCode !== null || child.killed && child.exitCode !== null) return;
  try {
    if (process.platform === 'win32') execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    else child.kill('SIGKILL');
  } catch (e) { try { child.kill(); } catch (e2) { /* 이미 끝남 */ } }
}

function track(dir, child) { mine.set(dir, child); }

// 크롬을 끄고, 끝난 뒤 지운다. Promise — 기다려도 되고 안 기다려도 된다 (프로세스 종료 때 한 번 더 지운다)
function removeNow(dir) {
  const child = mine.get(dir);
  return new Promise(resolve => {
    const done = () => { const ok = rmSyncRetry(dir); if (ok) mine.delete(dir); resolve(ok); };
    if (!child || child.exitCode !== null) { done(); return; }
    let finished = false;
    const fin = () => { if (finished) return; finished = true; setTimeout(done, 300); };
    child.once('exit', fin);
    killTree(child);
    setTimeout(fin, 4000);   // exit 이 안 와도 4초 뒤엔 지운다
  });
}

// 점검 프로세스가 끝날 때 — 남은 크롬을 죽이고 이 프로세스가 만든 프로필을 지운다 (동기만 가능)
let hooked = false;
function hookExit() {
  if (hooked) return; hooked = true;
  process.on('exit', () => {
    for (const [dir, child] of mine) { killTree(child); }
    for (const dir of mine.keys()) {
      if (process.env.E2E_KEEP_PROFILES === '1') continue;
      // 크롬이 손을 놓을 시간을 조금 준다 (동기 대기)
      const until = Date.now() + 1500;
      while (!rmSyncRetry(dir, 1) && Date.now() < until) { /* busy-wait */ }
    }
  });
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => process.exit(130));
  process.on('uncaughtException', e => { console.error(e); process.exit(1); });
}

function alive(pid) {
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}

function list() {
  let names = [];
  try { names = fs.readdirSync(os.tmpdir()).filter(n => n.startsWith(PREFIX)); } catch (e) { return []; }
  return names.map(n => {
    const m = n.slice(PREFIX.length).match(/^(\d+)-(\d+)-(\d+)$/);
    const full = path.join(os.tmpdir(), n);
    let mtime = 0; try { mtime = fs.statSync(full).mtimeMs; } catch (e) {}
    return { name: n, full, pid: m ? +m[2] : null, ts: m ? +m[3] : mtime };
  });
}

function sizeOf(dir) {
  let total = 0;
  const walk = d => { let ents = []; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch (e) { return; }
    for (const e of ents) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else { try { total += fs.statSync(p).size; } catch (er) {} } } };
  walk(dir);
  return total;
}

// 주인이 끝난 프로필 지우기. keep: 남길 최근 개수 (기본 0, E2E_KEEP_PROFILES=1 이면 3)
function sweep({ keep } = {}) {
  const k = keep != null ? keep : (process.env.E2E_KEEP_PROFILES === '1' ? KEEP_MAX : 0);
  const all = list();
  const stale = all.filter(p => !p.pid || (p.pid !== process.pid && !alive(p.pid))).sort((a, b) => b.ts - a.ts);
  let removed = 0, left = 0;
  stale.forEach((p, i) => { if (i < Math.min(k, KEEP_MAX)) { left++; return; } if (rmSyncRetry(p.full)) removed++; else left++; });
  return { found: all.length, stale: stale.length, removed, kept: left, inUse: all.length - stale.length };
}

function stats() {
  const all = list();
  return { count: all.length, bytes: all.reduce((a, p) => a + sizeOf(p.full), 0) };
}

module.exports = { PREFIX, profilePath, track, removeNow, hookExit, sweep, stats, list };
