"""동명역 지역 표시용 '역 ID → 시·도, 시·군·구' 를 만든다 → data/station-region.json

왜 필요한가:
  '시청' 을 치면 서울·부산·대전 시청이 노선 이름만으로 구분돼 나온다. 노선 이름을 모르는
  사람에게는 '시청 · 서울 중구' 처럼 지역이 더 빠르다. 그래서 **이름이 겹치는 역에 한해**
  시·군·구를 붙인다. 겹치지 않는 역에는 붙이지 않는다(목록이 시끄러워진다).

재료: data/_station_dong.json (국가철도공단 역 주소데이터에서 뽑은 역별 시도·시군구,
      build_station_dong.py). 이 파일에는 역 ID 가 없고 '역 이름 + 노선 표기' 만 있다.

매칭 규칙 (이름만으로 붙이지 않는다 — 버그 ③의 함정):
  1. 주소 행의 노선 표기를 우리 노선 ID 로 맞춘다(LINE_CODE). 도시가 안 적힌 'N호선' 은
     서울·부산·대구·대전·광주의 N호선 모두가 후보다.
  2. 주소 행 하나가 '같은 이름이면서 그 노선을 지나는 역' 딱 한 곳에만 맞을 때만 그 역에 준다.
     두 곳 이상에 맞으면 모호한 행이라 버린다. 한 곳도 안 맞으면 버린다.
  3. 역이 받은 행들의 (시도, 시군구) 가 모두 같을 때만 지역을 붙인다. 다르면 모호한 역.
  억지로 붙이지 않는다. 못 붙인 역은 이유별로 세어 summary 에 남긴다.

사용
  python data/build_station_region.py
"""
import json
import pathlib
from collections import defaultdict
from datetime import date

ROOT = pathlib.Path(__file__).resolve().parent.parent
DONG = ROOT / "data" / "_station_dong.json"
STATIONS = ROOT / "data" / "stations.geojson"
OUT = ROOT / "data" / "station-region.json"

SEOUL_N = {
    1: "seoul-metropolitan-subway-line-1", 2: "seoul-subway-line-2", 3: "seoul-metro-line-3",
    4: "seoul-metropolitan-subway-line-4", 5: "seoul-subway-line-5", 6: "seoul-subway-line-6",
    7: "seoul-subway-line-7", 8: "seoul-subway-line-8", 9: "seoul-subway-line-9",
}
OTHER_N = {
    1: ["busan-metro-line-1", "daegu-metro-line-1", "daejeon-metro-line-1", "gwangju-metro-line-1-pyeongdong-nokdong"],
    2: ["busan-metro-line-2-green-line", "daegu-metro-line-2", "daejeon-metro-line-2", "gwangju-metro-line-2-inner-circle-line"],
    3: ["busan-metro-line-3-brown-line", "daegu-metro-line-3"],
    4: ["busan-metro-line-4-blue-line"],
}
# 주소데이터 노선 표기 → 우리 노선 ID 후보
LINE_CODE = {
    "경강": ["seoul-metropolitan-subway-gyeonggang-line", "gyeonggang-line-ktx"],
    "경의중앙": ["gyeongui-jungang-line"],
    "경춘": ["seoul-metropolitan-subway-gyeongchun-line"],
    "부산김해경전철": ["busan-gimhae-light-rail-transit"],
    "동해": ["donghae-line"],
    "분당선": ["suin-bundang-line"],
    "수인선": ["suin-bundang-line"],
    "수인분당": ["suin-bundang-line"],
    "용인에버라인": ["yongin-light-rail-transit"],
    "인천1호선": ["incheon-subway-line-1"],
    "인천2호선": ["incheon-subway-line-2"],
    "자기부상": ["incheon-airport-maglev-line-eastbound"],
    "대경선": ["daegyeong-line"],
    "서해": ["seoul-metropolitan-subway-seohae-line", "seohae-line-conv"],
}
for n in range(1, 10):
    LINE_CODE["%d호선" % n] = [SEOUL_N[n]] + OTHER_N.get(n, [])

