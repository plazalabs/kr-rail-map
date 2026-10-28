"""역 안 환승 도보 시간을 OSM 정차점 좌표로 계산한다.

지금은 환승 1회를 **무조건 4분** 으로 센다. 그런데 신도림 1↔2호선은 지상에서
지하로 100m 넘게 걷고, 노원 4↔7호선은 승강장이 위아래로 붙어 있다. 같은 4분을
매기면 '환승이 적은 경로' 를 고를 때 실제와 다른 판단을 하게 된다.

방법
----
OSM 노선 relation 에는 정차점(stop_position)이 **순서대로** 들어 있다. 같은 역
주변에서 노선 A 의 정차점과 노선 B 의 정차점 사이 거리를 재면 두 승강장이
수평으로 얼마나 떨어져 있는지 알 수 있다.

    환승 시간 = 수평거리 / 도보속도(1.0 m/s) + 수직이동·대기 90초

도보속도는 계단·혼잡을 감안해 지상(1.3 m/s)보다 느리게 잡았다. 수평거리만으로는
계단·에스컬레이터 이동을 알 수 없어 고정값을 더한다. 이 값은 **추정**이며,
공식 환승 소요시간 자료가 아니다. 자료가 없는 역은 지금처럼 4분을 쓴다.

입력  data/_osm/stops.json        정차점 좌표 (osm_platform_extract.py)
      data/_osm/route_rels.json   노선 relation
      data/stations.geojson       우리 역 (id, 좌표, lines[])
출력  data/transfer-times.json
"""
import json
import math
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent
OSM = ROOT / "_osm"
OUT = ROOT / "transfer-times.json"

WALK_MPS = 1.0        # 역 안 도보 속도 (계단·혼잡 감안)
OVERHEAD_S = 90       # 수직 이동·개찰·대기
MIN_MIN = 2
MAX_MIN = 12
NEAR_M = 450          # 역 좌표에서 이 안의 정차점만 그 역 것으로 본다
DEFAULT_MIN = 4       # 자료가 없을 때 (지금 쓰는 값)

RAIL_ROUTES = ("subway", "train", "light_rail", "monorail")

# relation 이름 → 우리 노선 id. 이름이 그대로 맞는 것이 대부분이라 접두사로
# 잡고, 줄임·다른 표기만 여기서 명시한다. **여기 없는 이름은 버리지 않고
# '못 붙인 relation' 으로 보고한다** — 조용히 빠지면 커버리지가 줄어든다.
ALIAS = {
    "수도권 광역급행철도 A선": "great-train-express-line-a",
    "동해선 광역전철": "donghae-line",
    "서울 경전철 신림선": "sillim-line",
    "경부선": "gyeongbu-line",
    "경부선 (부산역 행)": "gyeongbu-line",
    "경부고속철도": "gyeongbu-line-ktx",
    "호남선 ITX-새마을 (필수정차)": "itx-saemaeul-honam-line",
    "인천국제공항철도 일반열차": "arex",
    "인천국제공항철도 직통열차": "arex",
    "수도권 전철 1호선 경인·경원 계통": "seoul-metropolitan-subway-line-1",
    "경의·중앙선": "gyeongui-jungang-line",
    "서울 지하철 2호선 성수지선": "seoul-subway-line-2",
    "서울 지하철 2호선 신정지선": "seoul-subway-line-2",
    "수도권 전철 경춘선": "seoul-metropolitan-subway-gyeongchun-line",
    "수도권 전철 경강선": "seoul-metropolitan-subway-gyeonggang-line",
    "수도권 전철 서해선": "seoul-metropolitan-subway-seohae-line",
    "평택선 ITX 마음": "pyeongtaek-line",
    "교외선 무궁화호": "gyooe-line-mugunghwa-train",
    "ITX-청춘": "seoul-metropolitan-subway-gyeongchun-line",
    "KTX 중부내륙선": "ktx-jungbunaeryuk-line",
}

