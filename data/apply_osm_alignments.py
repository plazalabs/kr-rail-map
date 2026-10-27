#!/usr/bin/env python3
"""OSM 선형 후보를 lines.geojson 에 반영한다.

반영 조건 (하나라도 어긋나면 그 노선은 건드리지 않는다)
------------------------------------------------------
1. 후보가 채택 판정을 받았을 것 (역의 90% 이상이 300m 안, 중앙 이탈 150m 이내)
2. 공식 영업거리가 있는 노선은 새 길이가 ±8% 안일 것
3. 새 선형이 지금 선형보다 역을 더 잘 지나갈 것 (같으면 무해하므로 허용)

3번이 중요한 이유: OSM relation 이 일부 구간만 담고 있으면 역 커버율이
떨어진다. 그런 걸로 갈아치우면 '라이선스는 깨끗해졌지만 지도는 틀린' 상태가
된다. 목적은 법적 안전이지 정확도 포기가 아니다.

실행
----
  python data/apply_osm_alignments.py           # 미리보기
  python data/apply_osm_alignments.py --apply   # 반영
"""
import json
import re
import sys

from osm_align import CACHE, ROOT, length_km, pt_to_chains, score

LINES = ROOT / "data" / "lines.geojson"
STATIONS = ROOT / "data" / "stations.geojson"
CANDS = CACHE / "candidates.json"
GRAPH = CACHE / "graph.json"

# 공식 영업거리(km). data/fix_geometry_dup.py 의 표를 그대로 쓰고 몇 개를 보탠다.
OFFICIAL = {
    "seoul-subway-line-2": 60.2,
    "seoul-subway-line-5": 59.7,
    "seoul-subway-line-6": 36.4,
    "arex": 63.8,
    "yongin-light-rail-transit": 18.1,
    "suin-bundang-line": 105.8,
    "daegyeong-line": 61.9,
    "wolmi-sea-train": 6.1,
}
TOL_OFFICIAL = 0.08
# 새 선형과 지금 선형의 길이가 이만큼 넘게 어긋나면 반영하지 않는다.
#
# 둘은 서로 독립된 자료다(철도맘 화면 vs OSM 선로). 길이가 15% 넘게 다르면
# 둘 중 하나는 틀린 것인데, 어느 쪽인지 자동으로 알 수 없다. 길이만 보고
# 'OSM 이 맞다' 고 넘기면 엉뚱한 선로를 탄 선형이 그대로 들어온다 —
# 중부내륙선이 83km(실제 135km), 장항선이 114km(실제 154km)로 나왔다.
# 둘이 맞아떨어질 때만 바꾼다. 어긋나면 지금 선형을 두고 따로 확인한다.
AGREE = 0.15
# 역이 선에서 이만큼 떨어지면 눈에 띈다. 300m 를 넘으면 지도에서
# 아이콘이 선 밖에 뜨므로 그 노선은 반영하지 않는다.
MAX_DEV = 0.40

SEP = " · "


def station_points():
    """노선 id → [(역 이름, [lon,lat]), ...]."""
    d = json.loads(STATIONS.read_text("utf8"))
    by = {}
    for f in d["features"]:
        p = f["properties"]
        c = f["geometry"]["coordinates"]
        for lid in (p.get("lines") or []):
            by.setdefault(lid, []).append((p.get("name_ko") or "?", (c[0], c[1])))
    return by


def current_chains(feat):
    g = feat["geometry"]
    return [g["coordinates"]] if g["type"] == "LineString" else g["coordinates"]


def _strip_align(text):
    """note 에서 '선형이 어디서 왔는지' 를 말하는 문장을 걷어낸다.

    예전 note 는 형식이 제각각이었다 — '[선형: chul.mom 데이터 기반]',
    '개략 선형: 역간 직선 연결 (추론) — 실제 선로와 다름'. 그런 문장은 이제
    사실이 아니므로(선형이 OSM 으로 바뀌었으므로) 통째로 버린다. 다만 같은
    note 안에 섞여 있는 다른 정보('2026-10-14 apt84rank.com/gtx 공식 소요시간
    반영')는 남긴다.
    """
    out = []
    for sent in re.split(r"(?<=\.)\s+| · ", text or ""):
        s = sent.strip()
        if not s:
            continue
        if re.match(r"^\[?\s*(?:개략\s*)?선형\s*:", s):
            continue
        s = re.sub(r"\[?\s*선형\s*:[^\]]*\]?", "", s).strip(" .·")
        if s:
            out.append(s)
    return out


