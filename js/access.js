/* StationAccess — 역에서 도심 업무지구까지 몇 분인가
 *
 * data/access.json (data/build_access.js 가 만든다) 을 읽어
 *   1) 역별 5개 거점 소요시간 — 지금 / 개통 후
 *   2) 3대 업무지구(도심·여의도·강남) 평균으로 매긴 전국 순위
 * 를 제공한다.
 *
 * 왜 필요한가
 *   이 사이트는 시세는 보여주지만 '그 역이 어디로 얼마나 빨리 닿는가'는
 *   길찾기 탭에서 두 역을 직접 찍어야 알 수 있었다. 부동산에서 실제로
 *   비교하는 값은 "강남까지 몇 분"이고, 그 값이 개통으로 얼마나 줄어드는지다.
 *
 * 시간은 추정값이다. 실제 시각표가 아니므로 ±20~30% 를 전제로 읽어야 하고,
 * 화면에서도 그렇게 밝힌다. 순위와 단축폭은 같은 모델 안에서의 상대 비교라
 * 절대값보다 믿을 만하다.
 */
'use strict';

const StationAccess = (() => {
  let doc = null;
  let byId = null;
  let rankNow = null;    // Map<id, {rank, total}>
  let rankAfter = null;
  let rankGain = null;   // 개통 단축폭 순위
  let rankGbd = null;    // GBD(강남) 중시 순위 — 개통 후 기준 (2026-11-12 회장님 요청)
  let styleDone = false;

  // 3대 업무지구 — 순위를 매길 때 쓰는 축. 서울역·판교는 표시만 한다.
  const CORE = ['cbd', 'ybd', 'gbd'];
  // GBD 중시: 강남을 두 번 센다 → (CBD + YBD + 2×GBD) / 4. 일자리·소득이 가장 큰 축이라 따로 본다.
  const GBD_WEIGHT = { cbd: 1, ybd: 1, gbd: 2 };

  function fmt(min) {
    if (min == null) return '—';
    if (min < 60) return min + '분';
    const h = Math.floor(min / 60), m = min % 60;
    return m ? h + '시간 ' + m + '분' : h + '시간';
  }

  function idxOf(id) {
    if (!doc) return -1;
    for (let i = 0; i < doc.destinations.length; i++) {
      if (doc.destinations[i].id === id) return i;
    }
    return -1;
  }

  // 3대 업무지구 평균. 두 곳 이상 값이 있어야 순위를 매긴다.
  function scoreOf(rec, key, weight) {
    if (!rec) return null;
    let sum = 0, n = 0, wsum = 0;
    for (const c of CORE) {
      const i = idxOf(c);
      if (i < 0) continue;
      const v = rec[key][i];
      if (v == null) continue;
      const w = weight ? weight[c] : 1;
      sum += v * w; wsum += w; n++;
    }
    // GBD 중시는 GBD 값이 꼭 있어야 한다 (없으면 강남을 두 번 센다는 뜻이 사라진다)
    if (weight && rec[key][idxOf('gbd')] == null) return null;
    return n >= 2 ? sum / wsum : null;
  }

  function buildRanks() {
    rankNow = new Map(); rankAfter = new Map(); rankGain = new Map(); rankGbd = new Map();
    const a = [], b = [], c = [], g = [];
    for (const id of Object.keys(byId)) {
      const sn = scoreOf(byId[id], 'now');
      const sa = scoreOf(byId[id], 'after');
      if (sn != null) a.push([id, sn]);
      if (sa != null) b.push([id, sa]);
      const sg = scoreOf(byId[id], 'after', GBD_WEIGHT);
      if (sg != null) g.push([id, sg]);
      // 단축폭 순위 — '개통으로 얼마나 좋아지나'. 지금 갈 수 없던 역은
      // 단축폭을 잴 수 없으므로 뺀다 (0분으로 넣으면 순위가 뒤로 밀린다).
      if (sn != null && sa != null && sn - sa > 0) c.push([id, sa - sn]);
    }
    // 동점은 역 이름이 아니라 id 순서로 고정한다 — 새로고침마다 순위가
    // 흔들리면 '어제는 12위였는데' 같은 말을 못 한다.
    const put = (list, map) => {
      list.sort((x, y) => x[1] - y[1] || (x[0] < y[0] ? -1 : 1));
      list.forEach((row, i) => map.set(row[0], { rank: i + 1, total: list.length }));
    };
    put(a, rankNow); put(b, rankAfter); put(c, rankGain); put(g, rankGbd);
  }

  function setDoc(d) {
    if (!d || !d.destinations || !d.stations) return false;
    doc = d; byId = d.stations;
    buildRanks();
    return true;
  }

  function load(url) {
    return fetch(url || 'data/access.json')
      .then(r => (r.ok ? r.json() : null))
      .then(d => setDoc(d))
      .catch(() => false);
  }

  function isReady() { return !!doc; }

  /* 한 역의 접근성. 자료가 없으면 null.
   * 반환: { rows:[{id,label,now,after,save}], score:{now,after}, rank:{now,after} } */
  function of(stationId) {
    if (!doc || !stationId) return null;
    const rec = byId[stationId];
    if (!rec) return null;
    const rows = doc.destinations.map((d, i) => {
      const nw = rec.now[i], af = rec.after[i];
      return {
        id: d.id, label: d.label, name: d.name,
        now: nw, after: af,
        // 단축폭. '지금 갈 수 없음' 이었다가 개통 후 갈 수 있게 되면 null 이
        // 아니라 '신규' 로 표시해야 한다 (0분 단축으로 보이면 안 된다).
        save: (nw == null || af == null) ? null : nw - af,
        isNew: nw == null && af != null,
        // 묶음(권역) 안 어느 역이 가장 빨랐나 — member_ids 번호 [지금, 개통 후]. GBD 만 자료에 있다 (감사 이전1)
        members: d.member_ids, via: (d.id === 'gbd' && rec.g) ? rec.g : null,
      };
    });
    return {
      rows,
      score: { now: scoreOf(rec, 'now'), after: scoreOf(rec, 'after'), gbd: scoreOf(rec, 'after', GBD_WEIGHT) },
      rank: {
        now: rankNow.get(stationId) || null,
        after: rankAfter.get(stationId) || null,
        gain: rankGain.get(stationId) || null,
        gbd: rankGbd.get(stationId) || null,
      },
    };
  }

  // 단축폭이 가장 큰 거점. '개통하면 제일 좋아지는 방향' 을 한 줄로 말할 때 쓴다.
  function biggestGain(stationId) {
    const a = of(stationId);
    if (!a) return null;
    let best = null;
    for (const r of a.rows) {
      if (r.save == null || r.save <= 0) continue;
      if (!best || r.save > best.save) best = r;
    }
    return best;
  }

  function ensureStyle() {
    if (styleDone || typeof document === 'undefined') return;
    styleDone = true;
    const st = document.createElement('style');
    st.textContent =
      '.sa-tbl{width:100%;border-collapse:collapse;font-size:var(--fs-sm)}' +
      '.sa-tbl td{padding:4px 0;border-bottom:1px solid var(--border,#f1f1f1);vertical-align:baseline}' +
      '.sa-tbl th{padding:0 0 4px;font-size:var(--fs-xs);font-weight:500;color:var(--muted,#9ca3af);' +
      'text-align:right;white-space:nowrap}' +
      '.sa-tbl th.sa-lab{text-align:left}' +
      '.sa-tbl tr:last-child td{border-bottom:0}' +
      '.sa-lab{color:var(--fg-2,#374151)}' +
      '.sa-now{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}' +
      '.sa-aft{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap;' +
      'color:var(--muted,#5b6470);padding-left:8px}' +
      '.sa-gain{text-align:right;font-size:var(--fs-xs);font-weight:600;white-space:nowrap;padding-left:8px;' +
      'color:#0f7b3f}' +
      '.sa-gain.sa-new{color:#1a73e8}' +
      '.sa-none{color:var(--muted,#5b6470)}' +
      '.sa-sum{margin-top:8px;padding-top:8px;border-top:1px dashed var(--border,#e5e7eb);' +
      'font-size:var(--fs-xs);color:var(--fg-2,#374151)}' +
      '.sa-sum b{font-variant-numeric:tabular-nums;white-space:nowrap}' +
      '.sa-sum span{white-space:nowrap}' +
      '.sa-rank{color:var(--muted,#5b6470)}' +
      '.sa-note{font-size:var(--fs-xs);color:var(--muted,#5b6470);margin-top:6px;line-height:1.5}' +
      '.sa-rocket{color:var(--accent,#1b64da);font-weight:700;text-decoration:none}.sa-rocket:hover{text-decoration:underline}';
    document.head.appendChild(st);
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g,
      c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  /* 상세 패널에 넣을 HTML. 자료가 없으면 '없다'고 밝히는 문단을 준다.
   * 거짓으로 0분을 보여주는 것보다 낫다. */
  function sectionHtml(stationId) {
    ensureStyle();
    const a = of(stationId);
    if (!a) {
      return '<div class="sa-note sa-none">이 역은 선형 데이터가 없어 도심 접근성을 ' +
        '계산하지 못했습니다. (지방 일반철도 일부 구간이 여기 해당합니다.)</div>';
    }
    // 68점 감사 5번: 길찾기(환승 대기 포함)와 숫자가 다른 이유를 표 바로 위에
    let h = '<div class="sa-def">열차 기다리는 시간은 뺀 <b>역끼리 비교용</b> 시간 — 길찾기 시간보다 짧을 수 있어요</div>' +
      '<table class="sa-tbl"><thead><tr>' +
      '<th class="sa-lab"></th>' +
      '<th class="sa-now">지금</th>' +
      '<th class="sa-aft">개통 후</th>' +
      '<th class="sa-gain"></th></tr></thead><tbody>';
    for (const r of a.rows) {
      let gain = '';
      if (r.isNew) gain = '<span class="sa-gain sa-new">신규</span>';
      else if (r.save > 0) gain = '<span class="sa-gain">−' + r.save + '분</span>';
      const nowTxt = r.now == null
        ? '<span class="sa-none">지금은 없음</span>'
        : (r.now === 0 ? '여기' : fmt(r.now));
      h += '<tr><td class="sa-lab">' + esc(r.label) + '</td>' +
        '<td class="sa-now">' + nowTxt + '</td>' +
        '<td class="sa-aft">' + (r.after === 0 ? '여기' : fmt(r.after)) + '</td>' +
        '<td>' + gain + '</td></tr>';
    }
    h += '</tbody></table>';

    // 요약 — 3대 업무지구 평균, 전국 순위, 개통 단축 순위.
    // 줄을 둘로 나눈다. 한 줄에 몰면 좁은 패널에서 숫자가 줄바꿈으로 쪼개진다.
    const lines = [];
    let gainMin = 0;
    if (a.score.after != null) {
      let s = '3대 업무지구(CBD·YBD·GBD) 평균 <b>' + fmt(Math.round(a.score.after)) + '</b>';
      if (a.score.now != null) {
        gainMin = Math.round(a.score.now) - Math.round(a.score.after);
        s += ' <span class="sa-rank">(지금 ' + fmt(Math.round(a.score.now)) +
          (gainMin > 0 ? ', −' + gainMin + '분' : '') + ')</span>';
      }
      lines.push(s);
    }
    const r2 = [];
    if (a.rank.after) {
      r2.push('전국 <b>' + a.rank.after.rank + '위</b>');
    }
    if (a.rank.gbd) {
      r2.push('GBD 중시 <b>' + a.rank.gbd.rank + '위</b>');
    }
    // 단축 순위는 '줄어드는 게 있을 때'만 보여준다. 2분 줄어드는 역에
    // '단축 954위' 를 붙이면 정보가 아니라 소음이다.
    if (a.rank.gain && gainMin >= 3) {
      r2.push('개통 단축 <b>' + a.rank.gain.rank + '위</b>');
    }
    if (r2.length) lines.push(r2.join(' · '));
    lines.forEach(t => { h += '<div class="sa-sum">' + t + '</div>'; });
    // 지도 안 떡상 패널에서 이 역 보기 (v109 — 예전엔 rank.html 로 나갔다). 패널이 없는 곳에선 주소로 연다
    h += '<div class="sa-sum"><a class="sa-rocket" href="./?rocket=1&st=' + encodeURIComponent(stationId) + '" data-rocket-st="' + stationId + '"><i data-ic="trend"></i> 떡상 랭킹에서 보기 →</a>' +
      // 수도권 역이면 RAIL MARKET MAP(역 타일)에서도 (2026-11-13) — 순위 자료가 수도권만이라 그 밖에선 안 보인다
      (inCapital(stationId) ? ' · <a class="sa-rocket" href="./?market=1&st=' + encodeURIComponent(stationId) + '" data-market-st="' + stationId + '"><i data-ic="chart"></i> 타일 지도에서 보기 →</a>' : '') + '</div>';

    const tot = (a.rank.after ? a.rank.after.total : 0).toLocaleString();
    h += '<div class="sa-note">※ 실제 시각표가 아니라 추정값입니다. 열차를 <b>기다리는 시간은 빼고</b> ' +
      '타고 가는 시간과 갈아타며 걷는 시간만 더했습니다. 두 번째 숫자가 <b>개통 후</b>이고 −N분은 그 차이입니다. ' +
      '순위는 CBD(도심·서울역)·YBD(여의도)·GBD(강남) 세 곳 평균, ' +
      'GBD 중시는 강남을 두 번 센 평균으로 매긴 것으로, ' +
      '전국 ' + tot + '역 가운데 몇 번째인지입니다.</div>';
    return h;
  }

  function inCapital(id) {
    const f = typeof STATIONS !== 'undefined' ? STATIONS.find(x => x.properties.id === id) : null;
    if (!f) return false;
    const c = f.geometry.coordinates;
    return c[0] > 126.3 && c[0] < 127.9 && c[1] > 36.85 && c[1] < 38.3;
  }

  return { load, isReady, of, biggestGain, sectionHtml, fmt, setDoc };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = StationAccess;
