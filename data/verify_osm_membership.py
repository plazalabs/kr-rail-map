"""OSM 노선 relation 만으로 '노선 → 역 목록' 을 만들어 우리 데이터와 대조한다.

왜 필요한가
-----------
지금 노선·역 목록의 출처는 미래철도DB(FRDB)다. 그 사이트는 스스로
"비영리, 비상업, 개인 사이트" 라고 밝히고 있고 이용허락 표시가 없다.
유료화를 앞두고는 출처를 바꿔야 한다.

같은 사실을 OSM 에서 독립적으로 얻을 수 있는지 먼저 재본다. OSM 노선 relation
에는 정차점이 순서대로 들어 있으므로, relation → 우리 노선 매핑만 하면
노선별 역 목록이 나온다. 그것과 지금 데이터를 비교해 **어디가 다른지** 본다.

출력은 사람이 읽는 표다. 파일을 고치지 않는다 (읽기 전용 점검).

사용
----
    python data/verify_osm_membership.py          # 요약
    python data/verify_osm_membership.py --lines  # 노선별 상세
"""
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent
OSM = ROOT / "_osm"

sys.path.insert(0, str(ROOT))
from build_transfer_times import line_index, map_relations, norm_stop, RAIL_ROUTES  # noqa: E402

# 노선 이름이 OSM 과 우리가 달라 붙지 않는 것들. 여기 없는 것은 이름 접두사로 붙는다.
EXTRA_ALIAS = {
    # OSM 은 노선을 '운행 계통' 으로 적는다. 우리 id 와 이름이 달라 명시한다.
    "수도권 전철 경의·중앙선": "gyeongui-jungang-line",
    "수도권 전철 수인·분당선": "suin-bundang-line",
    "수도권 전철 4호선": "seoul-metropolitan-subway-line-4",
    "수도권 전철 3호선": "seoul-metro-line-3",
    "수도권 전철 8호선": "seoul-subway-line-8",
    "서울 지하철 9호선": "seoul-subway-line-9",
    "인천 도시철도 1호선": "incheon-subway-line-1",
    "인천 도시철도 2호선": "incheon-subway-line-2",
    "부산 도시철도 4호선": "busan-metro-line-4-blue-line",
    "대구 도시철도 3호선": "daegu-metro-line-3",
    "대전 도시철도 1호선": "daejeon-metro-line-1",
    "광주 도시철도 1호선": "gwangju-metro-line-1-pyeongdong-nokdong",
    "김포 도시철도": "gimpo-goldline",
    "의정부 경전철": "uijeongbu-lrt",
    "용인 에버라인": "yongin-light-rail-transit",
    "부산김해경전철": "busan-gimhae-light-rail-transit",
    "인천공항 자기부상철도": "incheon-airport-maglev-line-eastbound",
    "월미바다열차": "wolmi-sea-train",
}


def load():
    stops = json.loads((OSM / "stops.json").read_text("utf8"))
    rels = json.loads((OSM / "route_rels.json").read_text("utf8"))
    st = json.loads((ROOT / "stations.geojson").read_text("utf8"))
    ln = json.loads((ROOT / "lines.geojson").read_text("utf8"))
    return stops, rels, st, ln


def osm_membership(rels, ln, stops):
    """OSM relation → {우리 노선 id: set(정규화된 역 이름)}"""
    by_name = line_index(ln)
    by_name.update({k: v for k, v in EXTRA_ALIAS.items() if v in {f["properties"]["id"] for f in ln["features"]}})
    by_name = dict(sorted(by_name.items(), key=lambda kv: -len(kv[0])))
    rel2line, missed = map_relations(rels, by_name)

    # 정차점 id → 소속 relation 들. 한 정차점이 상행/하행 두 relation 에 들어 있다.
    out = {}
    for sid, s in stops.items():
        name = norm_stop(s["name"])
        if not name:
            continue
        for rid in s["rels"]:
            lid = rel2line.get(rid)
            if lid:
                out.setdefault(lid, set()).add(name)
    return out, missed, rel2line


