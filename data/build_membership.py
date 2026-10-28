"""노선·역 목록이 **어디서 확인되는지** 계산해 파일로 남긴다.

배경
----
지금까지 노선·역 목록의 출처는 미래철도DB(FRDB)였다. 그 사이트는 스스로
"비영리, 비상업, 개인 사이트" 라고 밝히고 이용허락 표시가 없다. 유료화를
앞두고는 출처를 바꿔야 한다.

같은 사실을 **독립된 세 자료**에서 다시 얻어 대조한다.

  1. official      공공데이터포털 '노선별 역위치' CSV (국가철도공단)
                   — 이용허락범위 제한 없음. 19개 노선.
  2. osm-relation  OSM 노선 relation 의 정차점 목록
                   — ODbL. 51개 노선.
  3. osm-geometry  OSM 역 노드가 그 노선 선형에서 300m 안에 있는지
                   — ODbL. 선형이 있는 모든 노선.

셋 중 **하나라도 확인해주면** 그 (노선, 역) 쌍은 독립 확인된 것으로 본다.
아무도 확인해주지 못한 쌍만 따로 모아 보고한다 — 그것이 남은 부채다.

출력  data/line-membership.json
      { schema, updated, lines: {id: {stations, confirmed, sources,
        unconfirmed: [...], provisional: bool}}, summary: {...} }

이 파일은 배포 데이터가 아니라 **출처 증빙**이다. 화면에 쓰지 않는다.
"""
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent
OSM = ROOT / "_osm"
OUT = ROOT / "line-membership.json"

sys.path.insert(0, str(ROOT))
import official_stations as OFF  # noqa: E402
from build_transfer_times import norm_stop  # noqa: E402
from osm_align import pt_to_chains  # noqa: E402

NEAR_KM = 0.30      # 역 노드가 선형에서 이 안에 있으면 그 노선의 역으로 본다

# 확인이 안 되는 역이 남는 노선과 그 이유. **숨기지 않으려고** 여기 적는다.
# 임계값을 느슨하게 풀면 다음에 생기는 진짜 누락도 같이 통과해 버린다.
KNOWN_GAPS = {
    "mugunghwa-ho-jeolla-line": (
        "전라선 남쪽 간이역 6곳(괴목·금지·봉덕·서도·압록·주생). OSM 에 역 노드가 없고 "
        "국가철도공단 역위치 파일도 전라선을 담고 있지 않다. 역 이름은 남겨 두고 "
        "확인되지 않았다는 사실을 그대로 적는다."),
}


def _norm(s):
    """구분자 차이를 없앤 비교용 이름. '시청.용인대' == '시청·용인대'."""
    s = norm_stop(s)
    for ch in (".", "·", "ㆍ", "・", " "):
        s = s.replace(ch, "")
    return s


def osm_relation_membership():
    """OSM 노선 relation 의 정차점 → {노선 id: {정규화 이름}}"""
    from verify_osm_membership import osm_membership, load

    stops, rels, st, ln = load()
    osm, _missed, _r2l = osm_membership(rels, ln, stops)
    return {lid: {_norm(n) for n in names} for lid, names in osm.items()}


def osm_geometry_membership(lines_geo, st_geo):
    """OSM 역 노드가 선형 300m 안에 있으면 그 노선의 역. → {노선 id: {정규화 이름}}"""
    raw = json.loads((ROOT / "_osm_stations_raw.json").read_text("utf8"))
    nodes = {}
    for el in raw["elements"]:
        t = el.get("tags") or {}
        nm = t.get("name:ko") or t.get("name")
        if not nm:
            continue
        nodes.setdefault(_norm(nm), []).append((el["lon"], el["lat"]))

    out = {}
    for f in lines_geo["features"]:
        lid = f["properties"]["id"]
        g = f["geometry"]
        chains = [g["coordinates"]] if g["type"] == "LineString" else g["coordinates"]
        hit = set()
        for name, pts in nodes.items():
            for lon, lat in pts:
                if pt_to_chains((lon, lat), chains) <= NEAR_KM:
                    hit.add(name)
                    break
        if hit:
            out[lid] = hit
    return out


def ours_membership(st_geo):
    """우리 데이터의 (노선 → 역 이름). 이름은 원문 그대로도 함께 남긴다."""
    out = {}
    for f in st_geo["features"]:
        p = f["properties"]
        raw = p.get("name_ko") or ""
        for lid in (p.get("lines") or []):
            out.setdefault(lid, {})[_norm(raw)] = raw
    return out