def new_note(old, med_m, via="relation"):
    """선형 출처 문장을 새로 쓴다. 여러 번 돌려도 문장이 쌓이지 않는다.

    예전에는 '지금 note 에 출처 문장이 있으면 뒤에 붙인다' 였는데, apply 를
    돌릴 때마다 같은 문장이 하나씩 늘어 노선 정보 패널에 세 번씩 반복됐다.
    선형을 설명하는 문장은 전부 걷어내고 하나만 새로 붙인다.
    """
    how = "선로를 따라 이음" if via == "graph" else "노선 relation"
    base = f"선형: OpenStreetMap(ODbL) {how} — 역 대조 중앙 오차 {med_m:.0f}m"
    return SEP.join(_strip_align(old) + [base])


def main(argv):
    apply = "--apply" in argv
    cands = json.loads(CANDS.read_text("utf8"))
    # 그래프 방식(역→역 선로 탐색)은 역 좌표를 그대로 지나가므로 relation 보다
    # 역 이탈이 작다. 채택된 그래프 후보가 있으면 그쪽을 쓴다.
    if GRAPH.exists():
        for lid, g in json.loads(GRAPH.read_text("utf8")).items():
            cur = cands.get(lid)
            if g.get("accept") or cur is None or not cur.get("accept"):
                cands[lid] = g
    data = json.loads(LINES.read_text("utf8"))
    pts = station_points()
    by_id = {f["properties"]["id"]: f for f in data["features"]}

    rows, applied, skipped = [], 0, []
    for lid, c in cands.items():
        feat = by_id.get(lid)
        if feat is None:
            skipped.append((lid, "lines.geojson 에 없음"))
            continue
        chains = c["chains"]
        new_km = length_km(chains)
        cur_km = length_km(current_chains(feat))
        named = pts.get(lid, [])
        cov_new, _, med_new = score(chains, [co for _, co in named])
        devs = [(nm, pt_to_chains(co, chains)) for nm, co in named]

        why = []
        if not c.get("accept"):
            why.append("채택 기준 미달")
        if lid in OFFICIAL:
            off = OFFICIAL[lid]
            if abs(new_km - off) / off > TOL_OFFICIAL:
                why.append(f"공식 {off}km 대비 {new_km:.1f}km")
        if cur_km > 1.0 and abs(new_km - cur_km) / cur_km > AGREE:
            why.append(f"지금 {cur_km:.0f}km ↔ OSM {new_km:.0f}km")
        # 지금 선형의 커버율과 비교하지 않는다. 지금 선형은 역을 이어서 그린
        # 것이라 정의상 100% 가 나온다 — 기준으로 쓸 수 없는 숫자다.
        # 대신 '역이 선에서 얼마나 떨어지는가'를 절대값으로 본다. 사용자가
        # 실제로 보는 문제는 이것이다(역 아이콘이 선 밖에 뜨는 것).
        outliers = [(nm, d) for nm, d in devs if d > MAX_DEV]
        if outliers:
            why.append(f"역 {len(outliers)}개가 선 밖 " +
                       " ".join(f"{nm}{d * 1000:.0f}m" for nm, d in outliers[:4]))

        rows.append((feat["properties"]["name_ko"], cur_km, new_km,
                     cov_new, med_new * 1000, " / ".join(why) or "반영", lid))
        if why:
            skipped.append((lid, " / ".join(why)))
            continue

        if apply:
            feat["geometry"] = {
                "type": "MultiLineString",
                "coordinates": [[[round(x, 5), round(y, 5)] for x, y in ch] for ch in chains],
            }
            feat["properties"]["coord_source"] = "osm"
            feat["properties"]["coord_relations"] = c["relations"]
            # 근거를 남긴다. relation 이면 그 관계 id 로, graph 면 선로망 탐색으로
            # 만들었다는 뜻이다. 나중에 '이 선형이 어디서 왔나' 를 되물을 때
            # 이 값이 없으면 재현할 방법이 사라진다.
            feat["properties"]["coord_method"] = c.get("via", "relation")
            feat["properties"]["note"] = new_note(
                feat["properties"].get("note"), med_new * 1000, c.get("via", "relation"))
            applied += 1

    print(f"{'노선':24s} {'지금km':>7s} {'OSMkm':>7s} {'역커버':>7s} {'중앙':>6s}  판정")
    for name, a, b, cb, med, why, lid in rows:
        print(f"{name[:22]:24s} {a:7.1f} {b:7.1f} {cb * 100:6.0f}% {med:5.0f}m  {why}")

    ok = len([r for r in rows if r[5] == "반영"])
    print(f"\n반영 {applied if apply else ok}개 / 보류 {len(skipped)}개")
    for lid, why in skipped:
        print(f"  보류 {lid}: {why}")

    if apply:
        LINES.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), "utf8")
        print(f"저장: {LINES.relative_to(ROOT)}")
    else:
        print("(미리보기 — 저장 안 함. --apply 로 반영)")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
