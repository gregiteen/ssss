import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, symlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { API_ENV_KEYS, subscriptionEnv, validateArgs, validateAuth, parseResult, dispatch, spawnBounded, defaultArguments } from '../scripts/subscription-cli.mjs';

test('subscription environment removes API routing while preserving login roots and caller env', () => {
  const original = { HOME: '/synthetic/home', CODEX_HOME: '/synthetic/codex', CLAUDE_CONFIG_DIR: '/synthetic/claude', PATH: '/bin', LC_CTYPE: 'UTF-8', TR_PAT: 'unrelated-secret', TR_SECRETS_PASSWORD: 'unrelated-secret', SMTP2GO_API_KEY: 'unrelated-secret' };
  for (const key of API_ENV_KEYS) original[key] = 'synthetic-secret';
  const cleaned = subscriptionEnv(original);
  for (const key of API_ENV_KEYS) { assert.equal(cleaned[key], undefined); assert.equal(original[key], 'synthetic-secret'); }
  assert.equal(cleaned.CODEX_HOME, original.CODEX_HOME);
  assert.equal(cleaned.CLAUDE_CONFIG_DIR, original.CLAUDE_CONFIG_DIR);
  assert.equal(cleaned.HOME, original.HOME);
  assert.equal(cleaned.LC_CTYPE, original.LC_CTYPE);
  for (const key of ['TR_PAT', 'TR_SECRETS_PASSWORD', 'SMTP2GO_API_KEY']) assert.equal(cleaned[key], undefined);
});

test('bypass and API/profile override variants are refused; explicit scoped modes allowed', () => {
  for (const [vendor, args] of [
    ['claude', ['--permission-mode', 'bypassPermissions']], ['claude', ['--dangerously-skip-permissions']],
    ['codex', ['--sandbox=danger-full-access']], ['codex', ['-s', 'danger-full-access']], ['codex', ['-sdanger-full-access']], ['codex', ['-s=danger-full-access']],
    ['claude', ['--settings', '{}']], ['claude', ['--setting-sources=user']], ['codex', ['-pexternal']],
    ['codex', ['-c', 'model_provider="external"']], ['codex', ['--profile', 'external']],
    ['gemini', ['--approval-mode=yolo']], ['gemini', ['--sandbox=false']], ['agy', ['--always-approve']],
    ['agy', ['--base-url', 'https://synthetic.invalid']],
  ]) assert.throws(() => validateArgs(vendor, args));
  assert.deepEqual(validateArgs('codex', ['--sandbox', 'read-only']), ['--sandbox', 'read-only']);
  assert.deepEqual(validateArgs('claude', ['--permission-mode', 'plan']), ['--permission-mode', 'plan']);
  assert.throws(() => validateArgs('unknown', []));
});

test('safe auth verdict rejects API login, malformed status and unauthenticated CLI', () => {
  assert.equal(validateAuth('codex', { exitCode: 0, stdout: '', stderr: 'Logged in using ChatGPT' }).ok, true);
  assert.equal(validateAuth('codex', { exitCode: 0, stdout: 'Logged in using API key', stderr: '' }).ok, false);
  assert.equal(validateAuth('codex', { exitCode: 1, stdout: 'Logged in using ChatGPT', stderr: '' }).ok, false);
  const subscription = { loggedIn: true, authMethod: 'claude.ai', apiProvider: 'firstParty', subscriptionType: 'max', accessToken: 'synthetic-never-output' };
  assert.equal(validateAuth('claude', { exitCode: 0, stdout: JSON.stringify(subscription) }).ok, true);
  for (const patch of [{ loggedIn: false }, { apiProvider: 'thirdParty' }, { apiKeySource: 'ANTHROPIC_API_KEY' }, { subscriptionType: null }, { authMethod: 'oauth_token' }]) {
    assert.equal(validateAuth('claude', { exitCode: 0, stdout: JSON.stringify({ ...subscription, ...patch }) }).ok, false);
  }
  assert.equal(validateAuth('claude', { exitCode: 0, stdout: JSON.stringify({ loggedIn: true, authMethod: 'apiKey' }) }).ok, false);
  assert.equal(validateAuth('claude', { exitCode: 0, stdout: '{broken' }).ok, false);
  for (const vendor of ['agy', 'gemini']) {
    assert.equal(validateAuth(vendor, {}).ok, false);
    assert.equal(validateAuth(vendor, {}, true).method, 'unknown-explicitly-allowed');
  }
});

