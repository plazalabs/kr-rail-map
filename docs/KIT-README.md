# 한국철도맵 검수·작업 키트

2026-11-16 외부 검수 결과와 앞으로의 작업 방식을 Claude Code 에서 바로 쓸 수 있게 묶은 것이다.

## 들어 있는 것

```
CLAUDE.md                         ← Claude Code 가 항상 따르는 규칙 (가장 중요)
CHANGELOG.md                      ← 변경 기록 (코드에 날짜 주석 대신)
package.example.json              ← 테스트 스크립트 (기존 package.json 에 합치기)
playwright.config.mjs             ← 화면 테스트 설정
.claude/
  settings.json                   ← Stop 훅 + 테스트 파일 수정 금지
  hooks/stop-check.mjs            ← 끝내기 전에 데이터 테스트 실행
  agents/data-auditor.md          ← 검수 전담 서브에이전트
  commands/audit.md               ← /audit
  commands/fix-bug.md             ← /fix-bug <버그>
  commands/triage.md              ← /triage <피드백 파일>
tests/
  data/invariants.test.mjs        ← 데이터 불변식 19개 (실제 데이터로 실행 확인: 통과 6 / 실패 13)
  e2e/invariants.spec.mjs         ← 화면 불변식 22개 (초안, 아직 미실행)
docs/
  AUDIT-01-checklist.md           ← 1차 검수 보고서 (체크리스트, 43점)
  AUDIT-02-open.md                ← 2차 검수 보고서 (열린 검수)
  WORKFLOW.md                     ← 작업 방식 + 데이터에서 찾은 실제 원인 + 4주 순서
  INVARIANTS.md                   ← 불변식 목록과 현재 상태표
  PRODUCT.md                      ← 한 쪽짜리 범위 문서 (초안, 직접 고칠 것)
  FEEDBACK-TRIAGE.md              ← 피드백 분류 템플릿
  img/                            ← 보고서 스크린샷
```

## 설치 (저장소 루트에서)

1. 이 폴더 안의 내용을 저장소 루트에 복사한다. 이미 `CLAUDE.md` 가 있으면 내용을 합친다.
2. `package.example.json` 의 `scripts`, `devDependencies` 를 기존 `package.json` 에 합친다. (없으면 이름을 `package.json` 으로)
3. 설치:
   ```bash
   npm i -D @playwright/test http-server cross-env
   npx playwright install chromium
   ```
4. 데이터 테스트 실행 → 실패 13개가 나오면 정상:
   ```bash
   node --test tests/data/
   ```
5. 현재 실패를 기준선으로 저장 (이후 늘어나면 Stop 훅이 막는다):
   ```bash
   node .claude/hooks/stop-check.mjs --update-baseline
   ```
6. 화면 테스트 (로컬 서버 자동 실행):
   ```bash
   npx playwright test
   # 배포본 대상:  BASE_URL=https://plazalabs.github.io/kr-rail-map/ npx playwright test
   ```
   e2e 는 검수 때 본 화면 구조로 쓴 초안이다. 처음엔 "선택자를 못 찾음" 실패가 섞여 나올 수 있다. 그건 테스트를 고칠 일이고, "값이 다름" 실패만 앱 버그다.

## Claude Code 에서 첫 대화

```
CLAUDE.md 와 docs/WORKFLOW.md 를 읽고, docs/INVARIANTS.md 의 실패 목록을 확인해.
오늘은 1주차 1번(법정동 매칭)만 한다. Plan mode 로 계획부터 보여줘.
```

이후 반복:
- 버그 하나: `/fix-bug D-32 신사역 은평구 매칭`
- 검수: `/audit`
- 다른 AI 피드백을 받았을 때: `feedback/날짜.md` 로 저장 → `/triage feedback/날짜.md`

## 검증 상태 (솔직하게)
| 파일 | 상태 |
|---|---|
| `tests/data/invariants.test.mjs` | 2026-11-16 배포본 데이터로 **실제 실행함**. 통과 6 / 실패 13 (검수 내용과 일치) |
| `.claude/hooks/stop-check.mjs` | 문법 확인, 실제 테스트 출력으로 실패 ID 추출·기준선 비교 로직 확인. Claude Code 안에서 훅으로 돌려 보진 못함 |
| `tests/e2e/invariants.spec.mjs` | 문법 확인만. 검수 때 본 DOM(id·버튼 이름) 기준 초안이고 **아직 실행 안 함** |
| `.claude/settings.json` | JSON 문법 확인. Claude Code 설정 형식(hooks.Stop, permissions.deny) 기준 |

## 주의
- `.claude/settings.json` 은 Claude 가 불변식 테스트 파일과 기준선 파일을 **고칠 수 없게** 막아 둔다. 테스트를 바꿔야 하면 사람이 직접 고치거나 deny 줄을 잠시 지운다.
- Stop 훅은 `node` 로 실행된다. Windows·macOS·Linux 모두 동작하도록 쉘 명령 대신 Node 스크립트로 썼다.
- 데이터 테스트는 `KR_RAIL_ROOT` 환경변수로 다른 경로의 데이터도 검사할 수 있다.