def ours_membership(st):
    out = {}
    for f in st["features"]:
        p = f["properties"]
        name = norm_stop(p.get("name_ko") or "")
        for lid in (p.get("lines") or []):
            out.setdefault(lid, set()).add(name)
    return out


def main():
    detail = "--lines" in sys.argv
    stops, rels, st, ln = load()
    osm, missed, rel2line = osm_membership(rels, ln, stops)
    ours = ours_membership(st)

    ids = [f["properties"]["id"] for f in ln["features"]]
    status = {f["properties"]["id"]: f["properties"].get("status") for f in ln["features"]}
    names = {f["properties"]["id"]: f["properties"].get("name_ko") for f in ln["features"]}

    print(f"OSM relation {len(rel2line)}개를 노선에 붙였다 (못 붙임 {len(missed)}개)")
    print(f"OSM 에 정차점이 있는 노선 {len(osm)}개 / 전체 {len(ids)}개\n")

    rows = []
    for lid in ids:
        o = osm.get(lid)
        u = ours.get(lid, set())
        if o is None:
            rows.append((lid, status[lid], len(u), None, None, None, "OSM 없음"))
            continue
        inter = len(o & u)
        cov = inter / len(o) if o else 0.0     # OSM 이 아는 역을 우리가 갖고 있나
        prec = inter / len(u) if u else 0.0    # 우리 역을 OSM 이 확인해주나
        rows.append((lid, status[lid], len(u), len(o), cov, prec, ""))

    # 개통 노선만 집계한다. 미개통은 OSM 에 없는 게 정상이다.
    opened = [r for r in rows if r[1] == "open"]
    have = [r for r in opened if r[3] is not None]
    tot_osm = sum(r[3] for r in have)
    tot_hit = sum(round(r[4] * r[3]) for r in have)
    tot_ours = sum(r[2] for r in have)
    print(f"[개통 노선 {len(opened)}개] OSM 에 정차점이 있는 노선 {len(have)}개")
    print(f"  OSM 이 아는 (노선,역) {tot_osm}쌍 중 우리가 가진 것 {tot_hit}쌍 "
          f"= {tot_hit / max(1, tot_osm) * 100:.1f}%")
    print(f"  우리 (노선,역) {tot_ours}쌍 중 OSM 이 확인해주는 것 {tot_hit}쌍 "
          f"= {tot_hit / max(1, tot_ours) * 100:.1f}%")
    print()

    missing_osm = [r for r in opened if r[3] is None]
    if missing_osm:
        print("OSM 에 정차점이 없어 대조 불가(개통 노선):")
        for r in missing_osm:
            print(f"  {r[0]:44s} 역 {r[2]:3d}  {names[r[0]]}")
        print()

    bad = [r for r in have if r[4] < 0.90]
    bad.sort(key=lambda r: r[4])
    print(f"OSM 커버율 90% 미만인 개통 노선 {len(bad)}개:")
    for lid, _, nu, no, cov, prec, _ in bad:
        print(f"  {lid:44s} 우리 {nu:3d} OSM {no:3d}  커버 {cov * 100:5.1f}%  "
              f"정밀 {prec * 100:5.1f}%  {names[lid]}")

    if detail:
        print("\n[노선별]")
        for lid, stt, nu, no, cov, prec, note in rows:
            if no is None:
                print(f"  {lid:44s} {stt:12s} 우리 {nu:3d}  {note}")
            else:
                print(f"  {lid:44s} {stt:12s} 우리 {nu:3d} OSM {no:3d}  "
                      f"커버 {cov * 100:5.1f}%  정밀 {prec * 100:5.1f}%")

        # 노선별 차이 목록 (상위)
        print("\n[차이 상세 — 개통 노선, 커버 90% 미만]")
        for lid, _, nu, no, cov, prec, _ in bad:
            o, u = osm[lid], ours[lid]
            print(f"  == {lid} ({names[lid]})")
            only_osm = sorted(o - u)[:12]
            only_us = sorted(u - o)[:12]
            if only_osm:
                print(f"     OSM 에만: {', '.join(only_osm)}")
            if only_us:
                print(f"     우리만  : {', '.join(only_us)}")


if __name__ == "__main__":
    main()
