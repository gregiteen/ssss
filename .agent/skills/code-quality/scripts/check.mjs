#!/usr/bin/env node
/**
 * code-quality / check.mjs — ONE-SHOT quality check.
 *
 * Runs the repo's real typecheck/lint commands exactly once, writes a report,
 * and exits. There is no loop, no PID daemon, and nothing that respawns itself.
 *
 * Designed to be launched as a BACKGROUND job by the agent harness:
 *   Bash(command: "node .agent/skills/code-quality/scripts/check.mjs",
 *        run_in_background: true)
 *
 * Why one-shot: a detached forever-loop has no causal relationship to the edit
 * you just made, so its report can only answer "what was true at some point".
 * A run you launched after your edit answers "what is true now". See
 * references/architecture.md.
 *
 * Invariants:
 *   - Locking is FAIL-CLOSED. If liveness cannot be verified, the lock is
 *     honored and we refuse to start. Refusing is recoverable; two writers
 *     competing over one report file are not.
 *   - Checks run strictly sequentially, one child process at a time.
 *   - Every child is killed on exit, including on SIGINT/SIGTERM.
 */

import { spawn, execFileSync } from 'node:child_process';
import {
  readFileSync, writeFileSync, openSync, writeSync, closeSync,
  unlinkSync, existsSync, mkdirSync, statSync
} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SKILL_DIR = path.resolve(__dirname, '..');
const ENTRY_TAIL = path.join('code-quality', 'scripts', 'check.mjs');

const argv = process.argv.slice(2);
const hasFlag = (f) => argv.includes(f);
const flagValue = (f) => {
  const i = argv.indexOf(f);
  return i >= 0 ? argv[i + 1] : undefined;
};

const STEAL_LOCK = hasFlag('--steal-lock');
const NO_GLOBAL_LOCK = hasFlag('--no-global-lock');
const ONLY = flagValue('--only');
const TIER = flagValue('--tier') || 'fast';

// Tiers keep the default run laptop-safe. `fast` is typecheck/lint/grep/registry
// validation. `full` adds conformance suites and test runs — heavy enough that
// they belong on the Mac Mini or droplet, not an 8GB laptop.
const TIER_ORDER = { fast: 1, full: 2, remote: 3 };

// ─── Config ───────────────────────────────────────────────────────────────────

const CONFIG_PATH = path.join(SKILL_DIR, 'config.json');

function loadConfig() {
  if (!existsSync(CONFIG_PATH)) {
    fail(
      `No config.json at ${CONFIG_PATH}\n` +
      `Run:  node ${path.relative(process.cwd(), path.join(__dirname, 'detect.mjs'))}`
    );
  }
  let cfg;
  try {
    cfg = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
  } catch (err) {
    fail(`config.json is not valid JSON: ${err.message}`);
  }
  if (!Array.isArray(cfg.checks) || cfg.checks.length === 0) {
    fail('config.json defines no checks. Re-run detect.mjs.');
  }
  // Validate up front so a malformed check fails loudly at startup rather than
  // halfway through a run that has already burned minutes of compile time.
  const problems = [];
  const seen = new Set();
  cfg.checks.forEach((c, i) => {
    const where = `checks[${i}]${c.id ? ` (${c.id})` : ''}`;
    if (!c.id) problems.push(`${where}: missing "id"`);
    else if (seen.has(c.id)) problems.push(`${where}: duplicate id`);
    else seen.add(c.id);
    if (c.kind === 'grep-forbid') {
      if (!Array.isArray(c.patterns) || c.patterns.length === 0) problems.push(`${where}: grep-forbid needs a non-empty "patterns" array`);
      else c.patterns.forEach((p, j) => {
        if (!p.pattern) problems.push(`${where}.patterns[${j}]: missing "pattern"`);
        else if (/^\(\?[a-z]+\)/.test(p.pattern)) {
          problems.push(`${where}.patterns[${j}]: JS RegExp has no inline (?i) flags — use "flags": "i" instead`);
        } else {
          try { new RegExp(p.pattern, p.flags || ''); }
          catch (e) { problems.push(`${where}.patterns[${j}]: invalid regex — ${e.message}`); }
        }
      });
    } else if (!Array.isArray(c.cmd) || c.cmd.length === 0) {
      problems.push(`${where}: needs "cmd" (array) or kind:"grep-forbid"`);
    }
    if (c.tier && !['fast', 'full', 'remote'].includes(c.tier)) problems.push(`${where}: unknown tier "${c.tier}"`);
  });
  if (problems.length) fail(`config.json is invalid:\n   - ${problems.join('\n   - ')}`);
  return cfg;
}

