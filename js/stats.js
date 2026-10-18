/* 한국철도맵 — 통계 대시보드 (RailStats)
 * 완전 독립 모듈: RailStats.init(lines, stations) → RailStats.show()/hide()
 * CSS는 <style id="rs-style"> 동적 삽입, 앱 CSS 변수 사용
 */
(function () {
  'use strict';

  const CAT_NAMES = { metro: '도시철도', urban: '광역·도시', ktx: 'KTX·고속', conventional: '일반철도', etc: '기타' };
  const STATUS_NAMES = { open: '운행중', construction: '공사중', planned: '계획중', proposed: '구상중' };
  const STATUS_COLORS = { open: '#2e9e4f', construction: '#e07b00', planned: '#8a63d2', proposed: '#6b7280' };

  let LINES = [], STATIONS = [];
  let panel = null, stats = null;

  function hav(lng1, lat1, lng2, lat2) {
    const R = Math.PI / 180;
    const dLat = (lat2 - lat1) * R, dLon = (lng2 - lng1) * R;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * R) * Math.cos(lat2 * R) * Math.sin(dLon / 2) ** 2;
    return 6371 * 2 * Math.asin(Math.sqrt(h));
  }

  function lineLength(f) {
    const g = f.geometry;
    const parts = g.type === 'LineString' ? [g.coordinates] : g.coordinates;
    let km = 0;
    for (const line of parts) {
      for (let i = 0; i < line.length - 1; i++) {
        km += hav(line[i][0], line[i][1], line[i + 1][0], line[i + 1][1]);
      }
    }
    return km;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function computeStats() {
    // 노선별 집계
    const lineInfo = LINES.map(f => {
      const p = f.properties;
      const lid = p.id;
      const km = lineLength(f);
      const stNames = new Set();
      STATIONS.forEach(s => {
        if ((s.properties.lines || []).includes(lid)) stNames.add(s.properties.name_ko);
      });
      return {
        id: lid, name: p.name_ko || lid, color: p.color || '#888',
        status: p.status || 'open', category: p.category || 'etc',
        km, stations: stNames.size
      };
    });

    // 전체 역 (중복 제거)
    const allNames = new Set(STATIONS.map(s => s.properties.name_ko));

    // 환승역 (2개 이상 노선)
    const transferStations = STATIONS.filter(s => (s.properties.lines || []).length >= 2)
      .map(s => s.properties.name_ko);
    const uniqueTransfer = [...new Set(transferStations)];

    // 상태별
    const byStatus = {};
    lineInfo.forEach(l => {
      byStatus[l.status] = byStatus[l.status] || { count: 0, km: 0 };
      byStatus[l.status].count++;
      byStatus[l.status].km += l.km;
    });

    // 카테고리별
    const byCat = {};
    lineInfo.forEach(l => {
      byCat[l.category] = byCat[l.category] || { count: 0, km: 0 };
      byCat[l.category].count++;
      byCat[l.category].km += l.km;
    });

    const totalKm = lineInfo.reduce((a, l) => a + l.km, 0);
    const longest = [...lineInfo].sort((a, b) => b.km - a.km).slice(0, 5);
    const mostStations = [...lineInfo].sort((a, b) => b.stations - a.stations).slice(0, 5);

    return { lineInfo, totalKm, allStations: allNames.size, transfer: uniqueTransfer.length, byStatus, byCat, longest, mostStations };
  }

  function ensureStyle() {
    if (document.getElementById('rs-style')) return;
    const st = document.createElement('style');
    st.id = 'rs-style';
    st.textContent = `
      #rs-panel { position: fixed; top: 50%; left: 50%; transform: translate(-50%,-50%);
        width: min(640px, 92vw); max-height: 86vh; overflow-y: auto; z-index: 9999;
        background: var(--panel-bg, #fff); color: var(--text, #222);
        border: 1px solid var(--border, #ddd); border-radius: 12px;
        box-shadow: 0 8px 32px rgba(0,0,0,.25); padding: 0; }
      #rs-head { display: flex; justify-content: space-between; align-items: center;
        padding: 14px 18px; border-bottom: 1px solid var(--border, #ddd);
        font-size: 18px; font-weight: bold; position: sticky; top: 0;
        background: var(--panel-bg, #fff); border-radius: 12px 12px 0 0; }
      #rs-close { background: none; border: none; font-size: 20px; cursor: pointer;
        color: var(--text, #222); }
      #rs-body { padding: 18px; }
      .rs-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; margin-bottom: 18px; }
      .rs-card { background: var(--bg, #f5f5f5); border-radius: 8px; padding: 14px 12px; text-align: center; }
      .rs-num { font-size: 28px; font-weight: bold; color: var(--accent, #3388ff); }
      .rs-label { font-size: 12px; color: var(--muted, #888); margin-top: 4px; }
      .rs-sec { font-size: 15px; font-weight: bold; margin: 18px 0 10px; }
      .rs-bar-row { display: flex; align-items: center; margin: 6px 0; font-size: 13px; }
      .rs-bar-label { width: 90px; flex-shrink: 0; }
      .rs-bar-track { flex: 1; height: 18px; background: var(--bg, #eee); border-radius: 4px; overflow: hidden; margin: 0 8px; }
      .rs-bar-fill { height: 100%; border-radius: 4px; transition: width .3s; }
      .rs-bar-val { width: 80px; text-align: right; flex-shrink: 0; }
      .rs-top-list { list-style: none; padding: 0; margin: 0; }
      .rs-top-list li { display: flex; align-items: center; padding: 7px 4px; border-bottom: 1px solid var(--border, #eee); font-size: 13px; }
      .rs-rank { width: 24px; font-weight: bold; color: var(--muted, #888); }
      .rs-dot { width: 12px; height: 12px; border-radius: 50%; margin-right: 8px; flex-shrink: 0; }
      .rs-top-name { flex: 1; }
      .rs-top-val { font-weight: bold; }
      .rs-note { font-size: 11px; color: var(--muted, #888); margin-top: 14px; }
    `;
    document.head.appendChild(st);
  }

  function barRow(label, value, max, color, valText) {
    const pct = max > 0 ? (value / max * 100).toFixed(1) : 0;
    return `<div class="rs-bar-row">
      <span class="rs-bar-label">${escapeHtml(label)}</span>
      <div class="rs-bar-track"><div class="rs-bar-fill" style="width:${pct}%;background:${color}"></div></div>
      <span class="rs-bar-val">${escapeHtml(valText)}</span>
    </div>`;
  }

  function topList(items, valFn) {
    return `<ul class="rs-top-list">` + items.map((l, i) =>
      `<li><span class="rs-rank">${i + 1}</span>
       <span class="rs-dot" style="background:${escapeHtml(l.color)}"></span>
       <span class="rs-top-name">${escapeHtml(l.name)}</span>
       <span class="rs-top-val">${escapeHtml(valFn(l))}</span></li>`
    ).join('') + `</ul>`;
  }

  function render() {
    if (!stats) stats = computeStats();
    const s = stats;

    const statusOrder = ['open', 'construction', 'planned', 'proposed'].filter(k => s.byStatus[k]);
    const maxStatusKm = Math.max(...statusOrder.map(k => s.byStatus[k].km), 1);
    const catOrder = Object.keys(s.byCat).sort((a, b) => s.byCat[b].km - s.byCat[a].km);
    const maxCatKm = Math.max(...catOrder.map(k => s.byCat[k].km), 1);
    const catColors = { metro: '#3388ff', urban: '#2e9e4f', ktx: '#d62728', conventional: '#8a63d2', etc: '#888' };

    panel.querySelector('#rs-body').innerHTML = `
      <div class="rs-cards">
        <div class="rs-card"><div class="rs-num">${s.lineInfo.length}</div><div class="rs-label">노선 수</div></div>
        <div class="rs-card"><div class="rs-num">${s.allStations.toLocaleString()}</div><div class="rs-label">역 수</div></div>
        <div class="rs-card"><div class="rs-num">${Math.round(s.totalKm).toLocaleString()}</div><div class="rs-label">노선 연장 합계 (km)</div></div>
        <div class="rs-card"><div class="rs-num">${s.transfer.toLocaleString()}</div><div class="rs-label">환승역 수</div></div>
      </div>

      <div class="rs-sec">상태별 노선</div>
      ${statusOrder.map(k => barRow(
        STATUS_NAMES[k] || k, s.byStatus[k].km, maxStatusKm, STATUS_COLORS[k] || '#888',
        `${s.byStatus[k].count}개 · ${s.byStatus[k].km.toFixed(0)}km`
      )).join('')}

      <div class="rs-sec">카테고리별 노선</div>
      ${catOrder.map(k => barRow(
        CAT_NAMES[k] || k, s.byCat[k].km, maxCatKm, catColors[k] || '#888',
        `${s.byCat[k].count}개 · ${s.byCat[k].km.toFixed(0)}km`
      )).join('')}

      <div class="rs-sec">가장 긴 노선 Top 5</div>
      ${topList(s.longest, l => l.km.toFixed(1) + ' km')}

      <div class="rs-sec">역이 가장 많은 노선 Top 5</div>
      ${topList(s.mostStations, l => l.stations + '역')}

      <div class="rs-note">※ 길이는 노선별 선형을 Haversine 으로 합산한 값입니다. KTX·ITX 같은 운행계통이 같은 물리 선로를 중복 계산하므로, 전체 합계는 실제 선로 연장보다 큽니다(중복 포함).</div>
    `;
  }

  function ensurePanel() {
    if (panel) return;
    panel = document.createElement('div');
    panel.id = 'rs-panel';
    panel.style.display = 'none';
    panel.innerHTML = `
      <div id="rs-head">📊 철도망 통계 <button id="rs-close" title="닫기">✕</button></div>
      <div id="rs-body"></div>`;
    document.body.appendChild(panel);
    panel.querySelector('#rs-close').addEventListener('click', hide);
  }

  function init(lines, stations) {
    LINES = lines || [];
    STATIONS = stations || [];
    stats = null;
    ensureStyle();
    ensurePanel();
  }

  function show() {
    if (!panel) return;
    render();
    panel.style.display = 'block';
  }

  function hide() {
    if (panel) panel.style.display = 'none';
  }

  window.RailStats = { init, show, hide };
})();
