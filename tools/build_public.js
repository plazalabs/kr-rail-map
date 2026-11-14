#!/usr/bin/env node
/* 공개 사이트용 결과물 만들기 (저장소 분리 준비, 2026-11-12)
 *
 * 사이트가 실제로 쓰는 파일만 dist/ 에 모으고, 우리 JS·CSS·HTML 의 주석을 지운다.
 * (주석에 계산법·자료 처리 과정이 적혀 있어 공개 저장소·'소스 보기'에 드러나지 않게)
 *   - 외부 패키지 없이 직접 토큰을 읽어 지운다: 문자열('', "", ``, ${…}) · 정규식 /…/ 안의 // 와 /* 는 건드리지 않는다
 *   - vendor/ (MapLibre·Pretendard) 는 손대지 않고 그대로 (라이선스 고지 유지)
 *   - JS 는 지운 뒤 문법 검사(vm.Script) — 하나라도 깨지면 실패로 끝낸다
 *   - HTML 안의 <script>(JSON-LD 제외)·<style> 도 같은 방법, <!-- --> 주석은 지운다
 * 실행: node tools/build_public.js [출력폴더=dist]
 * 확인: E2E_BASE=http://127.0.0.1:8124/index.html 로 dist 를 띄워 전체 e2e (tools/README 참고)
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const OUT = path.resolve(ROOT, process.argv[2] || 'dist');

// 사이트가 쓰는 것만 (js/·css/·line/·icons/·image/·vendor/ 는 폴더째)
const FILES = [
  'index.html', 'data.html', 'rank.html', 'board.html', 'sw.js', 'site.webmanifest', 'robots.txt', 'sitemap.xml', 'LICENSE',
  'data/lines.geojson', 'data/stations.geojson', 'data/exits.geojson', 'data/access.json', 'data/rank.json', 'data/sources.json',
  'data/ktx-fares.json', 'data/transfer-times.json', 'data/station-complex.json', 'data/station-dev.json', 'data/station-jeonse.json',
  'data/station-market.json', 'data/station-price.json', 'data/station-region.json',
  'data/fares-special.json', 'data/headways.json', 'data/rank-top.json', 'data/station-trend.json',
];
const DIRS = ['js', 'css', 'line', 'icons', 'image', 'vendor'];

/* ---------- JS 주석 지우기 ---------- */
const REGEX_AFTER_WORD = new Set(['return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'throw', 'case', 'do', 'else', 'yield', 'await']);
function stripJs(src) {
  let out = '';
  let i = 0;
  const n = src.length;
  let last = '';          // 직전 의미 있는 토큰의 끝 글자(또는 낱말)
  const tpl = [];         // 템플릿 리터럴 안 ${ 의 중괄호 깊이
  const regexOk = () => {
    if (last === '') return true;
    if (/^[A-Za-z_$][\w$]*$/.test(last)) return REGEX_AFTER_WORD.has(last);
    if (/[\w$)\]]$/.test(last)) return false;
    return true;          // ( , = : [ ! & | ? { } ; + - * % < > ~ ^ 뒤
  };
  while (i < n) {
    const c = src[i], d = src[i + 1];
    // 템플릿 ${ … } 닫힘
    if (c === '}' && tpl.length && tpl[tpl.length - 1] === 0) {
      tpl.pop(); i++; out += '}';
      // 템플릿 본문 계속
      i = readTemplate(i);
      continue;
    }
    if (c === '{' && tpl.length) { tpl[tpl.length - 1]++; out += c; i++; last = c; continue; }
    if (c === '}' && tpl.length) { tpl[tpl.length - 1]--; out += c; i++; last = c; continue; }
    if (c === '/' && d === '/') {           // 줄 주석
      while (i < n && src[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && d === '*') {           // 덩이 주석
      const e = src.indexOf('*/', i + 2);
      const body = src.slice(i, e < 0 ? n : e + 2);
      out += body.includes('\n') ? '\n' : ' ';
      i = e < 0 ? n : e + 2;
      continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < n && src[j] !== c) { if (src[j] === '\\') j++; if (src[j] === '\n') break; j++; }
      out += src.slice(i, j + 1); i = j + 1; last = c; continue;
    }
    if (c === '`') { out += '`'; i = readTemplate(i + 1); continue; }
    if (c === '/' && regexOk()) {           // 정규식 리터럴
      let j = i + 1, cls = false;
      while (j < n) {
        const ch = src[j];
        if (ch === '\\') { j += 2; continue; }
        if (ch === '[') cls = true; else if (ch === ']') cls = false;
        else if (ch === '/' && !cls) break;
        else if (ch === '\n') break;
        j++;
      }
      j++;
      while (j < n && /[a-z]/i.test(src[j])) j++;
      out += src.slice(i, j); i = j; last = 'regex)'; continue;
    }
    if (/[A-Za-z_$]/.test(c)) {
      let j = i + 1; while (j < n && /[\w$]/.test(src[j])) j++;
      last = src.slice(i, j); out += last; i = j; continue;
    }
    if (/\s/.test(c)) { out += c; i++; continue; }
    out += c; last = c; i++;
  }
  return out;

  // 템플릿 본문을 읽어 out 에 붙이고, ${ 를 만나면 깊이를 쌓고 돌아간다. 반환 = 다음 위치
  function readTemplate(k) {
    let j = k;
    while (j < n) {
      if (src[j] === '\\') { j += 2; continue; }
      if (src[j] === '`') { out += src.slice(k, j + 1); last = '`'; return j + 1; }
      if (src[j] === '$' && src[j + 1] === '{') { out += src.slice(k, j + 2); tpl.push(0); last = '{'; return j + 2; }
      j++;
    }
    out += src.slice(k); return n;
  }
}

/* ---------- CSS 주석 지우기 ---------- */
function stripCss(src) {
  let out = '', i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i + 2); i = e < 0 ? src.length : e + 2; continue; }
    if (c === '"' || c === "'") { let j = i + 1; while (j < src.length && src[j] !== c) { if (src[j] === '\\') j++; j++; } out += src.slice(i, j + 1); i = j + 1; continue; }
    out += c; i++;
  }
  return out;
}

