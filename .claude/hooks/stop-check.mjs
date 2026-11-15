// Claude Code Stop 훅: Claude 가 "끝났다"고 멈추기 직전에 데이터 불변식 테스트를 돌린다.
// - 기준선(.claude/baseline-failures.txt)보다 실패가 늘면 exit 2 → Claude 가 멈추지 못하고 실패 내용을 받아 다시 고친다.
// - 무한 루프 방지: 입력의 stop_hook_active 가 true 면(이미 훅 때문에 한 번 더 도는 중) 통과시킨다.
// - 기준선 갱신: 실패를 고쳐서 줄였다면 `node .claude/hooks/stop-check.mjs --update-baseline` 을 사람이 직접 실행.
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

// Claude Code 는 훅에 CLAUDE_PROJECT_DIR(프로젝트 루트)를 넘겨 준다. 어느 폴더에서 불려도 루트 기준으로 돈다.
if (process.env.CLAUDE_PROJECT_DIR) process.chdir(process.env.CLAUDE_PROJECT_DIR);
const BASELINE = '.claude/baseline-failures.txt';

function readStdin() {
  try { return JSON.parse(readFileSync(0, 'utf8') || '{}'); } catch { return {}; }
}

function runDataTests() {
  try {
    const out = execSync('node --test --test-reporter=spec "tests/data/*.test.mjs"', {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 100_000,
      env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
    });
    return { out, failed: [] };
  } catch (e) {
    const out = (e.stdout || '') + (e.stderr || '');
    const failed = [...out.replace(/\x1b\[[0-9;]*m/g, '').matchAll(/^\s*✖ (\[D-\d+\])/gm)].map(m => m[1]);  // 기준선은 ID(예: [D-31])로 비교
    if (!failed.length && e.status) failed.push(`[실행 오류] node --test 종료 코드 ${e.status}`);
    return { out, failed: [...new Set(failed)] };
  }
}

const update = process.argv.includes('--update-baseline');
const input = update ? {} : readStdin();
if (input.stop_hook_active) process.exit(0);

const { out, failed } = runDataTests();

if (update) {
  writeFileSync(BASELINE, failed.join('\n') + (failed.length ? '\n' : ''));
  console.log(`기준선 갱신: 실패 ${failed.length}개`);
  process.exit(0);
}

const baseline = existsSync(BASELINE) ? readFileSync(BASELINE, 'utf8').split('\n').map(s => s.trim()).filter(Boolean) : [];
const newFails = failed.filter(f => !baseline.includes(f));

if (newFails.length) {
  const tail = out.split('\n').filter(l => !/^\s+at /.test(l)).slice(-80).join('\n');
  process.stderr.write(
    `데이터 불변식이 새로 깨졌습니다. 완료로 보고하지 말고 먼저 고치세요.\n` +
    `새로 실패한 테스트:\n- ${newFails.join('\n- ')}\n\n--- 테스트 출력(끝부분) ---\n${tail}\n`
  );
  process.exit(2);
}
process.exit(0);
