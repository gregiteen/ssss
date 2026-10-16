#!/usr/bin/env node
/** Vendor subscription CLI lane. No credential reads, shell execution or login changes. */
import { spawn } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const API_ENV_KEYS = Object.freeze([
  'OPENAI_API_KEY', 'CODEX_API_KEY', 'OPENAI_BASE_URL', 'ANTHROPIC_API_KEY',
  'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_BASE_URL', 'GOOGLE_API_KEY', 'GEMINI_API_KEY',
  'GOOGLE_GENERATIVE_AI_API_KEY', 'GOOGLE_APPLICATION_CREDENTIALS',
  'CLAUDE_CODE_USE_BEDROCK', 'CLAUDE_CODE_USE_VERTEX', 'CLAUDE_CODE_USE_FOUNDRY',
  'ANTHROPIC_FOUNDRY_API_KEY', 'ANTHROPIC_VERTEX_PROJECT_ID', 'CLAUDE_CODE_API_KEY',
]);
const VENDORS = new Set(['codex', 'claude', 'agy', 'gemini']);
export const PROCESS_ENV_KEYS = Object.freeze([
  'PATH', 'HOME', 'USER', 'LOGNAME', 'SHELL', 'TMPDIR', 'TMP', 'TEMP',
  'XDG_RUNTIME_DIR', 'XDG_CACHE_HOME', 'XDG_CONFIG_HOME', 'XDG_DATA_HOME',
  'LANG', 'LANGUAGE', 'LC_ALL', 'TERM', 'COLORTERM', 'SYSTEMROOT', 'SystemRoot',
  'windir', 'WINDIR', 'APPDATA', 'LOCALAPPDATA', 'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH',
  'CODEX_HOME', 'CLAUDE_CONFIG_DIR',
]);

/** Use account-configured/discovered models; never pin a catalog slug in this helper. */
export function defaultArguments(vendor, args) {
  const has = (...names) => args.some(arg => names.some(name => arg === name || arg.startsWith(name + '=')));
  const output = has('--output-format', '-o') ? [] : ['--output-format', 'json'];
  if (vendor === 'codex') return ['exec', ...(has('--sandbox', '-s') ? [] : ['--sandbox', 'read-only']), ...(has('--json') ? [] : ['--json'])];
  if (vendor === 'claude') return [...output, ...(has('--permission-mode') ? [] : ['--permission-mode', 'plan']), ...(has('--tools') ? [] : ['--tools', 'Read,Glob,Grep'])];
  if (vendor === 'agy') return [...output, ...(has('--mode') ? [] : ['--mode', 'plan'])];
  if (vendor === 'gemini') return [...output, ...(has('--approval-mode') ? [] : ['--approval-mode', 'plan']), ...(has('--sandbox', '-s') ? [] : ['--sandbox'])];
  throw new Error('Unsupported subscription CLI');
}

export function subscriptionEnv(source = process.env) {
  // Allowlist runtime/login-root metadata instead of copying unrelated host secrets.
  const env = {};
  for (const key of PROCESS_ENV_KEYS) if (typeof source[key] === 'string') env[key] = source[key];
  for (const [key, value] of Object.entries(source)) if (/^LC_[A-Z_]+$/.test(key) && typeof value === 'string') env[key] = value;
  return env;
}

export function validateArgs(vendor, args) {
  if (!VENDORS.has(vendor)) throw new Error('Unsupported subscription CLI');
  if (!Array.isArray(args) || args.some(a => typeof a !== 'string')) throw new Error('Arguments must be strings');
  const forbidden = /^(?:--dangerously-|--yolo(?:=|$)|--always-approve(?:=|$)|--allow-all(?:=|$)|--bare$|--oss$|--local-provider(?:=|$)|--ignore-rules$)/;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (forbidden.test(arg) || /^-s(?:=)?(?:danger-full-access|false)$/.test(arg)) throw new Error('Permission bypass or alternate provider is forbidden');
    if (/^(?:--permission-mode|--approval-mode|--sandbox|-s)(?:=|$)/.test(arg)) {
      const value = arg.includes('=') ? arg.slice(arg.indexOf('=') + 1) : args[i + 1];
      if (['bypassPermissions', 'yolo', 'danger-full-access', 'false'].includes(value)) throw new Error('Permission bypass is forbidden');
    }
    if (vendor === 'codex' && (/^(?:--config|--profile|-p)(?:=|$)/.test(arg) || arg.startsWith('-c') || arg.startsWith('-p'))) throw new Error('Provider/profile overrides are forbidden in subscription lane');
    if (vendor === 'claude' && /^(?:--settings|--setting-sources)(?:=|$)/.test(arg)) throw new Error('Settings/provider overrides are forbidden in subscription lane');
    if (/^(?:--api-key|--base-url|--endpoint|--auth-token)(?:=|$)/.test(arg)) throw new Error('API routing overrides are forbidden');
  }
  return args;
}

