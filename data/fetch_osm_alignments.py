#!/usr/bin/env python3
"""노선별로 OSM route relation 을 받아 선형 후보를 만들고 채점한다.

relation id 는 2026-10-25 에 Overpass 로 실제 목록을 받아 확인한 것이다.
id 만 적어두면 나중에 남의 relation 을 가리킬 수 있으므로 **기대 이름을 같이
적고, 실제 이름이 다르면 쓰지 않는다.** 조용히 엉뚱한 선을 그리는 것보다
못 찾았다고 말하는 게 낫다.

출력: data/_osm_align/candidates.json
  { line_id: {chains, coverage, median_km, max_km, length_km, relations:[...]} }

실행
----
  python data/fetch_osm_alignments.py            # 전부
  python data/fetch_osm_alignments.py gtx-a ...  # 일부만
"""
import json
import pathlib
import sys

from osm_align import (ROOT, CACHE, chains_from_relation, fetch_relations,
                       length_km, score)

STATIONS = ROOT / "data" / "stations.geojson"
LINES = ROOT / "data" / "lines.geojson"
OUT = CACHE / "candidates.json"

# line_id → [(relation id, 이름에 반드시 들어 있어야 하는 조각), ...]
# 여러 개인 노선은 지선·분기 때문이다. 합집합이 그 노선 전체가 된다.
MATCH = {
    "seoul-metropolitan-subway-line-1": [
        # 청량리~서울역~용산~구로~병점~서동탄을 한 번에 지난다. 서울역에서
        # 지하(종로선)와 지상(경부선)이 이어져 있어 실제 열차가 이렇게 간다.
        # 예전에 '서울역 → 서동탄' 만 썼더니 노량진·대방·신길·용산이 선에서
        # 1~3km 떴다 — 그 구간이 relation 에 없었기 때문이다.
        (15833653, "청량리 → 서동탄"),
        (16712689, "광운대 → 구로"),  # 청량리~광운대(경원선) 구간
        (16851102, "광운대 → 연천"),
        (14181832, "구로 → 신창"),
        (15885884, "구로 → 인천"),
        (4748705, "광명 → 영등포"),
    ],
    "seoul-subway-line-2": [
        (2404374, "외선순환"),
        (4729405, "성수지선"),
        (4729407, "신정지선"),
    ],
    "seoul-metro-line-3": [(443803, "3호선: 대화 → 오금")],
    "seoul-metropolitan-subway-line-4": [
        # 진접선 연장(2022)이 '불암산 → 오이도' 에는 없다. 따로 붙여야
        # 진접·오남·별내별가람이 선 위에 올라간다.
        (2718884, "4호선: 불암산 → 오이도"),
        (13675921, "사당 → 진접"),   # 진접선 구간을 담고 있는 유일한 relation
    ],
    "seoul-subway-line-5": [
        (4744340, "방화 → 상일동"),
        (12497486, "방화 → 하남검단산"),
        (4744338, "강동 → 마천"),
    ],
    # '봉화산' 종착 relation 은 신내를 담지 않는다. 신내까지 가는 것을 쓴다.
    "seoul-subway-line-6": [(12080315, "응암순환 → 신내")],
    "seoul-subway-line-7": [(12746493, "장암 → 석남")],
    "seoul-subway-line-8": [(2718901, "별내 → 모란")],
    "seoul-subway-line-9": [(2718888, "9호선: 개화 → 중앙보훈병원")],
    "gyeongui-jungang-line": [
        (12623856, "지평 → 문산"),
        (13487300, "임진강 → 도라산"),
    ],
    "seoul-metropolitan-subway-gyeongchun-line": [
        (8656358, "춘천 → 청량리"),
        (8656364, "광운대 → 춘천"),   # 평일 광운대 착발 열차가 지나는 지선
    ],
    "seoul-metropolitan-subway-seohae-line": [(16244688, "일산 → 원시")],
    "seohae-line-conv": [(18243453, "서화성~홍성")],
    # 왕십리 종착 relation 은 청량리(경원선 공용 구간)를 담지 않는다.
    "suin-bundang-line": [(11634612, "인천 → 청량리")],
    "seoul-metropolitan-subway-shinbundang-line": [(6060963, "신사 → 광교")],
    "seoul-metropolitan-subway-gyeonggang-line": [(6462562, "판교 → 여주")],
    "incheon-subway-line-1": [(19425645, "검단호수공원 → 송도달빛축제공원")],
    "incheon-subway-line-2": [(7527496, "검단오류 → 운연")],
    "arex": [(2911378, "인천공항2터미널 → 서울역")],
    "gimpo-goldline": [(10092719, "김포공항 → 양촌")],
    "sillim-line": [(14191876, "관악산 → 샛강")],
    "ui-sinseol-line": [(7533582, "북한산우이 → 신설동")],
    "uijeongbu-lrt": [(7530880, "발곡 → 탑석")],
    "yongin-light-rail-transit": [(6064093, "기흥 → 전대·에버랜드")],
    "busan-metro-line-1": [(2201600, "노포 → 다대포해수욕장")],
    "busan-metro-line-2-green-line": [(2194999, "부산 도시철도 2호선")],
    "busan-metro-line-3-brown-line": [(2195014, "부산 도시철도 3호선")],
    "busan-metro-line-4-blue-line": [(2205952, "부산 도시철도 4호선")],
    "busan-gimhae-light-rail-transit": [(2204611, "사상 → 가야대")],
    "daegu-metro-line-1": [(7685464, "대구 도시철도 1호선")],
    "daegu-metro-line-2": [(7685783, "대구 도시철도 2호선")],
    "daegu-metro-line-3": [(7685727, "대구 도시철도 3호선")],
    "daejeon-metro-line-1": [(7237829, "반석 → 판암")],
    "gwangju-metro-line-1-pyeongdong-nokdong": [(13463725, "녹동 → 평동")],
    "gwangju-metro-line-2-inner-circle-line": [(8032733, "2호선 내선순환")],
    "wolmi-sea-train": [(14074976, "월미바다열차")],
    "incheon-airport-maglev-line-eastbound": [(7701183, "자기부상철도")],
    "incheon-international-airport-shuttle-train": [(17585166, "셔틀트레인")],
    "daegyeong-line": [(18505697, "경산 → 구미")],
    "great-train-express-line-a": [
        (18828089, "운정중앙 → 서울역"),
        (17413294, "수서 → 동탄"),
    ],
    "gyeongbu-line": [(8266158, "경부선 (서울역 행)")],
    "gyeongbu-line-ktx": [(2474720, "경부고속철도")],
    "gangneung-line-ktx": [(12239797, "강릉선 KTX: 서울 → 강릉")],
    "ktx-jungbunaeryuk-line": [(16275008, "부발 → 충주")],
    "honam-line-ktx": [(11272646, "호남선 KTX: 용산 → 목포")],
    "itx-saemaeul-honam-line": [(13781771, "호남선 ITX-새마을")],
    "ktx": [(11272647, "전라선 KTX: 용산 → 여수엑스포")],
    "mugunghwa-ho-jeolla-line": [(13781775, "전라선 무궁화호")],
    "saemaeul-ho-janghang-line": [(13799112, "장항선 새마을호")],
    "gyeongjeon-line": [(7798599, "경전선")],
    "gyeongbuk-line": [(8787856, "경북선")],
    "yeongdong-line": [(7796215, "영동선")],
    "taebaek-line": [(7796022, "태백선")],
    "pyeongtaek-line": [(20500831, "평택선")],
    "gyooe-line-mugunghwa-train": [(18581442, "교외선 무궁화호")],
    "donghae-line": [(6708903, "부전 → 태화강")],
    "posco-pohang-jecheol-line": [(17549372, "포스코 포항제철소선")],
}

