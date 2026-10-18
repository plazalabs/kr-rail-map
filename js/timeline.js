/* RailTimeline — 개통 타임라인 (공사중/계획중 노선)
 * 완전 독립 모듈. 다른 파일 수정 없이 동작.
 * 사용법:
 *   RailTimeline.init(LINES, STATIONS); // STATIONS는 선택 (역 수 표시용)
 *   RailTimeline.show();
 *   RailTimeline.hide();
 *   RailTimeline.onSelect = (lineId) => { ... }; // 항목 클릭 시 콜백 (선택)
 *   // 또는 'railtimeline:select' CustomEvent (detail: {lineId}) 수신
 */
(function () {
  'use strict';

  var lines = [];
  var stations = [];
  var panel = null;
  var backdrop = null;

  var STATUS_LABEL = {
    construction: '공사중',
    planned: '계획중',
    proposed: '구상중',
    open: '운행중'
  };
  // 미정 그룹 정렬 순서
  var STATUS_ORDER = { construction: 0, planned: 1, proposed: 2 };

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // note 텍스트에서 "개통" 관련 연도 추출 (데이터에 명시된 것만 — 절대 지어내지 않음)
  // 예: "2027-11 개통 예정" -> {year:2027, month:11}
  function extractOpeningYear(note) {
    if (!note) return null;
    var m = note.match(/(20\d{2})-(\d{1,2})\s*개통/);
    if (m) return { year: +m[1], month: +m[2] };
    m = note.match(/(20\d{2})년\s*(\d{1,2})월?\s*개통/);
    if (m) return { year: +m[1], month: +m[2] };
    m = note.match(/(20\d{2})년\s*개통/);
    if (m) return { year: +m[1], month: null };
    return null;
  }

  function fmtYear(o) {
    if (!o) return '미정';
    return o.year + '년' + (o.month ? ' ' + o.month + '월' : '');
  }

  // 노선 총 길이 (km, Haversine)
  function lineLengthKm(f) {
    var R = Math.PI / 180;
    var parts = f.geometry.type === 'LineString'
      ? [f.geometry.coordinates]
      : (f.geometry.coordinates || []);
    var km = 0;
    parts.forEach(function (coords) {
      for (var i = 0; i < coords.length - 1; i++) {
        var x1 = coords[i][0], y1 = coords[i][1];
        var x2 = coords[i + 1][0], y2 = coords[i + 1][1];
        var dLat = (y2 - y1) * R, dLon = (x2 - x1) * R;
        var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos(y1 * R) * Math.cos(y2 * R) *
          Math.sin(dLon / 2) * Math.sin(dLon / 2);
        km += 6371 * 2 * Math.asin(Math.sqrt(h));
      }
    });
    return km;
  }

  // 노선 귀속 역 수 (역명 중복 제거)
  function stationCount(lid) {
    if (!stations.length) return null;
    var seen = {};
    var n = 0;
    stations.forEach(function (s) {
      var ls = (s.properties && s.properties.lines) || [];
      if (ls.indexOf(lid) >= 0) {
        var nm = s.properties.name_ko || s.properties.id;
        if (!seen[nm]) { seen[nm] = 1; n++; }
      }
    });
    return n;
  }

  function injectCss() {
    if (document.getElementById('rt-style')) return;
    var st = document.createElement('style');
    st.id = 'rt-style';
    st.textContent = [
      '.rt-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9000;display:flex;align-items:center;justify-content:center;padding:16px}',
      '.rt-panel{background:var(--bg,#fff);color:var(--text,#222);border-radius:12px;max-width:560px;width:100%;max-height:82vh;display:flex;flex-direction:column;box-shadow:0 8px 32px rgba(0,0,0,.3)}',
      '.rt-head{display:flex;align-items:center;justify-content:space-between;padding:14px 18px;border-bottom:1px solid var(--border,#e0e0e0);font-size:17px;font-weight:700}',
      '.rt-close{background:none;border:none;font-size:20px;cursor:pointer;color:var(--muted,#888);padding:4px 8px}',
      '.rt-body{overflow-y:auto;padding:18px 18px 22px}',
      '.rt-notice{font-size:12px;color:var(--muted,#888);margin-bottom:14px;line-height:1.6}',
      '.rt-timeline{position:relative;margin-left:8px;padding-left:22px;border-left:3px solid var(--border,#e0e0e0)}',
      '.rt-year-group{margin-bottom:20px;position:relative}',
      '.rt-year{position:absolute;left:-30px;top:-2px;width:16px;height:16px;border-radius:50%;background:var(--accent,#3388ff);border:3px solid var(--bg,#fff);box-shadow:0 0 0 2px var(--accent,#3388ff)}',
      '.rt-year-label{font-size:15px;font-weight:700;margin-bottom:10px;color:var(--accent,#3388ff)}',
      '.rt-item{display:flex;gap:10px;align-items:flex-start;padding:10px 12px;margin-bottom:8px;background:var(--panel,#f7f7f7);border-radius:8px;cursor:pointer;border:1px solid transparent}',
      '.rt-item:hover{border-color:var(--accent,#3388ff)}',
      '.rt-dot{flex:none;width:14px;height:14px;border-radius:50%;margin-top:3px}',
      '.rt-info{flex:1;min-width:0}',
      '.rt-name{font-size:14px;font-weight:600;display:flex;align-items:center;gap:8px;flex-wrap:wrap}',
      '.rt-badge{font-size:11px;font-weight:700;padding:2px 8px;border-radius:10px;color:#fff}',
      '.rt-badge.rt-construction{background:#e67e22}',
      '.rt-badge.rt-planned{background:#9b59b6}',
      '.rt-badge.rt-proposed{background:#7f8c8d}',
      '.rt-meta{font-size:12px;color:var(--muted,#888);margin-top:4px}',
      '.rt-note{font-size:12px;color:var(--muted,#888);margin-top:4px;line-height:1.5}',
      '.rt-empty{padding:24px;text-align:center;color:var(--muted,#888)}'
    ].join('\n');
    document.head.appendChild(st);
  }

  function targetLines() {
    return lines.filter(function (f) {
      var s = f.properties && f.properties.status;
      return s === 'construction' || s === 'planned' || s === 'proposed';
    });
  }

  function buildEntries() {
    return targetLines().map(function (f) {
      var p = f.properties;
      var oy = extractOpeningYear(p.note);
      var sc = stationCount(p.id);
      return {
        id: p.id,
        name: p.name_ko || p.id,
        color: p.color || '#888888',
        status: p.status,
        statusLabel: STATUS_LABEL[p.status] || p.status,
        opening: oy,                 // {year, month} | null
        openingText: fmtYear(oy),
        km: lineLengthKm(f),
        stations: sc,                // null이면 표시 생략
        note: p.note || ''
      };
    });
  }

  function render() {
    injectCss();
    if (!panel) {
      backdrop = document.createElement('div');
      backdrop.className = 'rt-backdrop';
      backdrop.id = 'rt-backdrop';
      backdrop.addEventListener('click', function (e) {
        if (e.target === backdrop) RailTimeline.hide();
      });
      panel = document.createElement('div');
      panel.className = 'rt-panel';
      panel.id = 'rt-panel';
      panel.innerHTML =
        '<div class="rt-head"><span>🚧 개통 타임라인</span>' +
        '<button class="rt-close" id="rt-close" title="닫기">✕</button></div>' +
        '<div class="rt-body" id="rt-body"></div>';
      backdrop.appendChild(panel);
      document.body.appendChild(backdrop);
      panel.querySelector('#rt-close').addEventListener('click', RailTimeline.hide);
    }
    var body = panel.querySelector('#rt-body');
    var entries = buildEntries();

    var known = entries.filter(function (e) { return e.opening; })
      .sort(function (a, b) {
        return (a.opening.year - b.opening.year) || ((a.opening.month || 0) - (b.opening.month || 0));
      });
    var unknown = entries.filter(function (e) { return !e.opening; })
      .sort(function (a, b) {
        return (STATUS_ORDER[a.status] - STATUS_ORDER[b.status]) ||
          a.name.localeCompare(b.name, 'ko');
      });

    var html = '<div class="rt-notice">' +
      '공사중 · 계획중 노선 ' + entries.length + '개. ' +
      '개통 연도는 데이터에 명시된 것만 표시하며, 없는 경우 "미정"으로 표기합니다.</div>';

    if (!entries.length) {
      html += '<div class="rt-empty">공사중/계획중 노선이 없습니다.</div>';
    } else {
      html += '<div class="rt-timeline">';
      // 연도 확정 그룹
      known.forEach(function (e) {
        html += '<div class="rt-year-group"><div class="rt-year"></div>' +
          '<div class="rt-year-label">' + escapeHtml(e.openingText) + ' 개통 목표</div>' +
          itemHtml(e) + '</div>';
      });
      // 미정 그룹 (상태별)
      if (unknown.length) {
        html += '<div class="rt-year-group"><div class="rt-year"></div>' +
          '<div class="rt-year-label">개통 목표 미정</div>';
        unknown.forEach(function (e) { html += itemHtml(e); });
        html += '</div>';
      }
      html += '</div>';
    }
    body.innerHTML = html;

    body.querySelectorAll('.rt-item').forEach(function (el) {
      el.addEventListener('click', function () {
        var lid = el.getAttribute('data-line-id');
        if (typeof RailTimeline.onSelect === 'function') {
          try { RailTimeline.onSelect(lid); } catch (_) {}
        }
        document.dispatchEvent(new CustomEvent('railtimeline:select', { detail: { lineId: lid } }));
      });
    });
  }

  function itemHtml(e) {
    var meta = [];
    if (e.stations != null) meta.push(e.stations + '역');
    meta.push(e.km.toFixed(1) + 'km');
    return '<div class="rt-item" data-line-id="' + escapeHtml(e.id) + '" title="클릭하면 지도에서 강조">' +
      '<span class="rt-dot" style="background:' + escapeHtml(e.color) + '"></span>' +
      '<div class="rt-info">' +
      '<div class="rt-name">' + escapeHtml(e.name) +
      '<span class="rt-badge rt-' + escapeHtml(e.status) + '">' + escapeHtml(e.statusLabel) + '</span></div>' +
      '<div class="rt-meta">' + meta.join(' · ') + '</div>' +
      (e.note ? '<div class="rt-note">' + escapeHtml(e.note) + '</div>' : '') +
      '</div></div>';
  }

  window.RailTimeline = {
    init: function (ls, sts) {
      lines = (ls && ls.features) ? ls.features : (Array.isArray(ls) ? ls : []);
      stations = (sts && sts.features) ? sts.features : (Array.isArray(sts) ? sts : []);
    },
    show: function () {
      render();
      if (backdrop) backdrop.style.display = 'flex';
    },
    hide: function () {
      if (backdrop) backdrop.style.display = 'none';
    },
    onSelect: null,
    // 테스트/디버깅용
    _debug: {
      targetCount: function () { return targetLines().length; },
      entries: buildEntries
    }
  };
})();
