# 데이터 스키마 (앱 ↔ 파이프라인 계약)

앱(`js/app.js`)은 아래 두 파일을 `data/` 에서 fetch로 읽는다.
파일이 없으면 스모크 테스트 데이터를 표시한다.

## data/lines.geojson
FeatureCollection. geometry: `LineString` 또는 `MultiLineString` (좌표는 [경도, 위도]).

| property | 타입 | 예 | 설명 |
|---|---|---|---|
| id | string | `"seoul-metro-1"` | 안정적·URL 안전. 노선 토글/필터 키 |
| name_ko | string | `"1호선"` | |
| name_en | string | `"Line 1"` | |
| color | string \| null | `"#0052A4"` | `#RRGGBB`. 모르면 null (앱은 #888888 폴백) |
| category | string | `"metro"` | `metro` \| `urban` \| `ktx` \| `conventional` \| `etc` |
| status | string | `"open"` | `open` \| `construction` \| `planned` |

## data/stations.geojson
FeatureCollection. geometry: `Point` [경도, 위도].

| property | 타입 | 예 | 설명 |
|---|---|---|---|
| id | string | `"st-seoul-001"` | |
| name_ko | string | `"서울역"` | |
| name_en | string | `"Seoul Station"` | 없으면 빈 문자열 |
| line_id | string | `"gyeongbu-line"` | 대표 노선 (필터용) |
| lines | string[] | `["gyeongbu-line","seoul-metro-1"]` | 소속 노선 id 전체 (표시용) |

## 라이선스
노선/역 데이터 © OpenStreetMap contributors, ODbL. 앱 화면 하단에 표기.
