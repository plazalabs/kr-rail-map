/* kr-rail-map 다이어그램 PNG 저장 모듈
 * - DiagramMode(다이어그램 모드)의 SVG schematic 뷰를 PNG로 다운로드
 * - 완전히 독립적인 모듈: 다른 파일 수정 없음
 */
(function () {
  'use strict';

  var BG = '#f6f7f9'; // 테마 배경으로 대체된다

  function bgColor() {
    try {
      var v = getComputedStyle(document.body).getPropertyValue('--surface').trim();
      return v || BG;
    } catch (e) { return BG; }
  }

  function notify(msg) {
    // 앱의 setStatus가 있으면 사용, 없으면 alert
    try {
      if (typeof window.setStatus === 'function') { window.setStatus(msg); return; }
    } catch (e) {}
    alert(msg);
  }

  function pad(n) { return String(n).padStart(2, '0'); }

  function fileName() {
    var d = new Date();
    return 'kr-rail-map-diagram-' +
      d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '-' +
      pad(d.getHours()) + pad(d.getMinutes()) + '.png';
  }

  function download(blob, name) {
    var a = document.createElement('a');
    var url = URL.createObjectURL(blob);
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 1000);
  }

  function save() {
    // 1) 다이어그램 활성화 확인
    var active = false;
    try {
      active = (typeof DiagramMode !== 'undefined') && DiagramMode.isActive();
    } catch (e) {}
    if (!active) {
      notify('다이어그램 모드를 먼저 켜주세요 (🗺️ 노선도 버튼)');
      return;
    }

    // 2) SVG 찾기
    var svg = document.querySelector('#diagram-overlay svg');
    if (!svg) {
      notify('다이어그램 SVG를 찾을 수 없습니다.');
      return;
    }

    // 3) SVG 복제 + 직렬화 (외부 CSS 의존 없음: 전부 presentation attribute)
    var clone = svg.cloneNode(true);
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    // 상호작용 관련 속성 제거 (저장에 불필요)
    clone.querySelectorAll('.dg-station').forEach(function (g) {
      g.removeAttribute('style');
    });
    var xml;
    try {
      xml = new XMLSerializer().serializeToString(clone);
    } catch (e) {
      notify('SVG 변환에 실패했습니다.');
      return;
    }

    // 4) Image → Canvas → PNG
    var W = parseInt(clone.getAttribute('width'), 10) || svg.clientWidth || 1200;
    var H = parseInt(clone.getAttribute('height'), 10) || svg.clientHeight || 800;
    var img = new Image();
    var svgBlob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' });
    var svgUrl = URL.createObjectURL(svgBlob);

    img.onload = function () {
      URL.revokeObjectURL(svgUrl);
      try {
        var canvas = document.createElement('canvas');
        canvas.width = W;
        canvas.height = H;
        var ctx = canvas.getContext('2d');
        ctx.fillStyle = bgColor();
        ctx.fillRect(0, 0, W, H);
        ctx.drawImage(img, 0, 0, W, H);
        canvas.toBlob(function (blob) {
          if (!blob) { notify('PNG 생성에 실패했습니다.'); return; }
          download(blob, fileName());
          notify('다이어그램 PNG 저장됨');
        }, 'image/png');
      } catch (e) {
        notify('PNG 생성 중 오류가 발생했습니다.');
      }
    };
    img.onerror = function () {
      URL.revokeObjectURL(svgUrl);
      notify('이미지 변환에 실패했습니다.');
    };
    img.src = svgUrl;
  }

  var DiagramExport = { save: save };
  if (typeof window !== 'undefined') window.DiagramExport = DiagramExport;
})();