function fail(msg, code = 1) {
  console.error(`❌ [code-quality] ${msg}`);
  process.exit(code);
}

const config = loadConfig();
const REPO_ROOT = path.resolve(
  flagValue('--repo') || config.repoRoot || path.resolve(SKILL_DIR, '../../..')
);
const REPORT_DIR = path.join(SKILL_DIR, 'reports');
const REPORT_JSON = path.join(REPORT_DIR, 'latest.json');
const REPORT_TXT = path.join(REPORT_DIR, 'latest.txt');
const LOCK_PATH = path.join(SKILL_DIR, '.check.lock');
const GLOBAL_LOCK_PATH = path.join(os.homedir(), '.agent', 'skills', 'code-quality', '.global-check.lock');
const STALE_AFTER_MS = (config.lock?.staleAfterMinutes ?? 45) * 60_000;

// ─── Locking (fail-closed) ────────────────────────────────────────────────────

/**
 * A lock is honored only when the recorded PID is alive AND its command line
 * still looks like this program. If the command line cannot be read at all,
 * we honor the lock rather than assuming it is stale — the opposite of the
 * v2 daemon, whose `ps` scan failed with EPERM on every run and started anyway.
 */
function holderState(meta) {
  if (!meta || typeof meta.pid !== 'number') return 'unverifiable';
  try {
    process.kill(meta.pid, 0);
  } catch (err) {
    if (err.code === 'ESRCH') return 'dead';
    if (err.code === 'EPERM') return 'alive-foreign'; // exists, owned by someone else
    return 'unverifiable';
  }
  let cmdline;
  try {
    cmdline = execFileSync('ps', ['-p', String(meta.pid), '-o', 'command='], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000
    });
  } catch {
    return 'unverifiable'; // <- fail CLOSED
  }
  return cmdline.includes(meta.entryTail ?? ENTRY_TAIL) ? 'alive' : 'recycled';
}

function acquireLock(lockPath, label) {
  mkdirSync(path.dirname(lockPath), { recursive: true });
  const meta = {
    pid: process.pid,
    entryTail: ENTRY_TAIL,
    skillDir: SKILL_DIR,
    repoRoot: REPO_ROOT,
    startedAt: new Date().toISOString(),
    host: os.hostname()
  };
  const payload = JSON.stringify(meta, null, 2);

  const tryCreate = () => {
    const fd = openSync(lockPath, 'wx');       // O_CREAT|O_EXCL — atomic
    writeSync(fd, payload);
    closeSync(fd);
  };

  try {
    tryCreate();
    return meta;
  } catch (err) {
    if (err.code !== 'EEXIST') throw err;
  }

  let held = null;
  try {
    held = JSON.parse(readFileSync(lockPath, 'utf8'));
  } catch {
    held = null;
  }

  const state = holderState(held);
  const ageMs = held?.startedAt ? Date.now() - Date.parse(held.startedAt) : Infinity;
  const expired = Number.isFinite(ageMs) && ageMs > STALE_AFTER_MS;

  if (STEAL_LOCK) {
    console.error(`⚠️  [code-quality] --steal-lock: taking ${label} lock from pid ${held?.pid ?? '?'} (state=${state}).`);
  } else if (state === 'dead' || state === 'recycled') {
    console.error(`🧹 [code-quality] Clearing stale ${label} lock (pid ${held?.pid ?? '?'}, state=${state}).`);
  } else if (state === 'unverifiable' && expired) {
    console.error(`🧹 [code-quality] Clearing ${label} lock: unverifiable and older than ${STALE_AFTER_MS / 60000}min.`);
  } else {
    fail(
      `A check is already running (${label} lock, pid ${held?.pid ?? '?'}, state=${state}, ` +
      `started ${held?.startedAt ?? 'unknown'}).\n` +
      `   This is deliberate: only one check may run at a time.\n` +
      `   If you are certain it is dead:  node ${path.relative(process.cwd(), __filename)} --steal-lock`,
      3
    );
  }

  try { unlinkSync(lockPath); } catch { /* raced away */ }
  tryCreate();
  return meta;
}

