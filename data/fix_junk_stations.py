#!/usr/bin/env python3
"""철도역이 아닌 항목을 역 목록에서 뺀다.

왜 생겼나
---------
OSM 에는 레일바이크(관광용 페달차) 정류 시설도 `railway=station` 으로
태그된 곳이 있다. 역 데이터를 OSM 에서 만들었으니 그것까지 역으로 들어왔다.
그 결과:

  - 검색에서 '양평' 을 치면 레일바이크 종점이 후보로 뜬다
  - 경로 탐색이 그 지점을 목적지로 받는다 (실제로는 갈 수 없다)
  - 역 수 통계가 2개 부풀려진다
  - 선형을 선로 그래프로 그릴 때 그 지점까지 경로가 없어 실패한다

지우는 건 이 두 항목뿐이다. 애매한 것(차량기지임시승강장, 서부정류장 등)은
실제 승강장이거나 역명이라 건드리지 않는다.

실행
----
  python data/fix_junk_stations.py           # 미리보기
  python data/fix_junk_stations.py --apply   # 반영
"""
import json
import sys

from osm_align import ROOT

STATIONS = ROOT / "data" / "stations.geojson"

# id → 왜 빼는지
JUNK = {
    "st-3732996352": "양평레일바이크 종점 — 관광용 레일바이크 시설, 철도역 아님",
    "st-12178154628": "간현레일바이크종점 — 관광용 레일바이크 시설, 철도역 아님",
}


def main(argv):
    apply = "--apply" in argv
    data = json.loads(STATIONS.read_text("utf8"))
    feats = data["features"]

    drop = [f for f in feats if f["properties"].get("id") in JUNK]
    keep = [f for f in feats if f["properties"].get("id") not in JUNK]

    print(f"역 {len(feats)}개 → {len(keep)}개")
    for f in drop:
        p = f["properties"]
        print(f"  제외 {p['name_ko']:22s} {JUNK[p['id']]}")

    notfound = set(JUNK) - {f["properties"].get("id") for f in feats}
    for i in notfound:
        print(f"  이미 없음: {i}")

    if not drop:
        print("바꿀 것 없음")
        return 0
    if not apply:
        print("\n(미리보기 — 저장 안 함. --apply 로 반영)")
        return 0

    data["features"] = keep
    STATIONS.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), "utf8")
    print(f"\n저장: {STATIONS.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
