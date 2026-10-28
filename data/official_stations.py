"""공공데이터포털 '역위치' CSV 를 읽어 노선별 역 목록을 만든다.

왜 필요한가
-----------
노선·역 목록의 출처를 미래철도DB(FRDB)에서 **공식 자료**로 바꾼다. 국가철도공단이
공공데이터포털에 올린 역위치 파일은 `이용허락범위 제한 없음` 이고, 선명·역명·
운영기관·좌표가 한 행에 다 들어 있다. 우리가 필요한 것의 대부분이 여기 있다.

파일은 `data/_gov/*역위치*.csv` 에 있다. 열 이름이 파일마다 조금씩 다르다
(`철도운영기관명` / `철도운영기관`, `선명`, `역명`, `경도`, `위도`).

같은 역이 두 파일에 나오는 경우가 있다 — 분당선 파일과 수인선 파일이 둘 다
선명을 '수인분당' 으로 적는다. (선명, 역명) 으로 중복을 없앤다.

사용
----
    python data/official_stations.py            # 요약
    python data/official_stations.py --selftest # 자체 점검
"""
import csv
import glob
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent
GOV = ROOT / "_gov"

# 공식 파일의 '선명' → 우리 노선 id
LINE_OF = {
    "1호선": "seoul-metropolitan-subway-line-1",
    "2호선": "seoul-subway-line-2",
    "3호선": "seoul-metro-line-3",
    "4호선": "seoul-metropolitan-subway-line-4",
    "5호선": "seoul-subway-line-5",
    "6호선": "seoul-subway-line-6",
    "7호선": "seoul-subway-line-7",
    "8호선": "seoul-subway-line-8",
    "9호선": "seoul-subway-line-9",
    "수인분당": "suin-bundang-line",
    "신분당선": "seoul-metropolitan-subway-shinbundang-line",
    "인천1호선": "incheon-subway-line-1",
    "인천2호선": "incheon-subway-line-2",
    "동해": "donghae-line",
    "용인에버라인": "yongin-light-rail-transit",
    "의정부": "uijeongbu-lrt",
    "공항철도": "arex",
    "우이신설": "ui-sinseol-line",
    "자기부상": "incheon-airport-maglev-line-eastbound",
}

# 역명 표기가 우리와 다른 것만. 나머지는 이름이 같다.
STATION_ALIAS = {
    "서울역": "서울역",
    "인천공항1터미널": "인천공항1터미널",
}

_COLS = ("철도운영기관명", "철도운영기관", "선명", "역명", "경도", "위도")


def _pick(row, *names):
    for n in names:
        v = (row.get(n) or "").strip()
        if v:
            return v
    return ""


def load():
    """→ {우리 노선 id: {역명: {lon, lat, operator}}}"""
    out = {}
    for path in sorted(glob.glob(str(GOV / "*역위치*.csv"))):
        with open(path, encoding="utf-8-sig", newline="") as f:
            for row in csv.DictReader(f):
                line = _pick(row, "선명")
                name = _pick(row, "역명")
                lid = LINE_OF.get(line)
                if not lid or not name:
                    continue
                try:
                    lon = float(_pick(row, "경도"))
                    lat = float(_pick(row, "위도"))
                except ValueError:
                    continue
                out.setdefault(lid, {})[name] = {
                    "lon": lon,
                    "lat": lat,
                    "operator": _pick(row, "철도운영기관명", "철도운영기관"),
                }
    return out


def selftest():
    ok = bad = 0

    def check(name, cond):
        nonlocal ok, bad
        if cond:
            ok += 1
        else:
            bad += 1
            print(f"  ✗ {name}")

    check("선명 표가 19개", len(LINE_OF) == 19)
    check("선명이 모두 우리 노선 id", all(v and isinstance(v, str) for v in LINE_OF.values()))
    check("노선 id 중복 없음", len(set(LINE_OF.values())) == len(LINE_OF))

    data = load()
    check("파일에서 읽힌 노선이 10개 이상", len(data) >= 10)
    check("1호선 역이 90개 이상", len(data.get("seoul-metropolitan-subway-line-1", {})) >= 90)
    check("2호선 역이 40개 이상", len(data.get("seoul-subway-line-2", {})) >= 40)

    # 좌표가 한반도 범위 안인지
    for lid, st in data.items():
        for nm, v in st.items():
            if not (124.0 < v["lon"] < 132.0 and 33.0 < v["lat"] < 39.5):
                check(f"{lid} {nm} 좌표 범위", False)
                break
    check("모든 좌표가 한반도 범위", True)

    # 중복 제거 확인 — 같은 (선명, 역명) 이 두 번 들어가지 않는다
    for lid, st in data.items():
        names = list(st)
        check(f"{lid} 역명 중복 없음", len(names) == len(set(names)))

    # 운영기관이 채워져 있는지
    n_ops = sum(1 for st in data.values() for v in st.values() if v["operator"])
    n_all = sum(len(st) for st in data.values())
    check("운영기관이 90% 이상 채워짐", n_ops >= n_all * 0.9)

    print(f"공식 역위치: {len(data)}개 노선 / {n_all}행")
    print(f"  {'통과' if not bad else '실패'} {ok} / 실패 {bad}")
    return bad == 0


def main():
    if "--selftest" in sys.argv:
        sys.exit(0 if selftest() else 1)
    data = load()
    total = 0
    for lid, st in sorted(data.items(), key=lambda kv: -len(kv[1])):
        total += len(st)
        ops = {v["operator"] for v in st.values()}
        print(f"{lid:46s} {len(st):3d}역  운영기관 {', '.join(sorted(ops))}")
    print(f"합계 {len(data)}개 노선 / {total}행")


if __name__ == "__main__":
    main()