def main():
    ln_geo = json.loads((ROOT / "lines.geojson").read_text("utf8"))
    st_geo = json.loads((ROOT / "stations.geojson").read_text("utf8"))

    official = {lid: {_norm(n) for n in d} for lid, d in OFF.load().items()}
    by_relation = osm_relation_membership()
    by_geometry = osm_geometry_membership(ln_geo, st_geo)
    ours = ours_membership(st_geo)

    status = {f["properties"]["id"]: f["properties"].get("status") for f in ln_geo["features"]}
    names = {f["properties"]["id"]: f["properties"].get("name_ko") for f in ln_geo["features"]}

    lines, total, total_ok = {}, 0, 0
    for lid, stations in sorted(ours.items()):
        conf, unconf = {}, []
        for key, raw in stations.items():
            src = []
            if key in official.get(lid, ()):
                src.append("official")
            if key in by_relation.get(lid, ()):
                src.append("osm-relation")
            if key in by_geometry.get(lid, ()):
                src.append("osm-geometry")
            if src:
                conf[raw] = src
            else:
                unconf.append(raw)
        opened = status.get(lid) == "open"
        n = len(stations)
        total += n if opened else 0
        total_ok += len(conf) if opened else 0
        lines[lid] = {
            "name": names.get(lid),
            "status": status.get(lid),
            "stations": n,
            "confirmed": len(conf),
            "sources": sorted({s for v in conf.values() for s in v}),
            "unconfirmed": sorted(unconf),
            # 개통 전 노선은 OSM·공식 자료에 없는 것이 정상이다. 이름은 계획 발표
            # 기준이고 개통 시 확정된다 — 그 사실을 값으로 남긴다.
            "provisional": not opened,
            # 개통했는데 일부 역이 확인되지 않은 경우. provisional 과 섞으면
            # '아직 안 지어진 노선' 과 '일부가 미확인인 노선' 을 구별할 수 없다.
            "partial": bool(unconf) and opened,
            "gap_reason": KNOWN_GAPS.get(lid, ""),
        }

    opened_lines = [v for v in lines.values() if v["status"] == "open"]
    doc = {
        "schema": "kr-rail-map/line-membership/1",
        "updated": "2026-10-28",
        "note": ("노선·역 목록이 어디서 확인되는지의 증빙. 배포 데이터가 아니다. "
                 "확인 원천은 공공데이터포털 역위치 CSV(이용허락 제한 없음), "
                 "OSM 노선 relation 정차점, OSM 역 노드의 선형 근접도(ODbL) 셋이다."),
        "near_km": NEAR_KM,
        "summary": {
            "lines": len(lines),
            "open_lines": len(opened_lines),
            "open_pairs": total,
            "open_confirmed": total_ok,
            "open_confirmed_pct": round(total_ok / max(1, total) * 100, 1),
            "open_lines_all_confirmed": sum(1 for v in opened_lines if not v["unconfirmed"]),
        },
        "lines": lines,
    }
    OUT.write_text(json.dumps(doc, ensure_ascii=False, indent=1) + "\n", "utf8")

    s = doc["summary"]
    print(f"개통 노선 {s['open_lines']}개 · (노선,역) {s['open_pairs']}쌍")
    print(f"  독립 확인 {s['open_confirmed']}쌍 = {s['open_confirmed_pct']}%")
    print(f"  전부 확인된 노선 {s['open_lines_all_confirmed']}개 / {s['open_lines']}개")
    print()

    bad = [(lid, v) for lid, v in lines.items() if v["status"] == "open" and v["unconfirmed"]]
    bad.sort(key=lambda kv: -len(kv[1]["unconfirmed"]))
    print(f"확인 안 된 역이 남은 개통 노선 {len(bad)}개:")
    for lid, v in bad:
        print(f"  {lid:44s} {v['confirmed']:3d}/{v['stations']:3d}  {v['name']}")
        print(f"      미확인: {', '.join(v['unconfirmed'][:10])}"
              f"{' …' if len(v['unconfirmed']) > 10 else ''}")
    print(f"\n→ {OUT.name} ({OUT.stat().st_size // 1024}KB)")


if __name__ == "__main__":
    main()
