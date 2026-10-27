"""역의 법정동과 실거래가의 법정동을 맞춘다.

두 자료의 표기가 다르다. 같은 곳을 가리키는데 글자가 다르다.

  역 주소데이터   '부발읍'            (읍까지만 적힌 경우가 있다)
  실거래가        '부발읍 아리미'

  역 주소데이터   '매송면 어천리'
  실거래가        '매송면 어천리'      (같다)

  역 주소데이터   '안양동'
  실거래가        '안양동'            (같다)

그래서 정확히 맞는 것을 먼저 찾고, 없으면 범위를 넓힌다.
넓히는 순서: 읍/면 단위 → 리 이름만 → 포기.

넓힐 때 조심할 것: 리 이름만으로 맞추면 '중리'처럼 한 시군구에 여러 번
나오는 이름이 엉뚱한 동네에 붙는다. 그래서 리 이름으로 맞출 때는 그
시군구 안에서 유일할 때만 쓴다.
"""
import re

# '안양6동' → '안양동'. 행정동 이름에 숫자가 붙은 것을 법정동으로 되돌린다.
_HADMIN = re.compile(r"\d+(?=동$)")


def canon(dong):
    """행정동 이름을 법정동 이름으로. '안양6동' → '안양동'."""
    return _HADMIN.sub("", str(dong or "").strip())


def stations_in(code, umd, by_dong, _short=None):
    """(시군구코드, 실거래가 법정동) → 그 법정동에 있는 역 이름 집합.

    by_dong 은 {(코드, 법정동): {역 이름}} 이다.
    """
    if not umd:
        return set()
    hit = by_dong.get((code, umd))
    if hit:
        return hit

    parts = umd.split()
    # 읍/면까지만 적힌 역 ('부발읍') → 그 읍/면 전체를 쓴다
    for i in range(len(parts) - 1, 0, -1):
        hit = by_dong.get((code, " ".join(parts[:i])))
        if hit:
            return hit

    # 리 이름만 적힌 역 → 같은 시군구에서 유일할 때만
    if len(parts) > 1:
        last = parts[-1]
        same = [v for (c, d), v in by_dong.items()
                if c == code and d.split()[-1] == last]
        if len(same) == 1:
            return same[0]
    return set()


def selftest():
    by_dong = {
        ("41500", "부발읍"): {"부발"},
        ("41500", "부발읍 아리미"): {"부발"},
        ("41500", "부발읍 신원리"): {"부발"},
        ("41591", "매송면 어천리"): {"어천"},
        ("41171", "안양동"): {"명학"},
        ("41591", "중리"): {"A"},
        ("41591", "남양읍 중리"): {"B"},
    }
    cases = [
        (("41500", "부발읍 아리미"), {"부발"}),   # 읍까지 적힌 역 → 읍 전체
        (("41591", "매송면 어천리"), {"어천"}),   # 정확히 맞음
        (("41171", "안양동"), {"명학"}),
        (("41591", "없는리"), set()),            # 포기
    ]
    bad = 0
    for (code, umd), want in cases:
        got = stations_in(code, umd, by_dong)
        ok = got == want
        bad += 0 if ok else 1
        print(("  ✓ " if ok else "  ✗ ") + "%s/%s → %s" % (code, umd, sorted(got)))
    # '중리' 가 둘이면 어느 쪽도 붙이지 않아야 한다
    got = stations_in("41591", "다른읍 중리", by_dong)
    ok = got == set()
    bad += 0 if ok else 1
    print(("  ✓ " if ok else "  ✗ ") + "동명 리가 겹치면 붙이지 않는다 → %s" % sorted(got))
    # 행정동 이름 정리
    ok = canon("안양6동") == "안양동" and canon("종로1가") == "종로1가"
    bad += 0 if ok else 1
    print(("  ✓ " if ok else "  ✗ ") + "행정동 → 법정동 이름")
    print("\n%s — %d개 실패" % ("통과" if not bad else "실패", bad))
    return 1 if bad else 0


if __name__ == "__main__":
    raise SystemExit(selftest())
