"""매달 자동 갱신(.github/workflows/data-refresh.yml)의 문지기 — 덜 받은 채로 올리지 않는다.

  python data/check_refresh.py fetched   # 받은 달 파일이 빠짐없이 있나 (한도 초과·실패로 빠지면 1)
  python data/check_refresh.py built     # 새로 만든 시세 파일이 직전 커밋보다 크게 줄지 않았나

하루 호출 한도에 걸리면 fetch_rtms.py 는 그 종류를 건너뛰고 계속 간다(사람이 다음 날 이어 받는 용도).
자동 갱신에서는 그대로 만들면 일부 역 시세가 통째로 빠진 파일이 올라간다 → 여기서 멈춘다.
"""
import json
import pathlib
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "data"))
import lawd as LAWD  # noqa: E402
import rtms_period  # noqa: E402
from fetch_rtms import NEW7, months  # noqa: E402

RTMS = ROOT / "data" / "_rtms"


def fetched():
    codes = LAWD.codes()
    a6, b = rtms_period.period()
    need = [("apt-trade", RTMS, rtms_period.FIRST_TREND)] + [(k, RTMS / k, a6) for k in NEW7]
    bad = 0
    for kind, d, a in need:
        miss = [f"{c}_{ym}" for c in codes for ym in months(a, b) if not (d / f"{c}_{ym}.json").exists()]
        print(f"{kind}: {a}~{b} 시군구 {len(codes)} · 빠짐 {len(miss)}" + (f" 예) {miss[:3]}" if miss else ""))
        bad += len(miss)
    return 1 if bad else 0


# 파일 → (역 수를 세는 법). 직전 커밋 대비 이만큼 넘게 줄면 멈춘다.
DROP = 0.10
FILES = {
    "station-price.json": lambda d: sum(1 for x in d["districts"] if x.get("stations")),
    "station-complex.json": lambda d: len(d.get("stations") or d.get("complexes") or {}),
    "station-market.json": lambda d: sum(len(v) for v in d["stations"].values()),
    "station-jeonse.json": lambda d: len(d["stations"]),
    "station-trend.json": lambda d: len(d.get("stations") or d.get("dongs") or d.get("districts") or {}),
}


def built():
    bad = 0
    for name, count in FILES.items():
        p = ROOT / "data" / name
        old_raw = subprocess.run(["git", "show", f"HEAD:data/{name}"], capture_output=True, cwd=ROOT).stdout
        new = json.loads(p.read_text("utf8"))
        try:
            n_old, n_new = count(json.loads(old_raw.decode("utf8"))), count(new)
        except (KeyError, TypeError, ValueError) as e:
            print(f"{name}: 셀 수 없음 {type(e).__name__} {e}")
            bad += 1
            continue
        ok = n_old == 0 or n_new >= n_old * (1 - DROP)
        print(f"{name}: {n_old} → {n_new}" + ("" if ok else f"  ✗ {int(DROP * 100)}% 넘게 줄었다"))
        bad += 0 if ok else 1
    return 1 if bad else 0


if __name__ == "__main__":
    what = sys.argv[1] if len(sys.argv) > 1 else ""
    if what == "fetched":
        sys.exit(fetched())
    if what == "built":
        sys.exit(built())
    sys.exit("사용: check_refresh.py fetched | built")
