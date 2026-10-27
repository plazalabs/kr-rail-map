"""data/sources.json → data.html 의 출처 표를 만든다.

왜 이렇게 하나:
  출처 표를 손으로 관리하면 반드시 실제와 어긋난다. 원천을 하나 바꿨는데
  표에는 옛 원천이 남아 있는 식이다. 라이선스는 돈이 걸린 문제라서,
  한 곳(data/sources.json)만 고치고 표는 자동으로 따라오게 한다.

  sources.json 은 기계가 읽는 형식이라, 나중에 다른 프로그램이 "이 좌표
  쓸 수 있나?" 를 물어볼 수도 있다.

사용
  python data/build_sources.py            # data.html 다시 쓰기
  python data/build_sources.py --check    # 어긋나면 종료코드 1 (테스트용)
"""
import argparse
import html
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "data" / "sources.json"
PAGE = ROOT / "data.html"

BEGIN = "<!-- sources:begin · data/build_sources.py 가 만든다. 손으로 고치지 말 것 -->"
END = "<!-- sources:end -->"

COMMERCIAL_LABEL = {
    "allowed": ("가능", "ok"),
    "conditional": ("조건부", "cond"),
    "unverified": ("미확인", "unv"),
}


def esc(s):
    return html.escape(str(s or ""), quote=True)


def rel(path):
    """저장소 기준 경로를 data.html 에서 쓸 상대경로로."""
    return str(path).lstrip("./")


def render(data):
    licences = data["licences"]
    rows = []
    for s in data["sources"]:
        lic = licences[s["licence"]]
        label, cls = COMMERCIAL_LABEL.get(s["commercial"], ("미확인", "unv"))
        prov = esc(s["provider"])
        if s.get("url"):
            prov = '<a href="%s" rel="noopener">%s</a>' % (esc(s["url"]), prov)
        lic_txt = esc(lic["name"])
        rows.append(
            '<tr data-src="%s">\n'
            "<td>%s</td>\n<td>%s</td>\n<td>%s</td>\n"
            '<td><span class="badge %s">%s</span></td>\n</tr>'
            % (esc(s["id"]), esc(s["title"]), prov, lic_txt, cls, label)
        )

    # 표시 의무가 있는 출처의 문구를 한 곳에 모은다. 이걸 화면 어딘가에
    # 그대로 띄워야 ODbL 출처 표시 의무를 지킨 것이 된다.
    credits = [
        (s["attribution"], s.get("url") or "")
        for s in data["sources"]
        if s.get("attribution") and licences[s["licence"]].get("attribution_required")
    ]
    credit_items = "\n".join(
        '<li>%s%s</li>' % (esc(t), ' — <a href="%s" rel="noopener">원문</a>' % esc(u) if u else "")
        for t, u in credits
    )

    allowed = [s for s in data["sources"] if s["commercial"] == "allowed"]
    unverified = [s for s in data["sources"] if s["commercial"] == "unverified"]
    cond = [s for s in data["sources"] if s["commercial"] == "conditional"]

    return "\n".join([
        BEGIN,
        '<table class="tbl">',
        "<thead><tr><th>항목</th><th>출처</th><th>라이선스</th><th>상업적 이용</th></tr></thead>",
        "<tbody>",
        "\n".join(rows),
        "</tbody>",
        "</table>",
        '<p class="note">이 표는 <a href="data/sources.json"><code>data/sources.json</code></a> '
        "에서 자동으로 만듭니다. 기계가 읽는 형식이 필요하면 그 파일을 쓰세요. "
        "손으로 고치면 테스트가 실패합니다.</p>",
        "",
        "<h3>표시해야 하는 출처 문구</h3>",
        '<ul class="plain">',
        credit_items,
        "</ul>",
        "",
        "<h3>상업적 이용 — 지금 상태</h3>",
        '<ul class="plain">',
        "<li><b>바로 쓸 수 있음 (%d개)</b> — %s</li>"
        % (len(allowed), ", ".join(esc(s["title"]) for s in allowed)),
        "<li><b>조건 확인 필요 (%d개)</b> — %s</li>"
        % (len(cond), ", ".join(esc(s["title"]) for s in cond) or "없음"),
        "<li><b>아직 미확인 (%d개)</b> — %s</li>"
        % (len(unverified), ", ".join(esc(s["title"]) for s in unverified) or "없음"),
        "</ul>",
        END,
    ])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="data.html 이 최신인지만 확인")
    args = ap.parse_args()

    data = json.loads(SRC.read_text("utf8"))
    block = render(data)
    page = PAGE.read_text("utf8")

    i = page.find(BEGIN)
    j = page.find(END)
    if i < 0 or j < 0:
        print("data.html 에 표시 구간이 없다: %s" % BEGIN)
        return 1
    new_page = page[:i] + block + page[j + len(END):]

    if args.check:
        if new_page == page:
            print("출처 표 최신 — %d개 원천" % len(data["sources"]))
            return 0
        print("출처 표가 sources.json 과 어긋난다. python data/build_sources.py 를 돌려라.")
        return 1

    if new_page != page:
        PAGE.write_text(new_page, "utf8")
        print("data.html 갱신 — %d개 원천" % len(data["sources"]))
    else:
        print("변경 없음 — %d개 원천" % len(data["sources"]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
