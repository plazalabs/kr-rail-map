/* StationDev — 이 역이 속한 동네에 앞으로 몇 세대가 들어오나
 *
 * data/station-dev.json (data/build_station_dev.py 가 만든다) 을 읽는다.
 *
 * 왜 필요한가
 *   시세는 '지금 얼마'이고 도심 접근성은 '얼마나 빨리 닿나'다. 부동산에서
 *   세 번째로 보는 축이 **공급**이다. 앞으로 1,000세대가 들어오는 동네와
 *   아무것도 안 들어오는 동네는 지금 가격이 같아도 3년 뒤가 다르다.
 *
 * 착공 여부는 알 수 없다
 *   이 자료의 실제 착공일(stcnsDay)은 준공된 건의 89% 에는 있고 미준공 건의
 *   2% 에만 있다 — 준공 처리할 때 같이 적는 칸이다. 그래서 '확정/계획'을
 *   나눠 보여주면 미래 물량이 전부 '미착공'으로 보여 거짓 인상을 준다.
 *   대신 **착공예정일이 이미 지난 물량**을 적는다. 이건 사실이다 —
 *   예정일이 지났는데 준공도 안 됐다는 뜻이고, 공사 중이거나 밀린 것이다.
 *
 * 입도는 법정동이다
 *   이 자료는 좌표를 주지 않는다(대지위치 문자열과 법정동 코드뿐). 그래서
 *   '이 단지가 역에서 300m' 는 알 수 없고, '이 역이 속한 법정동의 물량'만
 *   말할 수 있다. 시세와 같은 입도다. 화면에서도 그렇게 밝힌다.
 */
'use strict';