/** Parse only known vendor result envelopes; never interpret an error as an answer. */
export function parseResult(vendor, stdout, exitCode) {
  if (!VENDORS.has(vendor)) throw new Error('Unsupported subscription CLI');
  if (exitCode !== 0) return { ok: false, reason: 'nonzero-exit' };
  const text = stdout.trim();
  if (!text) return { ok: false, reason: 'empty-output' };
  let frames;
  try {
    const object = JSON.parse(text);
    frames = Array.isArray(object) ? [] : [object];
  } catch {
    try { frames = text.split('\n').filter(l => l.trim()).map(l => JSON.parse(l)); }
    catch { return { ok: false, reason: 'malformed-output' }; }
  }
  if (!frames.length || frames.some(f => !f || typeof f !== 'object' || Array.isArray(f))) return { ok: false, reason: 'invalid-envelope' };
  for (const f of frames) {
    if (f.is_error === true || f.error || ['turn.failed', 'error'].includes(f.type) || f.status === 'ERROR' || f.status === 'FAILED' || f.subtype?.startsWith('error')) return { ok: false, reason: 'vendor-error' };
  }
  if (vendor === 'codex') {
    const messages = frames.filter(f => f.type === 'item.completed' && f.item?.type === 'agent_message' && typeof f.item.text === 'string');
    if (!messages.length || !frames.some(f => f.type === 'turn.completed')) return { ok: false, reason: 'incomplete-turn' };
    return { ok: true, response: messages.map(f => f.item.text).join('\n') };
  }
  const last = frames.at(-1);
  if (vendor === 'claude') {
    if (last.type !== 'result' || last.subtype !== 'success' || typeof last.result !== 'string') return { ok: false, reason: 'incomplete-result' };
    return { ok: true, response: last.result };
  }
  if (vendor === 'agy' && (typeof last.status !== 'string' || last.status.toUpperCase() !== 'SUCCESS')) return { ok: false, reason: 'incomplete-result' };
  if (typeof last.response !== 'string') return { ok: false, reason: 'missing-response' };
  return { ok: true, response: last.response };
}

export function validateAuth(vendor, result, allowUnknownAuth = false) {
  if (!VENDORS.has(vendor)) throw new Error('Unsupported subscription CLI');
  if (vendor === 'codex') {
    return result.exitCode === 0 && /Logged in using ChatGPT/i.test(result.stdout + result.stderr)
      ? { ok: true, method: 'chatgpt' } : { ok: false, reason: 'chatgpt-login-required' };
  }
  if (vendor === 'claude') {
    let status;
    try { status = JSON.parse(result.stdout); } catch { return { ok: false, reason: 'invalid-auth-status' }; }
    // Installed Claude auth-status uses claude.ai, not an invented subscription enum.
    // Managed/API logins can also identify as claude.ai; require an actual plan field,
    // first-party routing and no API-key source. Output never includes account identity.
    return result.exitCode === 0 && status?.loggedIn === true && status.authMethod === 'claude.ai'
      && status.apiProvider === 'firstParty' && !status.apiKeySource
      && typeof status.subscriptionType === 'string' && status.subscriptionType.length > 0
      ? { ok: true, method: 'claude.ai-subscription' } : { ok: false, reason: 'subscription-login-required' };
  }
  // These installed CLIs lack a verified noninteractive subscription-status contract.
  return allowUnknownAuth ? { ok: true, method: 'unknown-explicitly-allowed' } : { ok: false, reason: 'unknown-auth-requires-explicit-override' };
}

/** Bounded async argv spawn; timeout/output overflow terminates the whole process group. */
export function spawnBounded(binary, args, { cwd, env, input = '', timeoutMs = 180000, maxOutputBytes = 2 * 1024 * 1024, killGraceMs = 500 } = {}) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || !Number.isFinite(maxOutputBytes) || maxOutputBytes <= 0 || !Number.isFinite(killGraceMs) || killGraceMs < 0) throw new Error('Invalid process bounds');
  return new Promise(resolveResult => {
    let child, stdout = '', stderr = '', bytes = 0, stopReason = null, done = false, escalation = null, timer;
    const grouped = process.platform !== 'win32';
    const kill = signal => {
      try { if (grouped && child.pid) process.kill(-child.pid, signal); else child.kill(signal); } catch {}
    };
    const finish = (exitCode, signal = null) => {
      if (done) return;
      done = true; clearTimeout(timer);
      resolveResult({ exitCode, signal, stdout, stderr, reason: stopReason });
    };
    const stop = reason => {
      if (stopReason || done) return;
      stopReason = reason; kill('SIGTERM');
      escalation = setTimeout(() => { kill('SIGKILL'); finish(null, 'SIGKILL'); }, killGraceMs);
    };
    try { child = spawn(binary, args, { cwd, env, shell: false, detached: grouped, stdio: ['pipe', 'pipe', 'pipe'] }); }
    catch { finish(null); return; }
    timer = setTimeout(() => stop('timeout'), timeoutMs);
    child.on('error', () => { stopReason = 'spawn-error'; clearTimeout(escalation); finish(null); });
    child.stdin.on('error', () => {}); // EPIPE is represented by the child result.
    for (const [stream, isStdout] of [[child.stdout, true], [child.stderr, false]]) {
      stream.on('data', chunk => {
        const room = Math.max(0, maxOutputBytes - bytes);
        bytes += chunk.length;
        const part = chunk.subarray(0, room).toString('utf8');
        if (isStdout) stdout += part; else stderr += part;
        if (bytes > maxOutputBytes) stop('output-limit');
      });
    }
    child.on('close', (code, signal) => { if (!stopReason) finish(code, signal); });
    child.stdin.end(input);
  });
}