SIDO_SHORT = {
    "서울특별시": "서울", "부산광역시": "부산", "대구광역시": "대구", "인천광역시": "인천",
    "광주광역시": "광주", "대전광역시": "대전", "울산광역시": "울산", "세종특별자치시": "세종",
    "경기도": "경기", "강원도": "강원", "강원특별자치도": "강원", "충청북도": "충북", "충청남도": "충남",
    "전라북도": "전북", "전북특별자치도": "전북", "전라남도": "전남", "경상북도": "경북",
    "경상남도": "경남", "제주특별자치도": "제주",
}


def main():
    dong = json.loads(DONG.read_text("utf8"))
    stations = json.loads(STATIONS.read_text("utf8"))["features"]

    by_name = defaultdict(list)
    for s in stations:
        by_name[s["properties"]["name_ko"]].append(s)
    dup = {n: ss for n, ss in by_name.items() if len(ss) > 1}

    rows_by_name = defaultdict(list)
    for r in dong:
        rows_by_name[r["name"]].append(r)

    unknown_codes = sorted({r["line"] for r in dong if r["line"] not in LINE_CODE})
    got = defaultdict(set)          # 역 ID → {(시도, 시군구)}
    row_stat = defaultdict(int)     # 행 판정 수
    for name, ss in dup.items():
        for r in rows_by_name.get(name, []):
            cands = set(LINE_CODE.get(r["line"], []))
            hit = [s for s in ss if cands & set(s["properties"].get("lines") or [])]
            if len(hit) == 1:
                got[hit[0]["properties"]["id"]].add((r["sido"], r["sgg"]))
                row_stat["한 역에 맞음"] += 1
            elif len(hit) > 1:
                row_stat["두 역 이상에 맞음(모호)"] += 1
            else:
                row_stat["맞는 역 없음"] += 1

    out, reasons, per_name = {}, defaultdict(list), {}
    for name, ss in sorted(dup.items()):
        per_name[name] = []
        for s in ss:
            sid = s["properties"]["id"]
            regs = got.get(sid, set())
            if len(regs) == 1:
                sido, sgg = next(iter(regs))
                label = (SIDO_SHORT.get(sido, sido) + " " + sgg).strip()
                out[sid] = {"name": name, "sido": sido, "sgg": sgg, "label": label}
                per_name[name].append(label)
            else:
                if not rows_by_name.get(name):
                    why = "주소데이터에 이 이름이 없음"
                elif len(regs) > 1:
                    why = "맞는 행들의 지역이 서로 다름"
                else:
                    why = "이 역에만 맞는 행이 없음(노선 표기가 겹치거나 안 맞음)"
                reasons[why].append(name + "(" + "/".join(s["properties"].get("lines") or []) + ")")
                per_name[name].append(None)

    summary = {
        "dup_names": len(dup),
        "dup_stations": sum(len(v) for v in dup.values()),
        "labeled": len(out),
        "unlabeled": sum(len(v) for v in reasons.values()),
        "unlabeled_by_reason": {k: len(v) for k, v in reasons.items()},
        "rows": dict(row_stat),
        "unknown_line_codes": unknown_codes,
    }
    doc = {
        "updated": date.today().isoformat(),
        "source": "korail-addr — 국가철도공단 역 주소데이터 (data/_station_dong.json 경유)",
        "basis": "이름이 겹치는 역에 한해, 이름+노선 표기로 그 역 하나에만 맞는 주소 행의 시도·시군구. 모호하거나 안 맞는 역은 넣지 않는다.",
        "summary": summary,
        "stations": dict(sorted(out.items())),
        "unlabeled": {k: sorted(v) for k, v in sorted(reasons.items())},
    }
    OUT.write_text(json.dumps(doc, ensure_ascii=False, indent=1) + "\n", "utf8")
    print("data/station-region.json — 동명 %d개 이름 · %d역 중 지역 붙임 %d · 못 붙임 %d"
          % (summary["dup_names"], summary["dup_stations"], summary["labeled"], summary["unlabeled"]))
    for k, v in summary["unlabeled_by_reason"].items():
        print("  못 붙임 — %s: %d" % (k, v))
    print("  주소 행:", dict(row_stat), "· 모르는 노선 표기:", unknown_codes)
    for name, labs in sorted(per_name.items()):
        print("  %s: %s" % (name, ", ".join(l or "—" for l in labs)))


if __name__ == "__main__":
    main()