test('zero-exit soft errors and malformed envelopes are never accepted', () => {
  assert.equal(parseResult('claude', JSON.stringify({ type: 'result', subtype: 'success', is_error: true, result: 'failed' }), 0).ok, false);
  assert.equal(parseResult('codex', '{"type":"turn.failed","error":{"message":"synthetic"}}', 0).ok, false);
  assert.equal(parseResult('agy', '{"status":"FAILED","response":"failed"}', 0).ok, false);
  assert.equal(parseResult('gemini', '{"error":{"message":"synthetic"}}', 0).ok, false);
  for (const text of ['', 'not json', '[]', 'null', '{"response":"x"}\nmalformed']) assert.equal(parseResult('gemini', text, 0).ok, false);
  assert.equal(parseResult('gemini', '{"response":"x"}', 1).ok, false);
});

test('Codex JSONL extracts only agent messages and requires completion', () => {
  const frames = [{ type: 'thread.started' }, { type: 'item.completed', item: { type: 'command_execution', text: 'not an answer' } }, { type: 'item.completed', item: { type: 'agent_message', text: 'answer' } }, { type: 'turn.completed' }];
  assert.deepEqual(parseResult('codex', frames.map(JSON.stringify).join('\n'), 0), { ok: true, response: 'answer' });
  assert.equal(parseResult('codex', JSON.stringify(frames[2]), 0).ok, false);
  assert.deepEqual(parseResult('claude', '{"type":"result","subtype":"success","result":"answer"}', 0), { ok: true, response: 'answer' });
  assert.deepEqual(parseResult('agy', '{"status":"SUCCESS","response":"answer"}', 0), { ok: true, response: 'answer' });
});

test('dispatch auth checks use clean env and never expose probe data or inject models', async () => {
  const calls = [];
  const result = await dispatch('claude', ['synthetic prompt'], {
    env: { HOME: '/synthetic', ANTHROPIC_API_KEY: 'synthetic-secret' }, input: 'synthetic stdin', cwd: '/synthetic',
    spawnProcess: async (binary, args, options) => {
      calls.push({ binary, args, options });
      return calls.length === 1
        ? { exitCode: 0, stdout: JSON.stringify({ loggedIn: true, authMethod: 'claude.ai', apiProvider: 'firstParty', subscriptionType: 'max', email: 'private@example.invalid', accessToken: 'synthetic-secret' }), stderr: '' }
        : { exitCode: 0, stdout: '{"type":"result","subtype":"success","result":"done"}', stderr: '' };
    },
  });
  assert.equal(result.ok, true);
  assert.equal(JSON.stringify(result).includes('synthetic-secret'), false);
  assert.equal(JSON.stringify(result).includes('private@example'), false);
  assert.deepEqual(calls[0].args, ['auth', 'status']);
  assert.equal(calls[0].options.input, '');
  assert.equal(calls[1].options.input, '');
  assert.equal(calls[1].args.at(-1), 'synthetic stdin');
  assert.equal(calls[1].args.at(-2), '-p');
  assert.ok(calls[1].args.includes('plan'));
  assert.equal(calls[1].options.env.ANTHROPIC_API_KEY, undefined);
  assert.equal(calls[1].args.includes('--model'), false);
});

test('failed auth prevents dispatch and unknown auth requires explicit override', async () => {
  let calls = 0;
  const spawnProcess = async () => { calls++; return { exitCode: 1, stdout: '', stderr: 'synthetic login failure' }; };
  assert.equal((await dispatch('codex', [], { spawnProcess })).ok, false);
  assert.equal(calls, 1);
  assert.equal((await dispatch('agy', [], { spawnProcess })).ok, false);
  assert.equal(calls, 1);
  await dispatch('agy', ['synthetic prompt'], { spawnProcess, allowUnknownAuth: true });
  assert.equal(calls, 2);
});

test('vendor defaults analyze safely and stdin prompts use verified print arguments', async () => {
  for (const vendor of ['codex', 'agy', 'gemini']) {
    const calls = [];
    const spawnProcess = async (binary, args, options) => {
      calls.push({ args, options });
      if (vendor === 'codex' && args[0] === 'login') return { exitCode: 0, stdout: '', stderr: 'Logged in using ChatGPT' };
      return { exitCode: 0, stdout: vendor === 'codex'
        ? '{"type":"item.completed","item":{"type":"agent_message","text":"done"}}\n{"type":"turn.completed"}'
        : vendor === 'agy' ? '{"status":"SUCCESS","response":"done"}' : '{"response":"done"}', stderr: '' };
    };
    const result = await dispatch(vendor, [], { input: 'stdin prompt', allowUnknownAuth: true, spawnProcess });
    assert.equal(result.ok, true);
    const invocation = calls.at(-1);
    if (vendor === 'codex') { assert.ok(invocation.args.includes('read-only')); assert.equal(invocation.options.input, 'stdin prompt'); }
    else { assert.ok(invocation.args.includes('plan')); assert.equal(invocation.args.at(-1), 'stdin prompt'); assert.equal(invocation.options.input, ''); }
    assert.equal(invocation.args.includes('--model'), false);
  }
});

