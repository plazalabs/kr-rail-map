# 한국철도맵 (KoreaRailMap)

수도권 전철을 중심으로 한 **철도 노선도 웹앱**. 서버 없이 도는 정적 단일 페이지 앱입니다.

- 지도 위에 82개 노선 / 1,245개 역
- 역 검색 · 최단 경로·환승·요금 계산
- **45도 개략 노선도** (지리 좌표를 옥타리니어로 재배치)
- 노선별 정적 랜딩 페이지 44개 + sitemap
- 모바일 대응(오프캔버스 드로어 / 하단 툴바 / 바텀시트)
- PWA(오프라인) · 7가지 지도 테마

## 실행

```bash
python3 -m http.server 8123
# 브라우저에서 http://localhost:8123/
```

`?style=local` 쿼리를 붙이면 타일 없이 동작하는 오프라인 QA 모드.
`?line=<노선 id>` 로 특정 노선만 볼 수 있습니다. 예: `/?line=seoul-subway-line-2`

## 구조

| 경로 | 설명 |
|---|---|
| `index.html` / `css/style.css` | 앱 셸, 디자인 토큰, 반응형 레이아웃 |
| `js/ui.js` | 토스트·모달 관리·드로어·드롭다운·키보드 |
| `js/app.js` | 지도 3종, 표시 범위(수도권/전국), 검색, 노선 토글, 공유, 즐겨찾기 |
| `js/route.js` | 길찾기 (역-노선 그래프 + 다익스트라, 노선별 평균속도) |
| `js/diagram.js` | **개략 노선도 엔진** — 환승역 병합, 45도 완화 배치, 라벨 충돌 회피 |
| `js/draw.js` | 나만의 노선 그리기 + 거리/면적 측정 |
| `js/station-detail.js` `compare.js` `stats.js` `timeline.js` `route-compare.js` `invest.js` `coverage.js` | 역 상세·비교·통계·타임라인·경로비교·투자분석·영향권 |
| `vendor/` | MapLibre GL JS 4.7.1 (로컬 벤더링, BSD) |
| `data/lines.geojson` `data/stations.geojson` | 앱이 읽는 최종 데이터 (82노선·1,245역) |
| `data/build_data.py` | 파이프라인: Geofabrik PBF → 원시 GeoJSON |
| `data/clean_data.py` | 후처리: 노이즈 제거·변형 병합·역 병합 |
| `data/dedupe_geometry.py` | 같은 구간이 양방향으로 중복된 조각 제거 (연장 2배 오류 수정) |
| `data/fix_station_lines.py` | 역↔노선 연결 보정 (0역 노선 문제 수정) |
| `build_pages.py` | 노선별 정적 페이지 `line/*.html` + `sitemap.xml` + `robots.txt` 생성 |
| `data/PIPELINE.md` `CLEANING.md` `SCHEMA.md` | 데이터 문서 |

## 데이터 다시 만들기

```bash
cd data
python3 build_data.py        # PBF → GeoJSON (raw 필요)
python3 clean_data.py        # 노이즈 제거·병합
python3 dedupe_geometry.py   # 중복 선형 제거
python3 fix_station_lines.py # 역-노선 연결 보정
cd .. && python3 build_pages.py   # 정적 페이지 + sitemap
```

## 데이터 출처

- 노선/역: © OpenStreetMap contributors, ODbL (Geofabrik 2026-10-09 추출)
- 베이스맵: © OpenStreetMap · OpenFreeMap / 위성: © Esri
- GTX-C는 OSM에 relation이 없어 역 좌표(실측) + 역간 직선(개략) 으로 수동 추가 — `properties.note` 참조
- 무색 노선의 색상은 디자인 지정 (CLEANING.md)

## 배포

정적 파일이라 GitHub Pages / Cloudflare Pages / Vercel에 그대로 올리면 됩니다.