# 이름 **끝에** 붙는 꼬리표만 뗀다. '급행' 을 문자열 어디서든 지우면
# '수도권 광역급행철도 A선' 이 '수도권 광역철도 A선' 이 되어 매칭에 실패한다.
STRIP_SUFFIX = ("급행", "일반열차", "직통열차", "(필수정차)", "무궁화호", "ITX-새마을")

# 'A선 KTX' 처럼 순서가 뒤집힌 이름
REORDER = {
    "강릉선 KTX": "KTX 강릉선",
    "경부선 KTX": "KTX 경부선",
    "호남선 KTX": "KTX 호남선",
    "전라선 KTX": "KTX 전라선",
    "경강선 KTX": "KTX 경강선",
}


def hav(a, b):
    R = 6371000.0
    dlat = math.radians(b[1] - a[1])
    dlon = math.radians(b[0] - a[0])
    h = (math.sin(dlat / 2) ** 2
         + math.cos(math.radians(a[1])) * math.cos(math.radians(b[1])) * math.sin(dlon / 2) ** 2)
    return 2 * R * math.asin(math.sqrt(min(1.0, h)))


def norm_stop(name):
    """역 이름 비교용. '잠실(송파구청)' 과 '잠실' 을 같게 본다."""
    s = name.split("(")[0].strip().replace(" ", "")
    return s[:-1] if s.endswith("역") and len(s) > 2 else s


def same_station(a, b):
    """같은 역인가. **정확히 같을 때만** 참이다.

    접두사 비교(`startswith`)를 쓰면 '잠실' 이 '잠실나루' 를, '동대문' 이
    '동대문역사문화공원' 을 삼킨다. 둘 다 450m 안에 들어오는 자리가 있어서
    이웃 역 승강장까지 환승 거리에 섞인다. 괄호 부기('잠실(송파구청)')와
    끝의 '역' 은 norm_stop 이 이미 떼므로 정확 비교로 충분하다.
    """
    a, b = norm_stop(a), norm_stop(b)
    return bool(a) and a == b


def norm_name(raw):
    """relation 이름에서 계통 표기(': A → B')와 꼬리표를 떼어낸다."""
    s = raw.split(":")[0].strip()
    s = REORDER.get(s, s)
    changed = True
    while changed:
        changed = False
        for w in STRIP_SUFFIX:
            if s.endswith(w) and len(s) > len(w):
                s = s[:-len(w)].strip()
                changed = True
    return s


def line_index(lines_geo):
    """우리 노선 이름 → id. 긴 이름부터 맞춰야 '수도권 전철 1호선 경인' 이
    '수도권 전철 1호선' 으로 잘리지 않는다."""
    by_name = {}
    for f in lines_geo["features"]:
        p = f["properties"]
        if p.get("name_ko"):
            by_name[p["name_ko"]] = p["id"]
    return dict(sorted(by_name.items(), key=lambda kv: -len(kv[0])))


def map_relations(rels, by_name):
    """relation id → 우리 노선 id. 못 붙인 것은 따로 모아 보고한다."""
    out, missed = {}, []
    for rid, rel in rels.items():
        if rel["tags"].get("route") not in RAIL_ROUTES:
            continue
        raw = rel["tags"].get("name") or ""
        if not raw.strip():
            missed.append((rid, "(이름없음)"))
            continue
        n = norm_name(raw)
        lid = ALIAS.get(n)
        if not lid:
            for name, cand in by_name.items():   # 긴 이름 우선
                if n.startswith(name):
                    lid = cand
                    break
        if lid:
            out[rid] = lid
        else:
            missed.append((rid, raw))
    return out, missed


