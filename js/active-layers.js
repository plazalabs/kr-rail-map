/* 지도 위 '켜진 분석' 표시 (68점 감사 12번, 2026-11-13)
 * 통근권·떡상 지도·전세가율 색칠·역세권 범위·노선 영향권은 색과 크기의 뜻이 서로 다르다.
 * 무엇이 켜져 있는지 지도 왼쪽 위에 짧게 늘 보여 준다 (화면을 잘라 공유해도 뜻이 남게). 아무것도 안 켜졌으면 숨김.
 * 각 모듈을 고치지 않고 상태만 읽는다: 사이드바 체크박스 + CommuteMap/CoverageMap.isActive().
 */
(function (global) {
  'use strict';
  var ITEMS = [
    { id: 'rocket', label: '떡상 지도', hint: '색 = 개통 후 순위가 오른 계단', on: function () { if (global.StationRocket && StationRocket.isOn) return !!StationRocket.isOn(); var c = document.getElementById('layer-rocket'); return !!(c && c.checked); } },
    { id: 'jeonse', label: '전세가율 색칠', hint: '법정동 집계 · 80% 이상 주의', on: function () { var c = document.getElementById('layer-jeonse'); return !!(c && c.checked); } },
    { id: 'area', label: '역세권 범위', hint: '근사', on: function () { var c = document.getElementById('layer-station-area'); return !!(c && c.checked); } },
    { id: 'commute', label: '통근권', hint: '색 = 목적지 역까지 분', on: function () { return !!(global.CommuteMap && CommuteMap.isActive && CommuteMap.isActive()); } },
    { id: 'coverage', label: '노선 영향권', hint: '', on: function () { return !!(global.CoverageMap && CoverageMap.isActive && CoverageMap.isActive()); } },
  ];
  var el = null, last = '';
  function css() {
    if (document.getElementById('al-style')) return;
    var s = document.createElement('style'); s.id = 'al-style';
    s.textContent = '#al-chip{position:absolute;z-index:5;left:10px;top:64px;max-width:min(420px,calc(100% - 20px));padding:5px 10px;border-radius:10px;' +
      'background:var(--panel);color:var(--text);border:1px solid var(--border);box-shadow:var(--shadow,0 2px 8px rgba(0,0,0,.12));font-size:var(--fs-xs);line-height:1.45;pointer-events:none}' +
      '#al-chip[hidden]{display:none}#al-chip b{font-weight:800}#al-chip span{color:var(--muted)}' +
      '@media (max-width:768px){#al-chip{top:auto;bottom:calc(84px + env(safe-area-inset-bottom,0px));left:8px}}';
    document.head.appendChild(s);
  }
  function update() {
    var on = ITEMS.filter(function (it) { try { return it.on(); } catch (e) { return false; } });
    var key = on.map(function (x) { return x.id; }).join(',');
    if (key === last) return; last = key;
    if (!el) return;
    if (!on.length) { el.hidden = true; return; }
    el.hidden = false;
    el.textContent = '';
    var b = document.createElement('b'); b.textContent = '켜진 분석 '; el.appendChild(b);
    on.forEach(function (it, i) {
      el.appendChild(document.createTextNode((i ? ' · ' : '') + it.label));
      if (it.hint) { var sp = document.createElement('span'); sp.textContent = ' (' + it.hint + ')'; el.appendChild(sp); }
    });
  }
  function init() {
    var wrap = document.getElementById('map-wrap') || document.body;
    css();
    el = document.createElement('div'); el.id = 'al-chip'; el.hidden = true; el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite');
    wrap.appendChild(el);
    ['layer-rocket', 'layer-jeonse', 'layer-station-area'].forEach(function (id) { var c = document.getElementById(id); if (c) c.addEventListener('change', function () { setTimeout(update, 50); }); });
    document.addEventListener('click', function () { setTimeout(update, 120); }, true);
    // 떡상 패널이 레이어를 스스로 켜고 끌 때(체크박스 change 이벤트 없음)도 바로 고친다
    if (global.StationRocket && StationRocket.onToggle) StationRocket.onToggle(function () { setTimeout(update, 0); });   // 통근권·영향권은 패널 단추로 켜고 끈다
    setInterval(update, 2000);
    update();
  }
  global.ActiveLayers = { init: init, update: update };
})(typeof window !== 'undefined' ? window : globalThis);
