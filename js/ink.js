/* 글자 대비 맞추기 (axe 접근성 검사 11-15) — 노선 공식 색을 바탕·글자로 쓸 때 12px 글자 대비 4.5:1 을 맞춘다.
 *  - onWhiteText(bg): 흰 글자를 얹을 바탕색 — 공식 색이 너무 밝으면(2호선 초록·3호선 주황 등) 검정 쪽으로 조금씩 섞어 4.5:1
 *  - asText(color, bg): 밝은 바탕 위에 쓰는 노선 색 글자(점선 '개통 전' 칩 등) — 같은 방법으로 bg 대비 4.5:1
 * 색상(hue)은 그대로라 노선 구분은 유지된다. 이미 넉넉하면 공식 색 그대로.
 */
(function (global) {
  'use strict';
  function rgbOf(hex) {
    var m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex || '').trim());
    if (!m) return null;
    var h = m[1]; if (h.length === 3) h = h.split('').map(function (x) { return x + x; }).join('');
    return [0, 2, 4].map(function (i) { return parseInt(h.slice(i, i + 2), 16); });
  }
  function lum(c) {
    var f = function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
  }
  function ratio(a, b) { var x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
  function hex(c) { return '#' + c.map(function (v) { return v.toString(16).padStart(2, '0'); }).join(''); }
  // 검정 쪽으로 섞어 against 와의 대비를 min 이상으로
  function deepen(color, against, min) {
    var c = rgbOf(color), a = rgbOf(against || '#ffffff');
    if (!c || !a) return color;
    min = min || 4.5;
    if (ratio(c, a) >= min) return hex(c);
    for (var t = 0.04; t <= 1.0001; t += 0.04) {
      var d = c.map(function (v) { return Math.round(v * (1 - t)); });
      if (ratio(d, a) >= min) return hex(d);
    }
    return '#000000';
  }
  // 흰색 쪽으로 섞어 어두운 바탕과의 대비를 min 이상으로 (다크 화면의 노선 색 글자)
  function brighten(color, against, min) {
    var c = rgbOf(color), a = rgbOf(against || '#121212');
    if (!c || !a) return color;
    min = min || 4.5;
    if (ratio(c, a) >= min) return hex(c);
    for (var t = 0.04; t <= 1.0001; t += 0.04) {
      var d = c.map(function (v) { return Math.round(v + (255 - v) * t); });
      if (ratio(d, a) >= min) return hex(d);
    }
    return '#ffffff';
  }
  global.KRInk = {
    asTextDark: function (color, bg, min) { return brighten(color, bg || '#121212', min); },
    onWhiteText: function (bg, min) { return deepen(bg, '#ffffff', min); },
    asText: function (color, bg, min) { return deepen(color, bg || '#ffffff', min); },
    ratio: function (a, b) { var x = rgbOf(a), y = rgbOf(b); return x && y ? ratio(x, y) : 0; }
  };
})(typeof window !== 'undefined' ? window : globalThis);
