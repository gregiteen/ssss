import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const root = fileURLToPath(new URL('../', import.meta.url));
function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'pm-fixture-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const project = join(dir, 'docs/projects/in-progress/EXAMPLE');
  mkdirSync(project, { recursive: true });
  return { dir, project };
}
function run(dir, name, args = [], input) {
  return spawnSync(process.execPath, [join(root, 'scripts', name), ...args], { cwd: dir, encoding: 'utf8', input, timeout: 5000 });
}
function populate(project, checkbox = '[x]', verified = true) {
  for (const kind of ['PRD', 'ARCHITECTURE', 'DEVELOPMENT_PLAN']) writeFileSync(join(project, `EXAMPLE_${kind}.md`), `# ${kind}\n`);
  writeFileSync(join(project, 'EXAMPLE_AUDIT.md'), '**Audit Status**: Complete\n');
  writeFileSync(join(project, 'EXAMPLE_PROJECT_TRACKER.md'), `# Tracker\n- ${checkbox} Task\n${verified ? 'Readiness Status: Verified\nReadiness Evidence: fixture verification log\n' : ''}\n## Action Log\nFixture action\n`);
}
test('in-progress task blocks archival even with declarations', t => {
  const { dir, project } = fixture(t); populate(project, '[/]');
  const result = run(dir, 'triage-projects.mjs', ['--json']); assert.equal(result.status, 0);
  const state = JSON.parse(result.stdout); assert.equal(state.completed.length, 0); assert.equal(state.active[0].unchecked, 1);
});
test('checked boxes without readiness evidence remain active', t => {
  const { dir, project } = fixture(t); populate(project, '[x]', false);
  const result = run(dir, 'triage-projects.mjs', ['--json']); assert.equal(result.status, 0); assert.equal(JSON.parse(result.stdout).completed.length, 0);
});
test('candidate classification requires final Action Log and all documents', t => {
  const { dir, project } = fixture(t); populate(project);
  let result = run(dir, 'triage-projects.mjs', ['--json']); assert.equal(JSON.parse(result.stdout).completed.length, 1);
  writeFileSync(join(project, 'EXAMPLE_PROJECT_TRACKER.md'), '# Tracker\n- [x] Task\nReadiness Status: Verified\nReadiness Evidence: log\n## Action Log\nrow\n## Later section\n');
  result = run(dir, 'triage-projects.mjs', ['--json']); assert.equal(JSON.parse(result.stdout).completed.length, 0);
});
test('move does not archive unfinished work even with YES input', t => {
  const { dir, project } = fixture(t); populate(project, '[/]');
  const result = run(dir, 'triage-projects.mjs', ['--move'], 'YES\n'); assert.equal(result.status, 0); assert.ok(existsSync(project)); assert.equal(existsSync(join(dir, 'docs/projects/completed/EXAMPLE')), false);
});
test('local hook fails missing audit instead of echoing success', t => {
  const { dir, project } = fixture(t); writeFileSync(join(project, 'EXAMPLE_PRD.md'), '# PRD\n');
  const result = spawnSync('bash', [join(root, 'hooks/on-issue-update.sh'), 'docs/projects'], { cwd: dir, encoding: 'utf8', timeout: 5000 });
  assert.equal(result.status, 1); assert.match(result.stdout, /no AUDIT document/); assert.doesNotMatch(result.stdout, /checks passed/);
});
test('next task includes in-progress work', t => {
  const { dir, project } = fixture(t); populate(project, '[/]');
  const result = run(dir, 'next-task.mjs', ['--json']); assert.equal(result.status, 0); assert.equal(JSON.parse(result.stdout)[0].nextTask, 'Task');
});
test('required missing template is a failure and scope stays local', t => {
  const { dir } = fixture(t); const result = run(dir, 'verify-issues.mjs', ['missing-template.md']);
  assert.equal(result.status, 1); assert.match(result.stderr, /Missing explicitly required local template/); assert.match(result.stdout, /local file presence only/);
});
