/* 역 검색 — 순위가 있는 검색.
 *
 * 예전에는 `name.includes(q)` 하나로 걸러서 데이터 순서대로 잘라 보여줬다.
 * 그래서 '서울'을 치면 서울역이 아니라 먼저 나오는 역이 위에 왔고,
 * 'ㄱㄴ' 같은 초성 검색도, 오타 허용도, 별칭(419민주묘지 · 110정거장)도 없었다.
 *
 * 점수는 '얼마나 정확히 그 역인가' 순으로 매긴다.
 *   1000  이름이 정확히 같음
 *    900  이름이 그 글자로 시작
 *    800  이름 중간에 포함
 *    700  별칭이 같음/시작/포함
 *    600  영문 이름이 시작/포함
 *    500  초성만 맞음 (ㄱㄴ → 강남)
 *    400  오타 1~2글자 (한글은 자모 단위로 비교)
 * 그리고 점수가 같으면 환승역(노선이 많은 역)을 위로 올린다.
 */
(function (global) {
  'use strict';

  const CHO = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ',
    'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
  const CHO_SET = new Set(CHO);

  // 검색에서 의미 없는 문자는 지운다 (띄어쓰기·가운뎃점·괄호·마침표·하이픈)
  function norm(s) {
    return String(s || '').toLowerCase().replace(/[\s·.,()\-_/]/g, '');
  }

  // 한글 문자열 → 초성 문자열. 한글이 아닌 글자는 그대로 둔다.
  function chosung(s) {
    let out = '';
    for (const ch of String(s || '')) {
      const code = ch.charCodeAt(0);
      if (code >= 0xac00 && code <= 0xd7a3) out += CHO[Math.floor((code - 0xac00) / 588)];
      else if (CHO_SET.has(ch)) out += ch;
      else out += ch;
    }
    return out;
  }

  // 초성만 입력했는지 (ㄱ, ㄱㄴ 처럼 자음만)
  function isChosungOnly(q) {
    if (!q) return false;
    for (const ch of q) if (!CHO_SET.has(ch)) return false;
    return true;
  }

  // 레벤슈타인 거리. cap 을 넘으면 조기 종료한다.
  function editDistance(a, b, cap) {
    if (Math.abs(a.length - b.length) > cap) return cap + 1;
    const prev = new Array(b.length + 1);
    const cur = new Array(b.length + 1);
    for (let j = 0; j <= b.length; j++) prev[j] = j;
    for (let i = 1; i <= a.length; i++) {
      cur[0] = i;
      let best = cur[0];
      for (let j = 1; j <= b.length; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
        if (cur[j] < best) best = cur[j];
      }
      if (best > cap) return cap + 1;
      for (let j = 0; j <= b.length; j++) prev[j] = cur[j];
    }
    return prev[b.length];
  }

  // 한 글자 오타는 '자모' 단위로 봐야 잡힌다 (강남 ↔ 간남).
  // 완성형 글자를 자모로 풀어 비교하면 ㄱㅏㅇㄴㅏㅁ vs ㄱㅏㄴㄴㅏㅁ → 거리 1.
  const JAMO_L = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ',
    'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
  const JAMO_V = ['ㅏ', 'ㅐ', 'ㅑ', 'ㅒ', 'ㅓ', 'ㅔ', 'ㅕ', 'ㅖ', 'ㅗ', 'ㅘ', 'ㅙ',
    'ㅚ', 'ㅛ', 'ㅜ', 'ㅝ', 'ㅞ', 'ㅟ', 'ㅠ', 'ㅡ', 'ㅢ', 'ㅣ'];
  const JAMO_T = ['', 'ㄱ', 'ㄲ', 'ㄳ', 'ㄴ', 'ㄵ', 'ㄶ', 'ㄷ', 'ㄹ', 'ㄺ', 'ㄻ',
    'ㄼ', 'ㄽ', 'ㄾ', 'ㄿ', 'ㅀ', 'ㅁ', 'ㅂ', 'ㅄ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅊ',
    'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];

  function toJamo(s) {
    let out = '';
    for (const ch of String(s || '')) {
      const code = ch.charCodeAt(0);
      if (code >= 0xac00 && code <= 0xd7a3) {
        const i = code - 0xac00;
        out += JAMO_L[Math.floor(i / 588)] + JAMO_V[Math.floor((i % 588) / 28)] + JAMO_T[i % 28];
      } else out += ch;
    }
    return out;
  }

  // 역 하나의 점수. 0 이면 안 맞음.
  function scoreOf(props, q) {
    const name = norm(props.name_ko);
    if (!name || !q) return 0;

    if (name === q) return 1000;
    if (name.startsWith(q)) return 900 - Math.min(40, name.length - q.length);
    const at = name.indexOf(q);
    if (at > 0) return 800 - Math.min(60, at * 10);

    for (const a of (props.aliases || [])) {
      const an = norm(a);
      if (!an) continue;
      if (an === q) return 700;
      if (an.startsWith(q)) return 690;
      if (an.includes(q)) return 680;
    }

    const en = norm(props.name_en);
    if (en) {
      if (en === q) return 650;
      if (en.startsWith(q)) return 620;
      if (en.includes(q)) return 600;
    }

    // 초성 검색 (ㄱㄴ → 강남, ㄱㅂ → 강변)
    if (isChosungOnly(q) && q.length >= 1) {
      const c = chosung(name);
      if (c.startsWith(q)) return 500 - Math.min(40, c.length - q.length);
      if (c.includes(q)) return 470;
    }

    // 오타 허용 — 글자수가 2 이상일 때만 (한 글자 검색은 너무 넓어진다)
    // 초성만 친 경우는 여기로 오면 안 된다. 'ㅇㄴㄹㅇㅇㄴ' 을 자모로 풀면
    // '일원'(ㅇㅣㄹㅇㅓㄴ) 과 거리 2 로 걸려서 엉뚱한 역이 튀어나온다.
    // 초성 검색은 위 초성 경로에서만 판정한다.
    if (q.length >= 2 && !isChosungOnly(q)) {
      const cap = q.length >= 5 ? 2 : 1;
      const d = editDistance(toJamo(name), toJamo(q), cap);
      if (d <= cap) return 400 - d * 40;
    }
    return 0;
  }

  // 사람들은 역 이름 뒤에 '역' 을 붙여 친다 (강남역 · 서울역 · 부산역).
  // 데이터의 이름에는 '역' 이 없으니 떼고 한 번 더 본다.
  function queryVariants(q) {
    const out = [q];
    if (q.length >= 2 && q.endsWith('역')) out.push(q.slice(0, -1));
    return out;
  }

  /**
   * @param {Array} stations  GeoJSON features
   * @param {string} query
   * @param {{limit?:number}} [opts]
   * @returns {Array<{feature:Object, score:number}>}
   */
  function search(stations, query, opts) {
    const raw = String(query || '').trim();
    if (!raw) return [];
    const q = norm(raw);
    if (!q) return [];
    const limit = (opts && opts.limit) || 12;
    const variants = queryVariants(q);

    const hits = [];
    for (const f of stations) {
      let s = 0;
      for (const v of variants) {
        const t = scoreOf(f.properties, v);
        if (t > s) s = t;
      }
      if (s > 0) hits.push({ feature: f, score: s });
    }
    hits.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      // 같은 점수면 환승역이 위로 (노선 수가 많을수록 주요 역)
      const la = (a.feature.properties.lines || []).length;
      const lb = (b.feature.properties.lines || []).length;
      if (lb !== la) return lb - la;
      const na = (a.feature.properties.name_ko || '').length;
      const nb = (b.feature.properties.name_ko || '').length;
      return na - nb;
    });
    return hits.slice(0, limit);
  }

  const api = { search, scoreOf, norm, chosung, toJamo, editDistance, isChosungOnly };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.StationSearch = api;
})(typeof window !== 'undefined' ? window : globalThis);
