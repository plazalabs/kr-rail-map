/* RankTable — 교통 순위표 (rank.html) 의 계산 부분
 *
 * data/rank.json (data/build_rank.js) 을 받아 기준·시점·지역에 맞춰 순위를 매긴다.
 * 화면 그리기는 rank.html 이 하고, 여기는 순수 계산만 둔다 — node 로 시험하려고.
 *
 * 점수 = 100 − (CBD·YBD·GBD 가중 평균 분). 1분 빠르면 1점 높다. 0점 아래로는 내려가지 않는다.
 * 기준
 *   avg : 세 곳 똑같이                 (1:1:1)
 *   cbd : 도심을 두 번 센다            (2:1:1)
 *   ybd : 여의도를 두 번 센다          (1:2:1)
 *   gbd : 강남을 두 번 센다            (1:1:2)  — 역 상세 'GBD 중시 순위'와 같은 값
 * 동점(점수 소수 첫째 자리까지 같음)은 같은 순위 — '공동 9위'.
 */
'use strict';

const RankTable = (() => {
  const WEIGHTS = {
    avg: [1, 1, 1],
    cbd: [2, 1, 1],
    ybd: [1, 2, 1],
    gbd: [1, 1, 2],
  };
  const CAPITAL = new Set(['서울', '경기', '인천']);

  // 가중 평균 분. 값이 둘 이상 있어야 하고, 두 번 세는 곳은 꼭 있어야 한다.
  function minutesOf(times, w) {
    if (!times) return null;
    let s = 0, ws = 0, n = 0;
    for (let i = 0; i < 3; i++) {
      const v = times[i];
      if (v == null) { if (w[i] > 1) return null; continue; }
      s += v * w[i]; ws += w[i]; n++;
    }
    return n >= 2 ? s / ws : null;
  }
  const round1 = x => Math.round(x * 10) / 10;
  function scoreOf(min) { return min == null ? null : Math.max(0, round1(100 - min)); }

  function inRegion(row, region) {
    if (region === 'seoul') return row.r === '서울';
    if (region === 'capital') return CAPITAL.has(row.r);
    return true;
  }

  // 점수 높은 순으로 '공동 순위' 를 매긴다. 반환 Map<row, rank>
  function rankMap(rows, key) {
    const list = rows.filter(r => r[key] != null).sort((a, b) => b[key] - a[key] || (a.n < b.n ? -1 : a.n > b.n ? 1 : 0));
    const m = new Map();
    let prevScore = null, prevRank = 0;
    list.forEach((r, i) => {
      const rk = (prevScore != null && r[key] === prevScore) ? prevRank : i + 1;
      m.set(r, rk); prevScore = r[key]; prevRank = rk;
    });
    return { map: m, total: list.length };
  }

  /* 순위 매기기.
   * opts: { weight:'avg'|'cbd'|'ybd'|'gbd', region:'seoul'|'capital'|'all' }
   * 반환: { rows:[{ src, name, id, region, sgg, lines, now:{min,score,rank}, aft:{...}, change, isNew, tie }], total }
   *   change = 지금 순위 − 개통 후 순위 (양수 = 오름). 지금 갈 수 없던 역은 isNew. */
  function compute(doc, opts) {
    const w = WEIGHTS[(opts && opts.weight) || 'avg'] || WEIGHTS.avg;
    const region = (opts && opts.region) || 'capital';
    const rows = doc.rows.filter(r => inRegion(r, region)).map(r => {
      const mn = minutesOf(r.now, w), ma = minutesOf(r.aft, w);
      return { src: r, sNow: scoreOf(mn), sAft: scoreOf(ma), mNow: mn, mAft: ma };
    });
    const rn = rankMap(rows, 'sNow'), ra = rankMap(rows, 'sAft');
    const count = new Map();
    rows.forEach(x => { if (x.sAft != null) count.set(x.sAft, (count.get(x.sAft) || 0) + 1); });
    const out = rows.filter(x => x.sAft != null).map(x => {
      const now = rn.map.get(x) || null, aft = ra.map.get(x);
      return {
        src: x.src, name: x.src.n, id: x.src.id, region: x.src.r, sgg: x.src.g, lines: x.src.l,
        now: { min: x.mNow, score: x.sNow, rank: now, times: x.src.now },
        aft: { min: x.mAft, score: x.sAft, rank: aft, times: x.src.aft },
        change: now == null ? null : now - aft,
        isNew: now == null,
        tie: count.get(x.sAft) > 1,
      };
    });
    return { rows: out, total: ra.total, totalNow: rn.total };
  }

  /* 정렬. sort: 'after' (개통 후 순위) | 'now' (지금 순위) | 'rise' (많이 오르는 순) | 'gain' (점수 많이 오르는 순) */
  function sortRows(rows, sort) {
    const r = rows.slice();
    const byName = (a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
    if (sort === 'now') {
      r.sort((a, b) => (a.now.rank == null) - (b.now.rank == null) || (a.now.rank - b.now.rank) || byName(a, b));
    } else if (sort === 'rise') {
      // 새로 길이 생기는 역은 '지금 순위' 가 없어 오름 폭을 잴 수 없다 — 맨 뒤
      r.sort((a, b) => (a.change == null) - (b.change == null) || (b.change - a.change) || (a.aft.rank - b.aft.rank) || byName(a, b));
    } else if (sort === 'gain') {
      const g = x => (x.now.score == null ? -1 : x.aft.score - x.now.score);
      r.sort((a, b) => g(b) - g(a) || (a.aft.rank - b.aft.rank) || byName(a, b));
    } else {
      r.sort((a, b) => (a.aft.rank - b.aft.rank) || byName(a, b));
    }
    return r;
  }

  // 이름 찾기 — 공백 무시, 일부만 맞아도
  function matches(row, q) {
    if (!q) return true;
    const s = q.replace(/\s+/g, '');
    return row.name.replace(/\s+/g, '').includes(s) || (row.sgg || '').includes(s) || (row.region || '').includes(s);
  }

  return { WEIGHTS, minutesOf, scoreOf, compute, sortRows, matches, inRegion };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = RankTable;
