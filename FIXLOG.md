# FIXLOG — 1차 수정 (2026-10-22)

감사 리포트(`kr-rail-map-audit.html`)의 P0 결함 중 **코드로 고칠 수 있는 것**과
**FRDB로 검증 가능한 데이터**를 먼저 처리했다. 데이터 모델 전면 개편(service 레이어)은
다음 단계로 남긴다.

---

## 1. 라우팅 엔진 (`js/route.js`)

### 1-1. 순환선 폐합 누락 → 수정
조각(LineString)을 이어붙여 평탄화한 뒤 거리순 정렬만 해서, **2호선이 당산에서 끊겨** 있었다.

```diff
- const coords = lineGeom.get(lid);          // MultiLineString 을 flat(1) 로 합침
- const pr = project(p, coords);
+ pieces.forEach(coords => {                 // 조각 단위로 투영
+   ... sort by along ...
+   // 조각의 시작점과 끝점이 같으면 마지막 역 → 첫 역 연결
+   if (hav(coords[0], coords[last]) <= 0.05) addEdge(seq[last], seq[0], lid);
```

| 구간 | 이전 | 이후 | 실제 |
|---|---|---|---|
| 당산→합정 | 29분 / 3회 | **4분 / 0회** | 2호선 2정거장 |
| 시청→을지로입구 | 5분 / 1회 | **1분 / 0회** | 2호선 1정거장 |
| 강남→홍대입구 | 33분 / 3회 | 28분 / 2회 | 2호선 직결 ~25분 |

부수 효과: 조각이 끊긴 15개 노선(1호선은 14곳)에서 **분기 경계의 유령 인접역**이 사라졌다.

### 1-2. 동명이역 도보 환승 무제한 → 500m 게이트
이름이 같으면 무조건 도보 환승으로 연결해 **서울↔부산 시청이 325km 도보 엣지**로 붙어 있었다.

```diff
- for (...) for (...) addEdge(ids[i], ids[j], null, true);
+ if (hav(pa, pb) > 0.5) { walkRejected++; continue; }   // 500m 초과는 별개 역
+ addEdge(...);
```

`walkRejected = 55쌍` 차단. 충정로→시청이 240분/6회(부산 경유)에서 3분/0회로 정상화.

### 1-3. 미개통 노선이 경로에 등장 → 상태 필터 적용
`buildGraph`의 status 필터를 `addGtxOfficialEdges()`가 우회하고 있었다.

```diff
- addGtxOfficialEdges();
+ addGtxOfficialEdges(activeIds);
...
+ if (activeIds && !activeIds.has(lid)) return;   // 공사중·계획 GTX 제외
```

### 1-4. 환승 비용을 탐색 안으로
환승 페널티를 경로 탐색 **후에** 더해서, 반환 경로가 "자기가 보고하는 지표 기준 최적"이 아니었다.
상태를 `(역, 현재 노선)`으로 확장하고 `pq.sort()`+`shift()`를 이진 힙으로 교체.

### 1-5. 죽은 코드 정리
`speedOf()`가 `^ktx`를 먼저 잡아 `SPEEDS.ktx = 180`이 도달 불가였다. category 기반으로 정정.

**검증**: `node tests/route.test.js` → 12/12 통과.

---

## 2. 데이터 — FRDB 반영

출처: [미래철도DB](https://frdb2.ivyro.net) (252개 사업, 244개 사업구간(역) 확보)

### 2-1. 동부선 오귀속 정정
앱의 동부선에는 **우이신설선 역(수유·장안·110정거장)** 과 7호선 역이 섞여 있었다.
FRDB `신강북선(동부선)` 사업구간(역) 기준으로 정정.

```
이전 (9역): 110정거장, 4.19민주묘지, 성수, 수유, 신이문, 장안, 장한평, 종합운동장, 청담
이후 (7역): 4.19민주묘지 → 신이문 → 상봉 → 장한평 → 성수 → 청담 → 종합운동장
제거: 수유, 장안, 110정거장(우이천 · 월계2교)
추가: 상봉 (FRDB에는 있으나 앱 연결이 없던 역)
상태: planned → proposed (FRDB: 구상)
```

### 2-2. 노선 메타데이터 추가
`lines.geojson`에 `opened`, `operator`, `frdb_url`, `frdb_status`, `frdb_stations` 추가.
출처가 화면·페이지에서 추적 가능해진다.

---

## 3. SEO — canonical 도메인

`build_pages.py`의 `SITE` 상수가 실제 배포지와 달랐다(`wondk850` vs `plazalabs`).
canonical·og:url·JSON-LD·sitemap·robots **48개 파일 419곳**이 잘못된 도메인을 가리켰다.

```diff
- SITE = "https://wondk850.github.io/kr-rail-map"
+ SITE = os.environ.get("SITE_URL", "https://plazalabs.github.io/kr-rail-map").rstrip("/")
```

재생성 결과 `wondk850` 잔존 **0건**.

### 남은 판단거리: `line/honam-line-ktx.html`, `line/ktx.html`
sitemap 에 없던 이 2개 페이지는 삭제 대상이 아니라 **생성기 파이프라인 밖에 있는 파일**이었다.
`build_pages.py` 는 수도권 bbox 안에 역이 있는 노선만 생성하는데(의도된 동작, 파일 상단 주석 참조),
KTX 호남선·KTX 전라선은 bbox 밖이라 재생성되지 않는다. 즉 **옛 데이터가 남은 채 방치**된 상태다.

이번에는 파괴적 변경을 피해 도메인만 정정했다. 둘 중 하나를 결정해야 한다.
- (a) 삭제 + 301 → 전국 노선 페이지가 필요 없다면
- (b) `build_pages.py` 의 bbox 필터를 전국으로 확장 → 82개 노선 전부 페이지화

현재는 (b) 쪽이 일관적이다. 앱이 이미 `전국` 표시 범위를 지원하는데 랜딩 페이지만 수도권인 것은 불일치다.

---

## 4. 남은 일 (다음 단계)

| 항목 | 이유 |
|---|---|
| **service 레이어 분리** | 아래 참조 — 이게 남은 오답의 대부분 |
| KTX·GTX 정차역 정합성 | FRDB는 계획노선 중심(완공 1건). 운영기관 공시자료 필요 |
| GTX-B~F 정차역 | FRDB GTX 페이지가 A선 위주로만 구조화됨 |
| 동북선 | FRDB에 항목 없음 |
| 광주 2호선 | `사업구간(역)`이 단계별 산문 — 수동 검수 필요 |
| 검색 관련도 / 성능 / 접근성 | 감사 리포트 P1 |

### 왜 service 레이어가 급한가

엔진을 고친 뒤 남은 오답은 **전부 데이터**다.

```
강남→홍대입구 28분/2회  → GTX-A 삼성→시청 구간을 탐. GTX-A는 시청에 정차하지 않는다.
노원→여의도   39분/3회  → KTX 강릉선 상봉→시청 구간을 탐. KTX는 상봉에 정차하지 않는다.
서울역→판교   20분/1회  → GTX-A 성남 + 경강선 성남→판교. 경강선에 성남역은 없다.
```

원인은 하나다. **`stations.lines` 가 "그 선로 근처에 있는 역"을 담고 있지, "그 열차가 서는 역"을 담고 있지 않다.**
FRDB의 `사업구간(역)`은 정확히 후자이므로, 계획노선은 이걸로 해결된다.
운영노선은 운영기관 정차역 목록이 필요하다.
