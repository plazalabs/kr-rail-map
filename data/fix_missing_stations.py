"""공식 자료에는 있는데 우리 지도에 없는 역을 채운다.

왜 필요한가:
  역이 없으면 경로 탐색이 그 역을 목적지로 받을 수 없다. 7호선 부천시청이
  없으면 '부천시청 가는 길'을 물었을 때 아무 답도 못 준다. 노선은 그려져
  있는데 역만 없는 상태라 눈으로는 알아채기 어렵다.

어떻게 채우는가:
  좌표를 추측하지 않는다. 국가철도공단 역위치 CSV 의 경도·위도를 그대로 쓴다.
  이름도 공식 표기를 쓴다(괄호 부기는 떼고, 나머지는 data/fix_aliases.py 가
  별칭으로 붙인다).

  id 는 이름에서 만든다. 무작위로 만들면 다시 돌릴 때마다 id 가 바뀌어서
  즐겨찾기·URL 공유가 깨진다.

  이미 있는 역은 건드리지 않는다. 여러 번 돌려도 결과가 같아야 한다.
"""
import csv
import glob
import hashlib
import io
import json
import pathlib
import re
import sys
import unicodedata

ROOT = pathlib.Path(__file__).resolve().parent.parent
GOV = ROOT / "data" / "_gov"
STATIONS = ROOT / "data" / "stations.geojson"

# (공식 선명, 우리 노선 id, 공식 역명, 영문명)
# 영문명은 기존 데이터의 표기를 따른다 (Bakchon/Imhak 은 인천교통공사 표기).
ADD = [
    ("7호선", "seoul-subway-line-7", "부천시청", "Bucheon City Hall"),
    ("8호선", "seoul-subway-line-8", "구리", "Guri"),
    ("인천1호선", "incheon-subway-line-1", "박촌", "Bakchon"),
    ("인천1호선", "incheon-subway-line-1", "임학", "Imhak"),
]


def norm(s):
    s = unicodedata.normalize("NFC", s or "")
    s = re.sub(r"\s*\(.*?\)\s*", "", s).strip()
    return re.sub(r"[·.\s]", "", s)


def official():
    """(선명, 정규화 역명) → (역명, 경도, 위도)"""
    out = {}
    for f in glob.glob(str(GOV / "*역위치*.csv")):
        for r in csv.DictReader(io.open(f, encoding="utf-8-sig")):
            ln = (r.get("선명") or "").strip()
            nm = (r.get("역명") or "").strip()
            if not (ln and nm):
                continue
            try:
                lon = float(r["경도"])
                lat = float(r["위도"])
            except (KeyError, TypeError, ValueError):
                continue
            out[(ln, norm(nm))] = (nm, lon, lat)
    return out


def make_id(name):
    """이름에서 만드는 고정 id. 같은 이름이면 언제나 같은 값이 나온다."""
    h = hashlib.md5(("kr-rail-map:" + name).encode("utf8")).hexdigest()
    return "st-" + str(int(h[:12], 16) % 10_000_000_000)


def main(dry=True):
    data = json.loads(STATIONS.read_text("utf8"))
    feats = data["features"]
    gov = official()

    existing = {norm(f["properties"]["name_ko"]): f for f in feats}
    used_ids = {f["properties"].get("id") for f in feats}

    added, relinked = [], []
    for line_name, line_id, st_name, name_en in ADD:
        key = (line_name, norm(st_name))
        if key not in gov:
            print(f"  공식 자료에 없음: {line_name} {st_name}")
            continue
        off_name, lon, lat = gov[key]

        # 이미 있는 역이면 노선만 붙인다. '구리' 는 경의중앙선 역으로 이미 있고
        # 8호선 별내선 연장분만 빠져 있었다. 역을 하나 더 만들면 같은 자리에
        # 두 개가 생겨 검색·경로가 엉킨다.
        cur = existing.get(norm(st_name))
        if cur is not None:
            lines = list(cur["properties"].get("lines") or [])
            if line_id in lines:
                print(f"  이미 있음: {st_name}")
                continue
            lines.append(line_id)
            cur["properties"]["lines"] = lines
            relinked.append(f"{st_name} + {line_id}")
            continue

        sid = make_id(st_name)
        if sid in used_ids:                       # 이론상 거의 없지만 방어
            sid = make_id(st_name + "@" + line_id)
        feats.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [round(lon, 6), round(lat, 6)]},
            "properties": {
                "id": sid,
                "name_ko": st_name,
                "name_en": name_en,
                "lines": [line_id],
                "source": "국가철도공단 역위치 (공공데이터포털)",
            },
        })
        existing[norm(st_name)] = feats[-1]
        used_ids.add(sid)
        added.append(f"{st_name}({line_id}) {lon:.5f},{lat:.5f}")

    for a in relinked:
        print("  노선 추가 " + a)
    for a in added:
        print("  역 추가 " + a)
    changed = len(added) + len(relinked)
    print(f"\n역 {len(added)}개 추가 · 노선 {len(relinked)}건 추가 "
          + ("(미리보기 — 저장 안 함)" if dry else "저장"))

    if changed and not dry:
        STATIONS.write_text(
            json.dumps(data, ensure_ascii=False, separators=(",", ":")), "utf8")
        print(f"저장: {STATIONS.relative_to(ROOT)} (총 {len(feats)}역)")
    return 0


if __name__ == "__main__":
    sys.exit(main(dry="--write" not in sys.argv))
