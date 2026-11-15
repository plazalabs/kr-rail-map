"""실거래가 집계 기간 — 한 곳에서 정한다 (2026-11-15, 매달 자동 갱신용).

실거래 신고는 계약일로부터 30일 안이라, M월 거래는 M+1월 말에야 다 모인다.
그래서 '오늘' 기준 다 모인 마지막 달은 늘 두 달 전이다.
  11-15 → 9월 (10월 거래는 11-30 마감) · 12-01 → 10월
시세·단지·실거래 7종·전세가율은 그 달까지 최근 6개월, 가격 흐름은 2023-01 부터 그 달까지.
환경변수 RTMS_LAST=YYYYMM 로 마지막 달을 고정할 수 있다(되돌려 다시 만들 때).
"""
import datetime
import os

FIRST_TREND = "202301"


def _shift(ym, k):
    y, m = int(ym[:4]), int(ym[4:])
    t = y * 12 + (m - 1) + k
    return f"{t // 12:04d}{t % 12 + 1:02d}"


def last_closed(today=None):
    env = os.environ.get("RTMS_LAST", "").strip()
    if env:
        if not (len(env) == 6 and env.isdigit()):
            raise SystemExit("RTMS_LAST 는 YYYYMM 여섯 자리: " + env)
        return env
    d = today or datetime.date.today()
    return _shift(f"{d.year:04d}{d.month:02d}", -2)


def period(months=6, today=None):
    """(시작, 끝) — 끝 달 포함 months 개월."""
    b = last_closed(today)
    return (_shift(b, -(months - 1)), b)


if __name__ == "__main__":
    import sys
    if sys.argv[1:] == ["--selftest"]:
        D = datetime.date
        os.environ.pop("RTMS_LAST", None)
        assert last_closed(D(2026, 11, 15)) == "202609"
        assert last_closed(D(2026, 12, 1)) == "202610"
        assert last_closed(D(2027, 1, 2)) == "202611"
        assert last_closed(D(2027, 2, 28)) == "202612"
        assert period(6, D(2026, 11, 15)) == ("202604", "202609")
        assert period(6, D(2027, 2, 1)) == ("202607", "202612")
        print("rtms_period selftest ok")
    else:
        a, b = period()
        print(a, b, FIRST_TREND)