// 빈 줄·줄 끝 공백 정리
const tidy = s => s.split('\n').map(l => l.replace(/\s+$/, '')).filter(l => l.trim() !== '').join('\n') + '\n';

/* ---------- HTML ---------- */
function stripHtml(src) {
  let s = src.replace(/<!--[\s\S]*?-->/g, '');
  s = s.replace(/(<script\b([^>]*)>)([\s\S]*?)(<\/script>)/gi, (m, open, attrs, body, close) => {
    if (/application\/ld\+json/i.test(attrs) || /\bsrc=/i.test(attrs) || !body.trim()) return m;
    return open + '\n' + tidy(stripJs(body)) + close;
  });
  s = s.replace(/(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi, (m, open, body, close) => open + '\n' + tidy(stripCss(body)) + close);
  return tidy(s);
}

/* ---------- 모으기 ---------- */
function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = dir + '/' + e.name;
    if (e.isDirectory()) out.push(...walk(rel)); else out.push(rel);
  }
  return out;
}

function main() {
  fs.rmSync(OUT, { recursive: true, force: true });
  const list = FILES.concat(...DIRS.map(walk));
  let before = 0, after = 0, broken = [];
  const stat = { js: 0, css: 0, html: 0, copy: 0 };
  for (const rel of list) {
    const src = path.join(ROOT, rel), dst = path.join(OUT, rel);
    if (!fs.existsSync(src)) { console.error('없음: ' + rel); process.exitCode = 1; continue; }
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    const vendor = rel.startsWith('vendor/');
    const ext = path.extname(rel);
    if (!vendor && (ext === '.js' || ext === '.css' || ext === '.html')) {
      const raw = fs.readFileSync(src, 'utf8').replace(/\r\n/g, '\n');
      const res = ext === '.js' ? tidy(stripJs(raw)) : ext === '.css' ? tidy(stripCss(raw)) : stripHtml(raw);
      if (ext === '.js') {
        try { new vm.Script(res, { filename: rel }); } catch (e) { broken.push(rel + ': ' + e.message); }
      }
      before += Buffer.byteLength(raw); after += Buffer.byteLength(res);
      fs.writeFileSync(dst, res);
      stat[ext.slice(1)]++;
    } else {
      fs.copyFileSync(src, dst); stat.copy++;
    }
  }
  // 주석이 남았나 (줄 맨 앞 // 또는 /*)
  const left = [];
  for (const rel of list.filter(r => !r.startsWith('vendor/') && /\.(js|css)$/.test(r))) {
    const t = fs.readFileSync(path.join(OUT, rel), 'utf8');
    t.split('\n').forEach((l, k) => { if (/^\s*(\/\/|\/\*)/.test(l)) left.push(rel + ':' + (k + 1)); });
  }
  console.log(`dist: JS ${stat.js} · CSS ${stat.css} · HTML ${stat.html} 주석 지움, 그대로 복사 ${stat.copy}개`);
  console.log(`글자 수: ${(before / 1024).toFixed(0)}KB → ${(after / 1024).toFixed(0)}KB (${Math.round(100 - 100 * after / before)}% 줄어듦)`);
  console.log(`줄 맨 앞 주석 남은 곳: ${left.length}` + (left.length ? ' — ' + left.slice(0, 5).join(', ') : ''));
  if (broken.length) { console.error('문법이 깨진 JS:\n  ' + broken.join('\n  ')); process.exitCode = 1; }
  else console.log('JS 문법 검사: 모두 통과');

  // 사이트 코드가 부르는 자료 파일이 dist 에 다 있는지 (FILES 목록 갱신을 잊으면 공개 사이트 기능이 깨진다)
  const used = new Set();
  for (const rel of list.filter(r => /\.(js|html)$/.test(r) && !r.startsWith('vendor/'))) {
    const t = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    for (const m of t.matchAll(/(?:data|line)\/[A-Za-z0-9_.\/-]+\.(?:json|geojson|csv)/g)) used.add(m[0]);
  }
  const missing = [...used].filter(f => !fs.existsSync(path.join(OUT, f)));
  if (missing.length) { console.error('사이트가 쓰는데 dist 에 없는 자료 (FILES 에 넣을 것):\n  ' + missing.join('\n  ')); process.exitCode = 1; }
  else console.log(`자료 파일 검사: 사이트가 부르는 ${used.size}개 모두 있음`);
}

if (require.main === module) main();
module.exports = { stripJs, stripCss, stripHtml };