const StationDev = (() => {
  let doc = null;
  let byName = null;
  let styleDone = false;

  function num(n) {
    return (n == null ? 0 : n).toLocaleString();
  }

  function setDoc(d) {
    if (!d || !d.stations) return false;
    doc = d;
    byName = d.stations;
    return true;
  }

  function load(url) {
    return fetch(url || 'data/station-dev.json')
      .then(r => (r.ok ? r.json() : null))
      .then(d => setDoc(d))
      .catch(() => false);
  }

  function isReady() { return !!doc; }

  /* 한 역의 공급. 자료가 없으면 null.
   * 반환: {sgg, dong, hh, cnt, started, planned, byYear, list, recent} */
  function of(name) {
    if (!doc || !name) return null;
    return byName[name] || null;
  }

  // 한 줄 요약 — 다른 카드에서 쓸 때.
  function brief(name) {
    const r = of(name);
    if (!r) return null;
    return {
      hh: r.hh, cnt: r.cnt, overdue: r.overdue || 0,
      dong: r.dong, recent: r.recent ? r.recent.hh : 0,
    };
  }

  function ensureStyle() {
    if (styleDone || typeof document === 'undefined') return;
    styleDone = true;
    const st = document.createElement('style');
    st.textContent =
      '.dv-top{display:flex;align-items:baseline;gap:6px;flex-wrap:wrap;margin-bottom:2px}' +
      '.dv-big{font-size:19px;font-weight:700;font-variant-numeric:tabular-nums;' +
      'color:var(--fg,#111827)}' +
      '.dv-unit{font-size:12px;color:var(--muted,#6b7280)}' +
      '.dv-split{font-size:12px;color:var(--fg-2,#374151);margin-bottom:8px}' +
      '.dv-split b{font-variant-numeric:tabular-nums}' +
      '.dv-plan{color:var(--muted,#6b7280)}' +
      '.dv-yrs{display:flex;flex-wrap:wrap;gap:6px;margin:2px 0 10px}' +
      '.dv-yr{font-size:11.5px;padding:2px 7px;border-radius:10px;' +
      'background:var(--chip,#f3f4f6);color:var(--fg-2,#374151);' +
      'font-variant-numeric:tabular-nums;white-space:nowrap}' +
      '.dv-yr b{font-weight:600}' +
      '.dv-list{list-style:none;margin:0;padding:0;font-size:12.5px}' +
      '.dv-list li{display:flex;align-items:baseline;gap:6px;padding:3px 0;' +
      'border-bottom:1px solid var(--border,#f1f1f1)}' +
      '.dv-list li:last-child{border-bottom:0}' +
      '.dv-nm{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;' +
      'white-space:nowrap;color:var(--fg-2,#374151)}' +
      '.dv-h{font-variant-numeric:tabular-nums;color:var(--fg,#111827);white-space:nowrap}' +
      '.dv-stp{font-size:10.5px;color:var(--muted,#9ca3af);white-space:nowrap}' +
      '.dv-over{margin:2px 0 8px;font-size:12px;color:#9a5b00}' +
      '.dv-over b{font-variant-numeric:tabular-nums}' +
      '.dv-recent{margin-top:9px;padding-top:8px;border-top:1px dashed var(--border,#e5e7eb);' +
      'font-size:12px;color:var(--fg-2,#374151)}' +
      '.dv-recent b{font-variant-numeric:tabular-nums}' +
      '.dv-none{font-size:12.5px;color:var(--muted,#6b7280);line-height:1.55}' +
      '.dv-note{font-size:12px;color:var(--muted,#6b7280);margin-top:7px;line-height:1.5}';
    document.head.appendChild(st);
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g,
      c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  /* 상세 패널에 넣을 HTML.
   * 자료가 없으면 '없다'고 밝힌다 — 0세대와 구별해야 한다. */
  function sectionHtml(name) {
    ensureStyle();
    const r = of(name);
    if (!r) {
      return '<div class="dv-none">이 역이 속한 법정동의 주택인허가 자료가 없습니다. ' +
        '공급이 0이라는 뜻이 아니라 <b>자료를 받지 못한 동네</b>입니다.</div>';
    }

    const where = (r.sgg ? r.sgg + ' ' : '') + r.dong;
    if (!r.hh) {
      let h = '<div class="dv-none">' + esc(where) + '에는 아직 준공되지 않은 ' +
        '주택인허가 건이 없습니다.</div>';
      if (r.recent && r.recent.hh) {
        h += '<div class="dv-recent">최근 입주 <b>' + num(r.recent.hh) + '세대</b>' +
          recentYears(r.recent) + '</div>';
      }
      h += '<div class="dv-note">※ 법정동 단위입니다. 역에서 몇 m인지는 자료에 없습니다.</div>';
      return h;    }

    let h = '<div class="dv-top"><span class="dv-big">' + num(r.hh) + '</span>' +
      '<span class="dv-unit">세대 · ' + r.cnt + '건</span></div>';

    if (r.overdue) {
      h += '<div class="dv-over">착공예정일이 지난 물량 <b>' + num(r.overdue) +
        '세대</b> — 공사 중이거나 예정보다 밀린 것입니다.</div>';
    }

    if (r.byYear && Object.keys(r.byYear).length) h += yearChips(r.byYear, true);

    if (r.list && r.list.length) {
      h += '<ul class="dv-list">';
      for (const c of r.list) {
        h += '<li><span class="dv-nm" title="' + esc(c.n) + '">' + esc(c.n) + '</span>' +
          (c.y ? '<span class="dv-unit">' + c.y + '년</span>' : '') +
          '<span class="dv-h">' + num(c.h) + '</span></li>';
      }
      h += '</ul>';
    }

    if (r.recent && r.recent.hh) {
      h += '<div class="dv-recent">최근 입주 <b>' + num(r.recent.hh) + '세대</b>' +
        recentYears(r.recent) +
        '<br><span class="dv-note">이미 지어진 물량입니다. 지금 시세를 설명하는 값입니다.</span></div>';
    }

    h += '<div class="dv-note">※ 법정동(' + esc(where) + ') 단위입니다. 역에서 몇 m인지는 ' +
      '자료에 없습니다. <b>이 자료로는 착공 여부를 알 수 없습니다</b> — 실제 착공일은 ' +
      '준공 처리할 때 같이 적히기 때문입니다. 인허가만 받고 취소·지연되는 건이 있으니 ' +
      '예정 연도는 어림값으로 보세요.</div>';
    return h;
  }

  // 연도가 하나뿐이면 총계와 같은 숫자가 한 번 더 나온다. 그때는 안 붙인다.
  function recentYears(rec) {
    const ys = rec.byYear || {};
    if (Object.keys(ys).length < 2) return '';
    return ' (' + Object.keys(ys).sort().map(y => y + '년 ' + num(ys[y])).join(' · ') + ')';
  }

  function yearChips(byYear, wrap) {
    const keys = Object.keys(byYear).sort();
    // '2026 432' 만 쓰면 연도인지 무슨 수인지 알기 어렵다. '년'을 붙인다.
    const inner = keys.map(y =>
      '<span class="dv-yr">' + y + '년 <b>' + num(byYear[y]) + '</b></span>').join('');
    return wrap ? '<div class="dv-yrs">' + inner + '</div>' : inner;
  }

  return { load, isReady, of, brief, sectionHtml, setDoc };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = StationDev;
