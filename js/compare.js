/* ------------------------------------------------------------------
 * LineCompare — 노선 비교 (독립 모듈)
 *
 * 사용법 (index.html에 스크립트 추가 후):
 *   LineCompare.init(LINES, STATIONS);   // GeoJSON FeatureCollection 2개
 *   LineCompare.show();                 // 비교 패널 표시
 *   LineCompare.hide();                 // 숨기기
 *   LineCompare.setLine(0, 'seoul-metropolitan-subway-line-1'); // 슬롯에 노선 지정
 *
 * 다른 파일 수정 없이 이 파일 하나로 동작. CSS는 동적 <style>로 삽입.
 * ------------------------------------------------------------------ */
(function (global) {
  'use strict';

  let LINES = [];        // FeatureCollection of lines
  let STATIONS = [];     // FeatureCollection of stations
  let slotLine = [null, null];  // slot 0, 1에 선택된 line id
  let panel = null;
  let styleEl = null;

  const STATUS_KO = { open: '운행중', construction: '공사중', planned: '계획중', proposed: '구상중' };
  const CAT_KO = { metro: '도시철도', urban: '광역·도시', ktx: 'KTX·고속', conventional: '일반철도', etc: '기타' };
  const DEG = Math.PI / 180;

  /* ---------- 계산 ---------- */
  function lineLengthKm(f) {
    let km = 0;
    const parts = f.geometry.type === 'LineString'
      ? [f.geometry.coordinates]
      : f.geometry.coordinates;
    for (const coords of parts) {
      for (let i = 0; i < coords.length - 1; i++) {
        const x1 = coords[i][0], y1 = coords[i][1];
        const x2 = coords[i + 1][0], y2 = coords[i + 1][1];
        const dLat = (y2 - y1) * DEG, dLon = (x2 - x1) * DEG;
        const h = Math.sin(dLat / 2) ** 2 +
          Math.cos(y1 * DEG) * Math.cos(y2 * DEG) * Math.sin(dLon / 2) ** 2;
        km += 6371 * 2 * Math.asin(Math.sqrt(h));
      }
    }
    return km;
  }

  function lineStations(lid) {
    // 중복 제거 (환승역이 line_id별로 여러 Feature로 존재할 수 있음)
    const seen = new Set();
    for (const s of STATIONS) {
      const lines = s.properties.lines || [];
      if (lines.includes(lid)) seen.add(s.properties.name_ko);
    }
    return seen;
  }

  function transferCount(lid, stationNames) {
    let n = 0;
    for (const nm of stationNames) {
      for (const s of STATIONS) {
        if (s.properties.name_ko === nm && (s.properties.lines || []).length > 1) { n++; break; }
      }
    }
    return n;
  }

  function stats(lid) {
    const f = LINES.find(l => l.properties.id === lid);
    if (!f) return null;
    const p = f.properties;
    const km = lineLengthKm(f);
    const names = lineStations(lid);
    const n = names.size;
    return {
      id: lid,
      name: p.name_ko || lid,
      nameEn: p.name_en || '',
      color: p.color || '#888888',
      km: km,
      stations: n,
      status: STATUS_KO[p.status] || p.status,
      statusRaw: p.status,
      category: CAT_KO[p.category] || p.category || '-',
      transfers: transferCount(lid, names),
      avgGap: n >= 2 ? km / (n - 1) : km
    };
  }

  /* ---------- CSS (동적 삽입) ---------- */
  const CSS = `
    #lc-panel {
      position: fixed; z-index: 9999;
      top: 50%; left: 50%; transform: translate(-50%, -50%);
      width: min(560px, 94vw); max-height: 88vh; overflow: auto;
      background: var(--bg, #fff); color: var(--text, #222);
      border: 1px solid var(--border, #ddd); border-radius: 12px;
      box-shadow: 0 8px 40px var(--shadow, rgba(0,0,0,.35));
      font-family: inherit; font-size: 14px;
    }
    #lc-head { display: flex; align-items: center; justify-content: space-between;
      padding: 12px 16px; border-bottom: 1px solid var(--border, #e5e5e5);
      font-weight: 700; font-size: 16px; }
    #lc-close { border: none; background: none; font-size: 20px; cursor: pointer; color: inherit; }
    #lc-picks { display: flex; gap: 10px; padding: 12px 16px; }
    #lc-picks select { flex: 1; padding: 8px; border-radius: 6px;
      border: 1px solid var(--border, #ccc); font-size: 13px;
      background: var(--input, #fff); color: var(--text, #222); }
    #lc-table { width: calc(100% - 32px); margin: 0 16px 16px; border-collapse: collapse; font-size: 13px; }
    #lc-table th, #lc-table td { padding: 7px 8px; border-bottom: 1px solid var(--border, #eee); text-align: center; }
    #lc-table th:first-child, #lc-table td:first-child { text-align: left; color: var(--muted, #888); width: 32%; }
    .lc-swatch { display: inline-block; width: 12px; height: 12px; border-radius: 3px; margin-right: 6px; vertical-align: baseline; }
    .lc-winner { font-weight: 700; color: var(--accent, #0a7d2c); }
    .lc-arrow { font-size: 11px; margin-left: 3px; }
    #lc-empty { padding: 20px 16px; text-align: center; color: var(--muted, #999); }
  `;

  /* ---------- UI ---------- */
  function ensureStyle() {
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'lc-style';
      styleEl.textContent = CSS;
      document.head.appendChild(styleEl);
    }
  }

  function lineOptions(selId) {
    return LINES
      .slice()
      .sort((a, b) => (a.properties.name_ko || '').localeCompare(b.properties.name_ko || '', 'ko'))
      .map(f => {
        const p = f.properties;
        const sel = p.id === selId ? ' selected' : '';
        return `<option value="${p.id}"${sel}>${escapeHtml(p.name_ko || p.id)}</option>`;
      })
      .join('');
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function buildPanel() {
    ensureStyle();
    panel = document.createElement('div');
    panel.id = 'lc-panel';
    panel.innerHTML = `
      <div id="lc-head">노선 비교 <button id="lc-close" title="닫기">✕</button></div>
      <div id="lc-picks">
        <select id="lc-sel0"></select>
        <select id="lc-sel1"></select>
      </div>
      <div id="lc-body"></div>`;
    document.body.appendChild(panel);
    panel.querySelector('#lc-close').addEventListener('click', hide);
    for (let i = 0; i < 2; i++) {
      panel.querySelector('#lc-sel' + i).addEventListener('change', e => setLine(i, e.target.value));
    }
  }

  function fmt(n, digits) { return n.toLocaleString('ko-KR', { maximumFractionDigits: digits }); }

  function render() {
    if (!panel) return;
    for (let i = 0; i < 2; i++) {
      panel.querySelector('#lc-sel' + i).innerHTML =
        `<option value="">노선 선택…</option>` + lineOptions(slotLine[i]);
    }
    const body = panel.querySelector('#lc-body');
    const s0 = slotLine[0] ? stats(slotLine[0]) : null;
    const s1 = slotLine[1] ? stats(slotLine[1]) : null;
    if (!s0 || !s1) {
      body.innerHTML = '<div id="lc-empty">비교할 노선 두 개를 선택하세요.</div>';
      return;
    }

    // 수치 행: [라벨, s0값, s1값, 포맷함수] — 큰 쪽에 ▲
    const rows = [
      ['총 길이', s0.km, s1.km, v => fmt(v, 1) + ' km'],
      ['역 수', s0.stations, s1.stations, v => fmt(v, 0) + '역'],
      ['환승역 수', s0.transfers, s1.transfers, v => fmt(v, 0) + '역'],
      ['평균 역간 거리', s0.avgGap, s1.avgGap, v => fmt(v, 2) + ' km']
    ];
    let html = `<table id="lc-table">
      <tr><th>항목</th>
        <td><span class="lc-swatch" style="background:${s0.color}"></span><b>${escapeHtml(s0.name)}</b></td>
        <td><span class="lc-swatch" style="background:${s1.color}"></span><b>${escapeHtml(s1.name)}</b></td></tr>
      <tr><th>영문명</th><td>${escapeHtml(s0.nameEn)}</td><td>${escapeHtml(s1.nameEn)}</td></tr>
      <tr><th>운행 상태</th><td>${escapeHtml(s0.status)}</td><td>${escapeHtml(s1.status)}</td></tr>
      <tr><th>카테고리</th><td>${escapeHtml(s0.category)}</td><td>${escapeHtml(s1.category)}</td></tr>`;
    for (const [label, a, b, f] of rows) {
      const aWin = a > b, bWin = b > a;
      html += `<tr><th>${label}</th>
        <td class="${aWin ? 'lc-winner' : ''}">${f(a)}${aWin ? '<span class="lc-arrow">▲</span>' : ''}</td>
        <td class="${bWin ? 'lc-winner' : ''}">${f(b)}${bWin ? '<span class="lc-arrow">▲</span>' : ''}</td></tr>`;
    }
    // 차이 요약 행
    const kmDiff = Math.abs(s0.km - s1.km);
    const stDiff = Math.abs(s0.stations - s1.stations);
    html += `</table>
      <div id="lc-empty">길이 차이 ${fmt(kmDiff, 1)} km · 역 수 차이 ${fmt(stDiff, 0)}개</div>`;
    body.innerHTML = html;
  }

  /* ---------- 공개 API ---------- */
  function init(lines, stations) {
    LINES = (lines && lines.features) ? lines.features : [];
    STATIONS = (stations && stations.features) ? stations.features : [];
    slotLine = [null, null];
  }

  function show() {
    if (!panel) buildPanel();
    render();
    panel.style.display = 'block';
  }

  function hide() {
    if (panel) panel.style.display = 'none';
  }

  function setLine(slot, lineId) {
    if (slot !== 0 && slot !== 1) return;
    slotLine[slot] = lineId || null;
    render();
  }

  global.LineCompare = {
    init, show, hide, setLine,
    // 테스트용 — 화면 없이 계산만 검사한다
    _debug: { lineLengthKm, lineStations, transferCount, stats, STATUS_KO, CAT_KO },
  };
})(typeof window !== 'undefined' ? window : this);