ACCEPT_COVER = 0.90   # 역의 90% 이상이 선에서 300m 안에 있어야 한다
ACCEPT_MEDIAN = 0.15  # 중앙 이탈 150m 이내


def station_points():
    """노선 id → 우리 역 좌표 목록."""
    d = json.loads(STATIONS.read_text("utf8"))
    by = {}
    for f in d["features"]:
        p = f["properties"]
        c = f["geometry"]["coordinates"]
        for lid in (p.get("lines") or []):
            by.setdefault(lid, []).append((c[0], c[1]))
    return by


def main(argv):
    args = [a for a in argv[1:] if not a.startswith("--")]
    force = "--force" in argv
    only = set(args)
    pts = station_points()
    ids = [i for lid, lst in MATCH.items() if not only or lid in only for i, _ in lst]
    print(f"relation {len(set(ids))}개 요청" + (" (캐시 무시)" if force else ""))
    rels = fetch_relations(ids, force=force)

    cands = {}
    if OUT.exists():
        try:
            cands = json.loads(OUT.read_text("utf8"))
        except Exception:                            # noqa: BLE001
            cands = {}

    print(f"\n{'노선':34s} {'커버':>6s} {'중앙':>7s} {'최대':>7s} {'길이km':>8s}  판정")
    for lid, want in MATCH.items():
        if only and lid not in only:
            continue
        chains, used, miss = [], [], []
        for rid, frag in want:
            rel = rels.get(rid)
            if not rel:
                miss.append(f"{rid}(없음)")
                continue
            name = (rel.get("tags") or {}).get("name", "")
            if frag not in name:
                # id 가 다른 relation 을 가리키게 됐다. 이름이 다르면 쓰지 않는다.
                miss.append(f"{rid}(이름다름:{name[:20]})")
                continue
            c = chains_from_relation(rel)
            if not c:
                miss.append(f"{rid}(way없음)")
                continue
            chains.extend(c)
            used.append(rid)

        if not chains:
            print(f"{lid:34s} {'—':>6s} {'—':>7s} {'—':>7s} {'—':>8s}  OSM 없음 {miss}")
            continue

        cov, mx, med = score(chains, pts.get(lid, []))
        km = length_km(chains)
        ok = cov >= ACCEPT_COVER and med <= ACCEPT_MEDIAN
        print(f"{lid:34s} {cov*100:5.0f}% {med*1000:6.0f}m {mx*1000:6.0f}m {km:8.1f}  "
              f"{'채택' if ok else '보류'} {miss if miss else ''}")
        cands[lid] = {
            "chains": chains, "coverage": round(cov, 4),
            "median_km": round(med, 4), "max_km": round(mx, 4),
            "length_km": round(km, 3), "relations": used,
            "accept": ok, "notes": miss,
        }

    OUT.write_text(json.dumps(cands, ensure_ascii=False), "utf8")
    print(f"\n저장: {OUT.relative_to(ROOT)} ({len(cands)}개 노선)")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