test('approved permission/tool overrides replace defaults instead of duplicating flags', () => {
  for (const [vendor, args, flag, defaultValue] of [
    ['codex', ['--sandbox', 'workspace-write'], '--sandbox', 'read-only'],
    ['codex', ['-s=workspace-write'], '--sandbox', 'read-only'],
    ['claude', ['--permission-mode', 'acceptEdits'], '--permission-mode', 'plan'],
    ['claude', ['--tools', 'Read,Edit'], '--tools', 'Read,Glob,Grep'],
    ['agy', ['--mode=accept-edits'], '--mode', 'plan'],
    ['gemini', ['--approval-mode', 'auto_edit'], '--approval-mode', 'plan'],
  ]) {
    validateArgs(vendor, args);
    const defaults = defaultArguments(vendor, args);
    assert.equal(defaults.includes(flag), false);
    assert.equal(defaults.includes(defaultValue), false);
  }
  assert.equal(defaultArguments('codex', ['--model', 'dynamic-account-model']).includes('--model'), false);
});

test('entrypoint executes through a real filesystem symlink; invalid vendor fails nonzero', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'subscription-alias-'));
  try {
    const alias = join(dir, 'helper.mjs');
    await symlink(fileURLToPath(new URL('../scripts/subscription-cli.mjs', import.meta.url)), alias);
    const help = await spawnBounded(process.execPath, [alias, '--help'], { timeoutMs: 3000 });
    assert.equal(help.exitCode, 0);
    assert.match(help.stdout, /Usage: subscription-cli/);
    const invalid = await spawnBounded(process.execPath, [alias, 'unknown-vendor', '--'], { timeoutMs: 3000 });
    assert.equal(invalid.exitCode, 1);
    assert.match(invalid.stderr, /Subscription CLI failed/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('bounded spawn handles missing binary/cwd, nonzero exit and stdin using synthetic processes', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'subscription-cli-'));
  try {
    assert.equal((await spawnBounded(join(dir, 'missing'), [], { timeoutMs: 1000 })).reason, 'spawn-error');
    assert.equal((await spawnBounded(process.execPath, ['-e', ''], { cwd: join(dir, 'missing'), timeoutMs: 1000 })).reason, 'spawn-error');
    const sent = 'literal dollar $() `backticks` newline\n';
    const echo = await spawnBounded(process.execPath, ['-e', "process.stdin.pipe(process.stdout)"], { input: sent, timeoutMs: 2000 });
    assert.equal(echo.stdout, sent); assert.equal(echo.exitCode, 0);
    assert.equal((await spawnBounded(process.execPath, ['-e', 'process.exit(7)'], { timeoutMs: 2000 })).exitCode, 7);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('timeout escalates for a synthetic process ignoring SIGTERM; output remains bounded', async () => {
  const timed = await spawnBounded(process.execPath, ['-e', "process.on('SIGTERM',()=>{});setInterval(()=>{},1000)"], { timeoutMs: 250, killGraceMs: 100 });
  assert.equal(timed.reason, 'timeout'); assert.equal(timed.exitCode, null);
  const noisy = await spawnBounded(process.execPath, ['-e', "setInterval(()=>process.stdout.write('x'.repeat(2048)),1)"], { timeoutMs: 2000, maxOutputBytes: 128, killGraceMs: 100 });
  assert.equal(noisy.reason, 'output-limit'); assert.ok(Buffer.byteLength(noisy.stdout) <= 128);
  assert.throws(() => spawnBounded(process.execPath, [], { timeoutMs: -1 }));
});

test('timeout also terminates a synthetic descendant in the detached process group', { skip: process.platform === 'win32' }, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'subscription-child-'));
  const marker = join(dir, 'tick');
  const childCode = "const fs=require('node:fs');process.on('SIGTERM',()=>{});setInterval(()=>fs.appendFileSync(process.argv[1],'x'),20)";
  const parentCode = "const {spawn}=require('node:child_process');const p=spawn(process.execPath,['-e',process.argv[1],process.argv[2]],{stdio:'ignore'});process.on('SIGTERM',()=>{});setInterval(()=>{},1000)";
  try {
    const result = await spawnBounded(process.execPath, ['-e', parentCode, childCode, marker], { timeoutMs: 700, killGraceMs: 150 });
    assert.equal(result.reason, 'timeout');
    const before = await readFile(marker, 'utf8');
    assert.ok(before.length > 0, 'descendant actually ran');
    await new Promise(resolve => setTimeout(resolve, 150));
    assert.equal(await readFile(marker, 'utf8'), before, 'descendant stopped after group escalation');
  } finally { await rm(dir, { recursive: true, force: true }); }
});