def main():
    stops = json.loads((OSM / "stops.json").read_text("utf8"))
    rels = json.loads((OSM / "route_rels.json").read_text("utf8"))
    st_geo = json.loads((ROOT / "stations.geojson").read_text("utf8"))
    ln_geo = json.loads((ROOT / "lines.geojson").read_text("utf8"))

    by_name = line_index(ln_geo)
    rel2line, missed = map_relations(rels, by_name)
    print(f"relation {len(rel2line)}개를 노선에 붙였다 · 못 붙인 것 {len(missed)}개")
    for rid, nm in missed[:12]:
        print(f"   ? {rid} {nm[:50]}")

    # 노선별 정차점 목록 (좌표 + 이름)
    line_stops = {}
    for sid, s in stops.items():
        for rid in s["rels"]:
            lid = rel2line.get(rid)
            if lid:
                line_stops.setdefault(lid, []).append((s["lon"], s["lat"], s["name"]))

    # 역 → 노선별 정차점 목록
    #
    # **역 중심에서 가장 가까운 정차점**을 고르면 안 된다. 동대문은 1호선이
    # 중심에서 62m, 4호선이 219m 지점에 있어서 그 둘을 비교하면 280m 가 나오는데,
    # 실제로는 1호선 141m 지점과 4호선 219m 지점이 마주 보고 있어 94m 다.
    # 승강장은 길어서 '중심에서 가까운 끝'끼리 비교하면 거리가 부풀려진다.
    # 정차점끼리 **모든 조합의 최소값**을 쓴다.
    #
    # 이름이 다른 정차점은 뺀다 — 동대문 반경 450m 에 동묘앞 정차점이 들어온다.
    #
    # 한 역에서 한 노선만 정차점을 못 찾았다고 역 전체를 버리지 않는다.
    # 정차점이 **양쪽 다** 있는 쌍만 계산하고, 나머지 쌍은 화면에서 기본값을
    # 쓴다. 경부선·KTX 는 일부 역에만 정차점이 있어서, 역 단위로 버리면
    # 서울역처럼 다른 쌍은 잴 수 있는 역까지 통째로 사라진다.
    out, pair_n, fallback = {}, 0, 0
    for f in st_geo["features"]:
        p = f["properties"]
        lines = p.get("lines") or []
        if len(lines) < 2:
            continue
        sname = p.get("name_ko") or ""
        c = f["geometry"]["coordinates"]
        near = {}
        for lid in lines:
            pts = [q for q in line_stops.get(lid, ())
                   if hav(c, q) <= NEAR_M and same_station(q[2], sname)]
            if pts:
                near[lid] = pts
        pairs = {}
        ids = sorted(near)
        for i, a in enumerate(ids):
            for b in ids[i + 1:]:
                d = min(hav(x, y) for x in near[a] for y in near[b])
                mins = d / WALK_MPS + OVERHEAD_S
                mins = max(MIN_MIN * 60, min(MAX_MIN * 60, mins))
                pairs[f"{a}|{b}"] = {"m": round(d), "min": int(mins / 60 + 0.5)}
        if pairs:
            out[p["id"]] = {"name": sname, "pairs": pairs}
            pair_n += len(pairs)
        else:
            fallback += 1

    doc = {
        "schema": "kr-rail-map/transfer-times/1",
        "updated": "2026-10-27",
        "method": "osm-stop-position",
        "note": ("OSM 노선 relation 의 정차점 좌표로 잰 승강장 사이 수평거리 ÷ 1.0m/s "
                 "+ 수직이동 90초. 공식 환승 소요시간 자료가 아닌 추정값."),
        "default_min": DEFAULT_MIN,
        "walk_mps": WALK_MPS,
        "overhead_s": OVERHEAD_S,
        "clamp": [MIN_MIN, MAX_MIN],
        "stations": out,
    }
    OUT.write_text(json.dumps(doc, ensure_ascii=False, separators=(",", ":")), "utf8")

    total = sum(1 for f in st_geo["features"] if len(f.get("properties", {}).get("lines") or []) > 1)
    print(f"환승역 {total}곳 중 {len(out)}곳 계산 · {pair_n}개 노선쌍 · "
          f"{fallback}곳은 정차점 자료 없음(기본 {DEFAULT_MIN}분)")
    print(f"→ {OUT.relative_to(ROOT)} ({OUT.stat().st_size // 1024}KB)")


if __name__ == "__main__":
    main()
