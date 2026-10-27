"""아직 OSM 선형이 아닌 노선에 어울리는 OSM 관계(relation)를 찾아 보여준다.

선형을 옮기려면 '이 노선이 OSM 의 어느 route relation 인가' 를 먼저 정해야
한다. 손으로 318개를 훑는 대신, 노선 이름과 관계 이름의 글자 유사도로
후보를 뽑는다. 최종 선택은 사람이 한다 — 이름이 비슷하다고 그게 그 노선은
아니다 (실제로 4호선 진접선에 사당~진접 관계를 잘못 골라 진접선 4개 역이
통째로 빠진 적이 있다).

사용: python data/suggest_align_relations.py [노선id ...]
"""
import difflib
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
LINES = ROOT / "data" / "lines.geojson"
RELS = ROOT / "data" / "_osm" / "route_rels.json"


def norm(s):
    return re.sub(r"[\s·:()\-\u2013\u2014]+", " ", str(s or "")).strip()


def main(argv):
    only = [a for a in argv[1:] if not a.startswith("--")]
    rels = json.loads(RELS.read_text("utf8"))
    lines = json.loads(LINES.read_text("utf8"))["features"]

    pool = []
    for rid, r in rels.items():
        t = r["tags"]
        name = t.get("name", "")
        if not name:
            continue
        pool.append((rid, name, len(r["members"]), t.get("route", "")))

    for f in lines:
        p = f["properties"]
        if p.get("coord_source") == "osm":
            continue
        if only and p["id"] not in only:
            continue
        target = norm(p.get("name_ko", ""))
        scored = []
        for rid, name, n, route in pool:
            r = difflib.SequenceMatcher(None, target, norm(name)).ratio()
            if r >= 0.45:
                scored.append((r, n, rid, route, name))
        scored.sort(reverse=True)
        print("\n== %s (%s)" % (p["id"], p.get("name_ko")))
        if not scored:
            print("   후보 없음")
        for r, n, rid, route, name in scored[:4]:
            print("   %.2f  %-9s %-4s %s" % (r, rid, n, name[:60]))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