const heldLocks = [];
function releaseLocks() {
  for (const lockPath of heldLocks.splice(0)) {
    try {
      const meta = JSON.parse(readFileSync(lockPath, 'utf8'));
      if (meta.pid !== process.pid) continue; // never delete someone else's lock
    } catch { /* unreadable — fall through and remove our own best guess */ }
    try { unlinkSync(lockPath); } catch { /* already gone */ }
  }
}

// ─── Child process lifecycle ──────────────────────────────────────────────────

let currentChild = null;
let shuttingDown = false;

function killCurrentChild(signal = 'SIGTERM') {
  if (!currentChild || currentChild.killed) return;
  try { process.kill(-currentChild.pid, signal); } catch { /* no group */ }
  try { currentChild.kill(signal); } catch { /* already gone */ }
}

function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  killCurrentChild('SIGTERM');
  setTimeout(() => killCurrentChild('SIGKILL'), 2000).unref();
  releaseLocks();
  process.exit(code);
}

process.on('exit', releaseLocks);
process.on('SIGINT', () => shutdown(130));
process.on('SIGTERM', () => shutdown(143));
process.on('uncaughtException', (err) => {
  console.error(`❌ [code-quality] ${err.stack || err.message}`);
  shutdown(1);
});

// ─── Parsers ──────────────────────────────────────────────────────────────────

const PARSERS = {
  tsc(line) {
    const m = line.match(/^(.+?)\((\d+),(\d+)\):\s+error\s+(TS\d+):\s+(.*)$/);
    return m && { file: m[1].trim(), line: +m[2], col: +m[3], code: m[4], message: m[5].trim() };
  },
  'eslint-stylish'(line, state) {
    const header = line.match(/^(\/.*\S)\s*$/);
    if (header && !line.includes(':')) { state.file = header[1]; return null; }
    if (/^\s*\//.test(line) && !/\d+:\d+/.test(line)) { state.file = line.trim(); return null; }
    const m = line.match(/^\s*(\d+):(\d+)\s+(error|warning)\s+(.*?)\s\s+([\w@/-]+)\s*$/);
    if (m && state.file) {
      return { file: state.file, line: +m[1], col: +m[2], code: m[5], message: m[4].trim(), severity: m[3] };
    }
    return null;
  },
  'eslint-compact'(line) {
    const m = line.match(/^(.+?):\s*line\s+(\d+),\s*col\s+(\d+),\s*(Error|Warning)\s*-\s*(.*?)(?:\s+\(([\w@/-]+)\))?$/i);
    return m && {
      file: m[1].trim(), line: +m[2], col: +m[3],
      code: m[6] || 'eslint', message: m[5].trim(), severity: m[4].toLowerCase()
    };
  },
  flake8(line) {
    const m = line.match(/^(.+?):(\d+):(\d+):\s+([A-Z]+\d+)\s+(.*)$/);
    return m && { file: m[1].trim(), line: +m[2], col: +m[3], code: m[4], message: m[5].trim() };
  },
  mypy(line) {
    const m = line.match(/^(.+?):(\d+):(?:(\d+):)?\s+error:\s+(.*?)(?:\s+\[([\w-]+)\])?$/);
    return m && {
      file: m[1].trim(), line: +m[2], col: m[3] ? +m[3] : 0,
      code: m[5] || 'mypy', message: m[4].trim()
    };
  },
  /**
   * Biome, via `--reporter=github`. Biome's default pretty output is a
   * multi-line box drawing that also truncates at --max-diagnostics, so a gate
   * parsing it would silently under-report. The github reporter is one
   * fully-structured line per diagnostic:
   *
   *   ::warning title=lint/style/useConst,file=a.ts,line=3,endLine=3,col=7,endColumn=9::Use const.
   *
   * Always pair it with --max-diagnostics=none.
   */
  biome(line) {
    const m = line.match(/^::(error|warning|notice)\s+(.+?)::(.*)$/);
    if (!m) return null;
    const attrs = {};
    for (const kv of m[2].split(',')) {
      const i = kv.indexOf('=');
      if (i > 0) attrs[kv.slice(0, i)] = kv.slice(i + 1);
    }
    return {
      file: attrs.file || '?',
      line: +(attrs.line || 0),
      col: +(attrs.col || 0),
      code: attrs.title || 'biome',
      message: m[3].trim(),
      severity: m[1] === 'notice' ? 'info' : m[1]
    };
  },
  generic(line) {
    const m = line.match(/^(.+?):(\d+):(?:(\d+):)?\s*(?:error|ERROR)[:\s]+(.*)$/);
    return m && { file: m[1].trim(), line: +m[2], col: m[3] ? +m[3] : 0, code: 'error', message: m[4].trim() };
  }
};

function parseOutput(text, parserName, checkId) {
  const parse = PARSERS[parserName] || PARSERS.generic;
  const state = {};
  const findings = [];
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\[[0-9;]*m/g, '').trimEnd();
    if (!line) continue;
    let hit;
    try { hit = parse(line, state); } catch { hit = null; }
    if (hit) findings.push({ ...hit, check: checkId, severity: hit.severity || 'error' });
  }
  return findings;
}

