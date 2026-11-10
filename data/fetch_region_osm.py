#!/usr/bin/env python3
"""동명역 좌표 → 시·도, 시·군·구 (OpenStreetMap Nominatim 역지오코딩) → data/_region_osm.json

왜 필요한가:
  build_station_region.py 는 국가철도공단 역 주소데이터로 동명역에 지역을 붙인다. 그런데
  주소데이터에 이름이 없거나(부산·대구 도시철도 등) 노선 표기가 겹쳐 76역 중 36역이 비었다.
  역 좌표는 우리가 이미 갖고 있으므로, 그 좌표가 어느 행정구역 안에 있는지를 OSM 행정경계로
  알아낸다. 주소데이터로 붙인 역도 함께 물어, 두 자료가 같은지 대조하는 데 쓴다.

예의: Nominatim 이용 정책대로 1초에 1번만 묻고, 결과(행정구역 주소 문자열)는 캐시 파일에 남겨 다시 묻지 않는다.
  주소 문자열을 시·도 / 시·군·구로 푸는 일은 build_station_region.py 가 한다.
  (--refresh 를 주면 캐시를 무시하고 다시 묻는다.)
라이선스: OSM 데이터(ODbL). 결과는 '행정구역 이름' 이라는 사실 정보만 쓴다.

사용
  python data/fetch_region_osm.py            # 캐시에 없는 동명역만 묻는다
  python data/fetch_region_osm.py --refresh
"""
import json
import pathlib
import sys
import time
import urllib.parse
import urllib.request
from collections import defaultdict

ROOT = pathlib.Path(__file__).resolve().parent.parent
STATIONS = ROOT / "data" / "stations.geojson"
OUT = ROOT / "data" / "_region_osm.json"
URL = "https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=14&accept-language=ko&lat=%s&lon=%s"
UA = "kr-rail-map-build/1.0 (static site data pipeline)"

def main():
    refresh = "--refresh" in sys.argv
    cache = {} if refresh or not OUT.exists() else json.loads(OUT.read_text("utf8")).get("stations", {})
    cache = {k: {"name": v["name"], "display": v["display"]} for k, v in cache.items()}
    feats = json.loads(STATIONS.read_text("utf8"))["features"]
    by = defaultdict(list)
    for f in feats:
        by[f["properties"]["name_ko"]].append(f)
    todo = [f for ss in by.values() if len(ss) > 1 for f in ss]
    asked = 0
    for f in todo:
        sid = f["properties"]["id"]
        if sid in cache:
            continue
        lon, lat = f["geometry"]["coordinates"][:2]
        req = urllib.request.Request(URL % (lat, lon), headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=30) as r:
            doc = json.loads(r.read().decode("utf8"))
        cache[sid] = {"name": f["properties"]["name_ko"], "display": doc.get("display_name")}
        asked += 1
        print("%-8s %-22s %s" % (f["properties"]["name_ko"], sid, doc.get("display_name")))
        time.sleep(1.1)
    out = {
        "source": "OpenStreetMap Nominatim 역지오코딩 (ODbL) — 역 좌표가 속한 행정구역",
        "stations": dict(sorted(cache.items())),
    }
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n", "utf8")
    print("data/_region_osm.json — 동명역 %d곳 (이번에 물은 곳 %d)" % (len(todo), asked))


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
