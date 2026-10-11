# 한국철도맵 (KoreaRailMap)

chul.mom(철도맘) 스타일의 **한국 전용** 철도 노선도 웹앱. 서버 없이 돌아가는 정적 단일 페이지 앱.

## 실행

```bash
cd ~/workspace/kr-rail-map
python3 -m http.server 8123
# 브라우저에서 http://localhost:8123/ 열기
```

`?style=local` 쿼리를 붙이면 타일 없이 동작하는 오프라인 QA 모드.

## 구조

| 경로 | 설명 |
|---|---|
| `index.html` / `css/style.css` | 앱 셸, 7종 테마(CSS 변수) |
| `js/app.js` | 베이스맵 3종(일반/위성/흑백)·해시 공유·노선 토글·한/영 검색·이미지 저장 |
| `js/route.js` | 길찾기 (역-노선 그래프 + 다익스트라, 노선별 평균속도 어림) |
| `js/draw.js` | 나만의 노선 그리기 + 거리/면적 측정 |
| `vendor/` | MapLibre GL JS 4.7.1 (로컬 벤더링, BSD 라이선스) |
| `data/lines.geojson` `data/stations.geojson` | 앱이 읽는 최종 데이터 (68노선·1244역) |
| `data/build_data.py` | 파이프라인: Geofabrik PBF → 원시 GeoJSON |
| `data/clean_data.py` | 후처리: 노이즈 제거·변형 병합·역 병합·GTX-C 개략선 |
| `data/PIPELINE.md` `data/CLEANING.md` `data/SCHEMA.md` | 데이터 문서 |
| `site.webmanifest` `icons/` | PWA |

## 데이터 출처

- 노선/역: © OpenStreetMap contributors, ODbL (Geofabrik 2026-10-09 추출)
- 베이스맵: © OpenStreetMap · OpenFreeMap / 위성: © Esri
- GTX-C는 OSM에 relation이 없어 역 좌표(실측) + 역간 직선(개략) 으로 수동 추가 — `properties.note` 참조
- 무색 노선의 색상은 디자인 지정 (CLEANING.md)

## 배포

정적 파일이라 GitHub Pages / Cloudflare Pages / Vercel에 그대로 올리면 됨.
