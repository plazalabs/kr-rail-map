#!/usr/bin/env python3
"""로컬 OSM 캐시로 노선 선형을 조립한다 (Overpass 불필요).

fetch_osm_alignments.py 와 같은 MATCH 표를 쓰지만, 네트워크를 타지 않고
data/_osm/rail_ways.json · route_rels.json 만 읽는다. 84개 노선을 한 번에
같은 결과로 뽑을 수 있고, 남의 서버 타임아웃에 결과가 흔들리지 않는다.

relation 이 없는 노선은 여기서 처리하지 않는다 (경부선·중앙선·충북선 등).
그건 선로 그래프를 따라 최단경로를 찾는 별도 단계가 필요하다.

출력: data/_osm_align/candidates.json (기존 항목에 덮어씀)
"""
import json
import sys

from fetch_osm_alignments import ACCEPT_COVER, ACCEPT_MEDIAN, MATCH, station_points
from osm_align import CACHE, ROOT, chain_segments, dedupe_chains, length_km, score

WAYS = ROOT / "data" / "_osm" / "rail_ways.json"
RELS = ROOT / "data" / "_osm" / "route_rels.json"
OUT = CACHE / "candidates.json"


def main(argv):
    only = {a for a in argv[1:] if not a.startswith("--")}
    ways = json.loads(WAYS.read_text("utf8"))
    rels = json.loads(RELS.read_text("utf8"))
    pts = station_points()

    cands = {}
    if OUT.exists():
        try:
            cands = json.loads(OUT.read_text("utf8"))
        except Exception:                        # noqa: BLE001
            cands = {}

    print(f"way {len(ways):,} · relation {len(rels):,}\n")
    print(f"{'노선':30s} {'커버':>6s} {'중앙':>7s} {'길이km':>8s}  판정")
    missing = []
    for lid, want in MATCH.items():
        if only and lid not in only:
            continue
        chains, used, notes, seen = [], [], [], set()
        for rid, frag in want:
            r = rels.get(str(rid))
            if not r:
                notes.append(f"{rid}(relation없음)")
                continue
            name = r["tags"].get("name", "")
            if frag not in name:
                notes.append(f"{rid}(이름다름:{name[:18]})")
                continue
            segs = []
            for t, ref, role in r["members"]:
                # 'way' 와 'w' 를 둘 다 받는다. osmium 이 한 글자로 주는 버전이 있다.
                if t not in ("way", "w") or role not in ("", "forward", "backward"):
                    continue
                if ref in seen:                  # 두 relation 이 같은 way 를 담기도 한다
                    continue
                w = ways.get(str(ref))
                if w:
                    segs.append(w["coords"])
                    seen.add(ref)
            c = chain_segments(segs)
            if not c:
                notes.append(f"{rid}(way없음)")
                continue
            chains.extend(c)
            used.append(rid)

        chains = dedupe_chains(chains) if chains else chains
        if not chains:
            missing.append(lid)
            print(f"{lid:30s} {'—':>6s} {'—':>7s} {'—':>8s}  relation 없음")
            continue

        cov, mx, med = score(chains, pts.get(lid, []))
        km = length_km(chains)
        ok = cov >= ACCEPT_COVER and med <= ACCEPT_MEDIAN
        print(f"{lid:30s} {cov*100:5.0f}% {med*1000:6.0f}m {km:8.1f}  "
              f"{'채택' if ok else '보류'}{' ' + ' '.join(notes) if notes else ''}")
        cands[lid] = {
            "chains": chains, "coverage": round(cov, 4),
            "median_km": round(med, 4), "max_km": round(mx, 4),
            "length_km": round(km, 3), "relations": used,
            "accept": ok, "notes": notes, "via": "relation",
        }

    OUT.write_text(json.dumps(cands, ensure_ascii=False), "utf8")
    print(f"\n저장: {OUT.relative_to(ROOT)} ({len(cands)}개 노선)")
    if missing:
        print(f"relation 없음 {len(missing)}개: {' '.join(missing)}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