export async function dispatch(vendor, args, options = {}) {
  validateArgs(vendor, args);
  const env = subscriptionEnv(options.env);
  const processOptions = { ...options, env };
  const spawnProcess = options.spawnProcess || spawnBounded;
  let auth;
  if (vendor === 'codex' || vendor === 'claude') {
    const probeArgs = vendor === 'codex' ? ['login', 'status'] : ['auth', 'status'];
    const probe = await spawnProcess(vendor, probeArgs, { ...processOptions, input: '', timeoutMs: Math.min(options.timeoutMs || 180000, 15000) });
    auth = validateAuth(vendor, probe);
  } else auth = validateAuth(vendor, {}, options.allowUnknownAuth === true);
  if (!auth.ok) return { ok: false, reason: auth.reason, auth: { method: 'unverified' } };
  const defaults = defaultArguments(vendor, args);
  const userArgs = [...args];
  let prompt = options.input || '';
  if (vendor !== 'codex' && !prompt) {
    if (!userArgs.length || userArgs.at(-1).startsWith('-')) return { ok: false, reason: 'prompt-required', auth };
    prompt = userArgs.pop();
  }
  // Vendor print flags and prompt are final, after variadic Claude tool flags.
  // stdin supplied to this helper becomes a prompt argument to these vendors;
  // no empty-prompt behavior or undiscovered stdin adapter is assumed.
  const invocation = vendor === 'codex' ? [...defaults, ...userArgs]
    : [...defaults, ...userArgs, vendor === 'gemini' ? '--prompt' : '-p', prompt];
  const result = await spawnProcess(vendor, invocation, { ...processOptions, input: vendor === 'codex' ? (options.input || '') : '' });
  if (result.reason) return { ok: false, reason: result.reason, auth };
  return { ...parseResult(vendor, result.stdout, result.exitCode), auth };
}

async function main(argv) {
  if (argv.includes('--help') || argv.includes('-h')) {
    process.stdout.write('Usage: subscription-cli.mjs codex|claude|agy|gemini [--cwd DIR] [--timeout-ms N] [--allow-unknown-auth] -- [vendor options] [prompt]\nDefaults analyze with scoped tools. Prompt may be supplied on stdin. agy/gemini require explicit unknown-auth override. No login or auth configuration is changed.\nModels inherit vendor configuration unless explicitly selected. Verify the current account catalog and exact project-effective selection; a configured model can be unavailable to the subscription. Use a currently available catalog model via --model and verify a real bounded run; never store a hardcoded slug here.\n');
    return;
  }
  const vendor = argv.shift();
  let cwd = process.cwd(), timeoutMs = 180000, allowUnknownAuth = false;
  while (argv.length && argv[0] !== '--') {
    const flag = argv.shift();
    if (flag === '--cwd') cwd = resolve(argv.shift() || '.');
    else if (flag === '--timeout-ms') timeoutMs = Number(argv.shift());
    else if (flag === '--allow-unknown-auth') allowUnknownAuth = true;
    else throw new Error('Usage: subscription-cli.mjs codex|claude|agy|gemini [--cwd DIR] [--timeout-ms N] [--allow-unknown-auth] -- [vendor arguments] (prompt may use stdin)');
  }
  if (argv[0] === '--') argv.shift();
  let input = '';
  if (!process.stdin.isTTY) for await (const chunk of process.stdin) {
    input += chunk; if (Buffer.byteLength(input) > 2 * 1024 * 1024) throw new Error('Input limit exceeded');
  }
  const result = await dispatch(vendor, argv, { cwd, timeoutMs, input, allowUnknownAuth });
  process.stdout.write(JSON.stringify(result) + '\n');
  if (!result.ok) process.exitCode = 1;
}
let isMain = false;
try { isMain = Boolean(process.argv[1]) && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)); } catch {}
if (isMain) {
  main(process.argv.slice(2)).catch(() => { process.stderr.write('Subscription CLI failed; no credentials or prompt logged.\n'); process.exitCode = 1; });
}
