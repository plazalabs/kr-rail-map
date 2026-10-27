#!/usr/bin/env python3
"""OSM에 한국 철도 노선 relation이 얼마나 있는지 조사한다.

선형을 OSM으로 옮기려면 먼저 '무엇이 있는지'를 알아야 한다. 없는 걸
억지로 만들면 안 되고, 있는 걸 놓치면 정확도를 버리는 것이다.

지오메트리 없이 태그만 받는다 — relation 개수가 수천이라 geom 까지 받으면
수백 MB 가 된다. 이름·ref·route 종류만 보고 우리 84개 노선과 맞춘다.

출력: data/_osm_routes_tags.json
"""
import json
import pathlib
import sys
import time
import urllib.parse
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "_osm_routes_tags.json"

# 한반도 남부. 제주(33.1)·울릉도(37.5, 130.9) 포함.
BBOX = "33.0,124.0,38.7,132.5"
Q = f"""[out:json][timeout:900];
rel({BBOX})["route"~"^(train|subway|light_rail|tram|monorail)$"];
out tags;"""

HOSTS = [
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass-api.de/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
]


def main():
    for host in HOSTS:
        name = host.split("/")[2]
        t0 = time.time()
        try:
            req = urllib.request.Request(
                host,
                data=urllib.parse.urlencode({"data": Q}).encode(),
                headers={"User-Agent": "kr-rail-map/1.0 (licence audit; contact via github)"},
            )
            raw = urllib.request.urlopen(req, timeout=900).read()
            d = json.loads(raw.decode("utf8"))
        except Exception as e:                       # noqa: BLE001 — 미러마다 실패 방식이 다르다
            print(f"{name}: 실패 {type(e).__name__} {str(e)[:100]}")
            continue
        els = d.get("elements") or []
        print(f"{name}: relation {len(els)}개, {time.time() - t0:.0f}초")
        OUT.write_text(json.dumps(d, ensure_ascii=False), "utf8")
        print(f"저장: {OUT.relative_to(ROOT)}")
        return 0
    print("모든 미러 실패")
    return 1


if __name__ == "__main__":
    sys.exit(main())