// ─── Source fingerprint (causality) ───────────────────────────────────────────

/**
 * The report records when the run STARTED. report.mjs compares that against the
 * mtime of every tracked source file; anything modified after the start is
 * flagged as not-yet-covered. This is what makes "is this report stale?" a
 * question with a real answer instead of a warning banner.
 */
/**
 * Tracked files, filtered to an extension set.
 *
 * `extensions` exists because this used to filter by the GLOBAL
 * config.sourceExtensions only, so a check declaring its own extensions could
 * merely narrow that set and never widen it. A grep-forbid rule over .md/.yaml
 * therefore matched zero files and reported a clean pass — a gate that scans
 * nothing reads exactly like a gate that found nothing.
 */
function trackedSources(extensions) {
  try {
    const out = execFileSync('git', ['ls-files', '-z'], {
      cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 20_000
    });
    const exts = new Set(extensions || config.sourceExtensions || ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py', '.vue', '.svelte']);
    return out.split('\0').filter((f) => f && exts.has(path.extname(f)));
  } catch {
    return [];
  }
}

function gitHead() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: REPO_ROOT, encoding: 'utf8', timeout: 10_000
    }).trim();
  } catch {
    return null;
  }
}

// ─── Runner ───────────────────────────────────────────────────────────────────

/**
 * grep-forbid: fails when a forbidden pattern appears in tracked source.
 * This is how the repo's own written invariants become enforceable gates —
 * e.g. "never add @ts-nocheck to silence the typechecker".
 */
/**
 * Files this gate should look at.
 *
 *   scope: "all"      (default) every tracked source file
 *   scope: "changed"  only files modified vs `baseline` (default origin/HEAD)
 *
 * "changed" exists for going-forward naming/style invariants on codebases with
 * large pre-existing violation sets, where a blanket rename would break a live
 * API or schema. The rule still fails the moment new code violates it; the
 * historical backlog is a tracked migration, not a permanently red gate.
 * Never use it for correctness gates (types, lint, bypass) — those must stay
 * repo-wide.
 */
function grepScopeFiles(check) {
  const all = trackedSources(check.extensions);
  if ((check.scope || 'all') !== 'changed') return all;
  const baseline = check.baseline || 'origin/HEAD';
  let changed;
  try {
    const out = execFileSync('git', ['diff', '--name-only', '--diff-filter=d', baseline], {
      cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, timeout: 20_000
    });
    changed = new Set(out.split('\n').map((s) => s.trim()).filter(Boolean));
  } catch {
    // Cannot resolve the baseline — fail safe by checking everything rather
    // than silently checking nothing.
    console.error(`⚠️  [code-quality] ${check.id}: baseline "${baseline}" unresolvable; falling back to full scope.`);
    return all;
  }
  return all.filter((f) => changed.has(f));
}

