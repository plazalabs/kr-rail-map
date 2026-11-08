#!/usr/bin/env python3
"""산출물 검증: 스키마 준수, 유명역 스팟체크, 폴백/미귀속 샘플."""
import json
import os
import sys

# 어느 폴더에서 실행해도 data/ 의 파일을 읽는다. Windows 기본 인코딩(cp949)에서도 깨지지 않게 UTF-8 로 연다.
HERE = os.path.dirname(os.path.abspath(__file__))
lines = json.load(open(os.path.join(HERE, "lines.geojson"), encoding="utf-8"))["features"]
sts = json.load(open(os.path.join(HERE, "stations.geojson"), encoding="utf-8"))["features"]

# 1. 스키마 검사
lkeys = {"id", "name_ko", "name_en", "color", "category", "status", "variants"}
lkeys_opt = lkeys | {"note"}
skeys = {"id", "name_ko", "name_en", "line_id", "lines"}
bad_l = [f["properties"]["id"] for f in lines
         if not set(f["properties"].keys()) <= lkeys_opt or not lkeys <= set(f["properties"].keys())
         or f["geometry"]["type"] not in ("LineString", "MultiLineString")]
bad_s = [s["properties"]["id"] for s in sts
         if set(s["properties"].keys()) != skeys
         or s["geometry"]["type"] != "Point"
         or len(s["geometry"]["coordinates"]) != 2]
print(f"lines={len(lines)} schema_violations={len(bad_l)}")
print(f"stations={len(sts)} schema_violations={len(bad_s)}")
import re
bad_id = [f["properties"]["id"] for f in lines
          if not re.fullmatch(r"[a-z0-9][a-z0-9-]*", f["properties"]["id"])]
print("non-urlsafe line ids:", bad_id[:10], "count:", len(bad_id))
bad_color = [(f["properties"]["id"], f["properties"]["color"]) for f in lines
             if f["properties"]["color"] and not re.fullmatch(r"#[0-9A-F]{6}", f["properties"]["color"])]
print("bad colors:", bad_color[:10], "count:", len(bad_color))
from collections import Counter
print("category:", dict(Counter(f["properties"]["category"] for f in lines)))
print("status:", dict(Counter(f["properties"]["status"] for f in lines)))
line_ids = {f["properties"]["id"] for f in lines}
# line_id 가 없는 역에서 KeyError 로 죽던 것을 .get 으로 (IMPL12 건 1). 없는 역은 따로 센다.
dangling = [(s["properties"]["id"], s["properties"].get("line_id")) for s in sts
            if s["properties"].get("line_id") and s["properties"]["line_id"] not in line_ids]
print("dangling line refs:", len(dangling))
no_lid = [s["properties"]["id"] for s in sts if not s["properties"].get("line_id")]
print("stations without line_id:", len(no_lid), no_lid[:10])
not_member = [(s["properties"]["id"], s["properties"].get("line_id")) for s in sts
              if s["properties"].get("line_id") and s["properties"]["line_id"] not in (s["properties"].get("lines") or [])]
print("line_id not in own lines:", len(not_member), not_member[:10])

# 2. 유명역 10곳 스팟체크
targets = ["서울역", "부산역", "강남역", "홍대입구", "동대구역",
           "광주송정역", "대전역", "인천역", "수원역", "청량리역"]
print("\n=== 유명역 스팟체크 ===")
for t in targets:
    hits = [s for s in sts if s["properties"]["name_ko"] == t]
    if not hits:
        hits = [s for s in sts if t.rstrip("역") in (s["properties"]["name_ko"] or "")]
    for s in hits[:3]:
        p = s["properties"]
        print(f"{t}: name_ko={p['name_ko']} name_en={p.get('name_en')} "
              f"coord={s['geometry']['coordinates']} lines={(p.get('lines') or [])[:4]}")
    if not hits:
        print(f"{t}: NOT FOUND")

# 3. 폴백 귀속 샘플 (lines가 1개이고 fallback으로 들어간 역 중 10개)
print("\n=== 폴백 귀속 샘플 10 ===")
n = 0
for s in sts:
    p = s["properties"]
    if len(p.get("lines") or []) == 1 and n < 10:
        print(f"{p['name_ko']} {s['geometry']['coordinates']} -> {p['lines'][0]}")
        n += 1

# 4. 미귀속 샘플
print("\n=== 미귀속 역 샘플 10 ===")
n = 0
for s in sts:
    p = s["properties"]
    if not p.get("lines") and n < 10:
        print(f"{p['name_ko']} {s['geometry']['coordinates']}")
        n += 1

# 결과: 대표 노선이 없거나 끊긴 역이 있으면 실패로 끝낸다
sys.exit(1 if (no_lid or dangling) else 0)
