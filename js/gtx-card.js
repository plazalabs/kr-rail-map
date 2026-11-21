/* GTX 입구 카드 — 계산 규칙(빌드 data/build_gtx_card.js 와 화면 js/gtx-page.js 가 같이 쓴다).
 * 숫자는 여기서 만들지 않는다: 업무지구 분·순위는 rank.json / js/rank.js, 시세는 station-trend.json 에서 온 값을 고르고 나눌 뿐.
 * 기준 문서: 결정_GTX입구_20261121.md */
const GtxCard = (() => {
  // 카드 공통 표기 (rank-page.js 공유 그림과 같은 말). '떡상'·'계단'은 카드에 쓰지 않는다
  const TIER_WORD = { rocket: '접근성 크게 개선', up: '접근성 개선', flat: '비슷', down: '상대 하락', new: '신규' };
  const MARKET_WORD = { strong: '시장보다 강함', mid: '시장 수준', weak: '시장보다 약함', hold: '판단 보류', none: '시세 자료 없음' };
  const BANNED = ['떡상', '계단', '때문에', '오를', '사세요', '매수', '매도', '투자 추천'];
  const DEST_ORDER = [0, 1, 2];   // CBD → YBD → GBD (rank.json dest 순서)

  /* 큰 숫자: 업무지구 하나 고르기. now·aft = [CBD, YBD, GBD] 분(null = 못 감)
   * 반환 { i, kind } — kind: 'cut'(줄어듦) | 'new'(지금은 못 감) | 'same'(줄어드는 곳 없음) | null(셋 다 못 감) */
  function pickDest(now, aft) {
    now = now || []; aft = aft || [];
    const has = i => aft[i] != null;
    if (DEST_ORDER.every(i => now[i] == null)) {
      let b = null;
      DEST_ORDER.forEach(i => { if (has(i) && (b == null || aft[i] < aft[b])) b = i; });
      return b == null ? { i: null, kind: null } : { i: b, kind: 'new' };
    }
    let b = null, bc = -Infinity;
    DEST_ORDER.forEach(i => {
      if (now[i] == null || !has(i)) return;
      const c = now[i] - aft[i];
      if (c > bc || (c === bc && aft[i] < aft[b])) { b = i; bc = c; }
    });
    if (b != null && bc > 0) return { i: b, kind: 'cut' };
    let m = null;
    DEST_ORDER.forEach(i => { if (now[i] != null && (m == null || now[i] < now[m])) m = i; });
    return { i: m, kind: 'same' };
  }

  // 분위수 — 선형 보간, 위치 = (n−1)×q (정렬된 배열)
  function quantile(sorted, q) {
    if (!sorted.length) return null;
    const pos = (sorted.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
  }

  // 마지막으로 다 찬 반기와 1년 전 같은 반기. lastClosed = 'YYYYMM'(자료가 다 찬 마지막 달)
  function halfPair(lastClosed) {
    const s = String(lastClosed), y = +s.slice(0, 4), m = +s.slice(4, 6);
    const to = m >= 12 ? [y, 2] : m >= 6 ? [y, 1] : [y - 1, 2];
    const nm = ([a, h]) => a + 'H' + h;
    return { from: nm([to[0] - 1, to[1]]), to: nm(to) };
  }

  /* 동 하나의 변화율. series = station-trend.json 의 s: [[반기, 중위 평당가, 건수], …]
   * 반환 { p(%) , a:[건수_from, 건수_to] } 또는 { hold:true, a } */
  function changeOf(series, pair, minDeals) {
    const get = h => (series || []).find(x => x[0] === h) || null;
    const f = get(pair.from), t = get(pair.to);
    const a = [f ? f[2] : 0, t ? t[2] : 0];
    if (!f || !t || f[1] == null || t[1] == null || !(f[1] > 0) || a[0] < minDeals || a[1] < minDeals) return { hold: true, a };
    return { p: (t[1] / f[1] - 1) * 100, a };
  }

  /* 시세 라벨 — 단위는 법정동(lawd|동). 역이 여럿인 동도 경계 계산엔 한 번만.
   * trendStations = station-trend.json stations → { q25,q50,q75, k: { key: {dong,m,p,a} }, n_label, n_hold } */
  function buildMarket(trendStations, pair, minDeals) {
    const k = {};
    Object.values(trendStations || {}).forEach(st => {
      if (!st || !st.lawd || !st.dong) return;
      const key = st.lawd + '|' + st.dong;
      if (k[key]) return;
      const c = changeOf(st.s, pair, minDeals);
      k[key] = c.hold ? { dong: st.dong, m: 'hold', a: c.a } : { dong: st.dong, m: null, p: c.p, a: c.a };
    });
    const vals = Object.values(k).filter(x => x.m !== 'hold').map(x => x.p).sort((a, b) => a - b);
    const q25 = quantile(vals, 0.25), q50 = quantile(vals, 0.5), q75 = quantile(vals, 0.75);
    Object.values(k).forEach(x => { if (x.m !== 'hold') x.m = x.p > q75 ? 'strong' : x.p < q25 ? 'weak' : 'mid'; });
    return { q25, q50, q75, k, n_label: vals.length, n_hold: Object.keys(k).length - vals.length };
  }

  const hasBanned = text => BANNED.filter(w => String(text).includes(w));

  return { TIER_WORD, MARKET_WORD, BANNED, pickDest, quantile, halfPair, changeOf, buildMarket, hasBanned };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = GtxCard;