function runGrepForbid(check) {
  const findings = [];
  const patterns = (check.patterns || []).map((p) => ({
    re: new RegExp(p.pattern, p.flags || ''), message: p.message, code: p.code || 'FORBIDDEN'
  }));
  const exts = new Set(check.extensions || config.sourceExtensions || ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py']);
  const ignore = (check.ignorePaths || []).map((p) => new RegExp(p));
  // Optional allowlist: when present, ONLY files matching one of these path
  // regexes are scanned. Needed for a rule that applies to one subtree with
  // different extensions than the repo-wide rule — expressing "scaffold/ only"
  // with ignorePaths alone would mean listing every other directory.
  const only = (check.paths || []).map((p) => new RegExp(p));

  let scanned = 0;
  for (const rel of grepScopeFiles(check)) {
    if (only.length && !only.some((re) => re.test(rel))) continue;
    if (!exts.has(path.extname(rel))) continue;
    if (ignore.some((re) => re.test(rel))) continue;
    let text;
    try { text = readFileSync(path.join(REPO_ROOT, rel), 'utf8'); } catch { continue; }
    scanned++;
    const lines = text.split('\n');
    for (const { re, message, code } of patterns) {
      for (let i = 0; i < lines.length; i++) {
        if (re.test(lines[i])) {
          findings.push({
            file: rel, line: i + 1, col: 1, code, message,
            check: check.id, severity: 'error', snippet: lines[i].trim().slice(0, 160)
          });
        }
      }
    }
  }
  if (scanned === 0) {
    // Never report clean for a rule that looked at nothing — that is how a
    // misconfigured extension list turns an invariant into decoration.
    findings.push({
      file: '.agent/skills/code-quality/config.json', line: 1, col: 1,
      code: 'CQ-EMPTY-SCOPE', check: check.id, severity: 'error',
      message: `grep-forbid check "${check.id}" matched 0 files — check its extensions/paths/ignorePaths.`,
      snippet: `extensions=${JSON.stringify(check.extensions || null)} paths=${JSON.stringify(check.paths || null)}`
    });
  }

  return Promise.resolve({
    id: check.id, ok: findings.length === 0, exitCode: findings.length ? 1 : 0,
    timedOut: false, durationMs: 0, findings, scanned,
    raw: findings.map((f) => `${f.file}:${f.line}: ${f.code} ${f.message}`).join('\n')
  });
}

function runCheck(check) {
  if (check.kind === 'grep-forbid') return runGrepForbid(check);
  return new Promise((resolve) => {
    const [cmd, ...args] = check.cmd;
    const cwd = path.resolve(REPO_ROOT, check.cwd || '.');
    const timeoutMs = (check.timeoutSeconds ?? config.timeoutSeconds ?? 900) * 1000;
    const heapMb = config.memory?.maxOldSpaceMb;

    const started = Date.now();
    let output = '';
    let timedOut = false;

    const child = spawn(cmd, args, {
      cwd,
      detached: process.platform !== 'win32', // own process group => killable as a unit
      env: {
        ...process.env,
        ...(heapMb ? { NODE_OPTIONS: `${process.env.NODE_OPTIONS || ''} --max-old-space-size=${heapMb}`.trim() } : {}),
        ...(check.env || {}),          // per-check env, e.g. SSSS_ALLOW_AUTO_PROVISION=true
        FORCE_COLOR: '0',
        NO_COLOR: '1'
      },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    currentChild = child;

    const timer = setTimeout(() => {
      timedOut = true;
      killCurrentChild('SIGTERM');
      setTimeout(() => killCurrentChild('SIGKILL'), 5000).unref();
    }, timeoutMs);
    timer.unref();

    child.stdout.on('data', (d) => { output += d.toString(); });
    child.stderr.on('data', (d) => { output += d.toString(); });

    child.on('error', (err) => {
      clearTimeout(timer);
      currentChild = null;
      resolve({
        id: check.id, ok: false, spawnError: err.message, durationMs: Date.now() - started,
        findings: [], raw: '', timedOut: false
      });
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      currentChild = null;
      resolve({
        id: check.id,
        ok: code === 0 && !timedOut,
        exitCode: code,
        timedOut,
        durationMs: Date.now() - started,
        findings: parseOutput(output, check.parser, check.id),
        raw: output.slice(-200_000)
      });
    });
  });
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const wantTier = TIER_ORDER[TIER];
  if (!wantTier) fail(`Unknown --tier ${TIER} (expected: fast | full | remote)`);

  const checks = ONLY
    ? config.checks.filter((c) => c.id === ONLY)
    : config.checks.filter((c) => (TIER_ORDER[c.tier || 'fast'] ?? 1) <= wantTier);

  if (checks.length === 0) {
    fail(ONLY ? `No check matches --only ${ONLY}` : `No checks at tier "${TIER}" or below.`);
  }

  const skipped = config.checks.length - checks.length;
  if (skipped > 0 && !ONLY) {
    // Never let a bounded run look like full coverage.
    const names = config.checks
      .filter((c) => (TIER_ORDER[c.tier || 'fast'] ?? 1) > wantTier)
      .map((c) => `${c.id}(${c.tier})`)
      .join(', ');
    console.error(`ℹ️  [code-quality] tier=${TIER}: skipping ${skipped} higher-tier check(s): ${names}`);
  }

  if (config.globalLock !== false && !NO_GLOBAL_LOCK) {
    acquireLock(GLOBAL_LOCK_PATH, 'machine-wide');
    heldLocks.push(GLOBAL_LOCK_PATH);
  }
  acquireLock(LOCK_PATH, 'repo');
  heldLocks.push(LOCK_PATH);

  const startedAt = new Date().toISOString();
  const startedMs = Date.now();
  console.error(`🔍 [code-quality] ${config.toolchain} — ${checks.length} check(s) in ${REPO_ROOT}`);

  const results = [];
  for (const check of checks) {
    const label = check.kind === 'grep-forbid'
      ? `grep-forbid (${(check.patterns || []).length} pattern(s))`
      : (check.cmd || []).join(' ');
    console.error(`   → ${check.id}: ${label}`);
    const r = await runCheck(check);
    // Mirror the exit contract: ✅ means nothing here blocks a push. Warnings
    // are counted separately so a green gate with warnings does not read as
    // failing, and a failing gate never reads as green.
    const soft = r.findings.filter((f) => f.severity === 'warning' || f.severity === 'info').length;
    const hard = r.findings.length - soft;
    const note = r.spawnError ? `spawn failed: ${r.spawnError}`
      : r.timedOut ? 'TIMED OUT'
      : `${hard} error(s)${soft ? `, ${soft} warning(s)` : ''}, exit ${r.exitCode}`;
    console.error(`     ${r.ok && !hard ? '✅' : '⚠️ '} ${note} (${(r.durationMs / 1000).toFixed(1)}s)`);
    results.push(r);
  }

  const findings = results.flatMap((r) => r.findings);
  const sources = trackedSources();
  const report = {
    schema: 3,
    toolchain: config.toolchain,
    repoRoot: REPO_ROOT,
    tier: TIER,
    // Coverage is stated explicitly so a partial run can never be mistaken
    // for a clean full run when someone reads the report later.
    ranChecks: checks.map((c) => c.id),
    skippedChecks: config.checks.filter((c) => !checks.includes(c)).map((c) => ({ id: c.id, tier: c.tier || 'fast' })),
    startedAt,
    finishedAt: new Date().toISOString(),
    durationMs: Date.now() - startedMs,
    gitHead: gitHead(),
    sourceFileCount: sources.length,
    checks: results.map(({ raw, findings: _f, ...meta }) => meta),
    infrastructureFailure: results.some((r) => r.spawnError || r.timedOut),
    totalFindings: findings.length,
    findings
  };

  mkdirSync(REPORT_DIR, { recursive: true });
  writeFileSync(REPORT_JSON, JSON.stringify(report, null, 2));
  writeFileSync(REPORT_TXT, results.map((r) => `# ${r.id}\n${r.raw.trim()}`).join('\n\n'));

  console.error(
    `📊 [code-quality] ${report.totalFindings} finding(s) in ${(report.durationMs / 1000).toFixed(1)}s ` +
    `— read with: node ${path.relative(process.cwd(), path.join(__dirname, 'report.mjs'))}`
  );

  // Exit contract — meaningful enough to gate a push on:
  //   0 = every gate that ran passed cleanly
  //   1 = findings present (the normal "there is work to do" case)
  //   2 = infrastructure failure, or a gate failed in a way we could not parse
  //       (spawn error, timeout, or non-zero exit with zero findings — that
  //        last one is the dangerous case: it must never read as clean)
  //
  // A gate's verdict is the TOOL's verdict. Linters routinely exit 0 while
  // emitting warnings; turning those into a red gate would mean the gate
  // disagrees with the tool it wraps, and a gate nobody can get green stops
  // being a gate. So warnings/infos are reported but do not fail the run on
  // their own — a non-zero exit from the tool still does.
  const opaqueFailure = results.some(
    (r) => !r.ok && !r.spawnError && !r.timedOut && r.findings.length === 0
  );
  const toolFailed = results.some((r) => !r.ok);
  const blocking = findings.filter((f) => f.severity !== 'warning' && f.severity !== 'info');
  releaseLocks();
  process.exit(
    report.infrastructureFailure || opaqueFailure ? 2 : toolFailed || blocking.length ? 1 : 0
  );
}

main().catch((err) => {
  console.error(`❌ [code-quality] ${err.stack || err.message}`);
  shutdown(1);
});
