/**
 * ssss bridge — stdin-to-stdout JSON bridge for the SSSS Operation Contract (spec §6.8).
 * Enables non-JavaScript hosts (e.g. Python, Ruby, Go, shell) to execute operations
 * without running an HTTP server or maintaining custom node runners.
 */
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { createEngine } from '../src/engine.mjs';
import { parseArgs, wantsHelp } from './lib/cli.mjs';

export async function run(argv) {
  if (wantsHelp(argv)) {
    console.log(`Usage: ssss bridge [options]

Execute Operation Contract requests from stdin and emit JSON responses to stdout.
Accepts a single JSON object, a JSON array of requests, or newline-delimited JSON (NDJSON).

Options:
  --vault <dir>       Path to the target vault directory (default: '.')
  --registry <dir>    Path to registry directory
  --extension <file>  Path to extension registry file
  --stream            Process input as continuous newline-delimited JSON stream
  --help, -h          Show help`);
    return;
  }

  const { flags } = parseArgs(argv, { booleans: ['stream'] });
  const vaultRoot = path.resolve(flags.vault || '.');
  const engine = createEngine({
    registryDir: flags.registry,
    extensionFile: flags.extension,
  });

  const processOne = async (payload) => {
    const envelope = payload?.envelope || payload;
    const callOptions = {};
    if (payload?.principal) callOptions.principal = payload.principal;
    try {
      return await engine.processOperation(envelope, vaultRoot, callOptions);
    } catch (err) {
      return {
        success: false,
        error: { code: 'internal_error', message: err.message },
      };
    }
  };

  if (flags.stream) {
    const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
    for await (const line of rl) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const payload = JSON.parse(trimmed);
        const res = await processOne(payload);
        process.stdout.write(`${JSON.stringify(res)}\n`);
      } catch (err) {
        process.stdout.write(`${JSON.stringify({ success: false, error: { code: 'invalid_request', message: `Malformed JSON: ${err.message}` } })}\n`);
      }
    }
    return;
  }

  // Buffered mode (EOF-terminated)
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) return;

  // Case 1: JSON array
  if (raw.startsWith('[') && raw.endsWith(']')) {
    let list;
    try {
      list = JSON.parse(raw);
    } catch (err) {
      process.stdout.write(`${JSON.stringify({ success: false, error: { code: 'invalid_request', message: `Malformed JSON array: ${err.message}` } })}\n`);
      return;
    }
    const results = [];
    for (const item of list) {
      results.push(await processOne(item));
    }
    process.stdout.write(`${JSON.stringify(results)}\n`);
    return;
  }

  // Case 2: single JSON object
  if (raw.startsWith('{') && raw.endsWith('}')) {
    try {
      const payload = JSON.parse(raw);
      const res = await processOne(payload);
      process.stdout.write(`${JSON.stringify(res)}\n`);
      return;
    } catch {
      // If parsing failed, fall through to NDJSON check
    }
  }

  // Case 3: NDJSON
  const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    try {
      const payload = JSON.parse(line);
      const res = await processOne(payload);
      process.stdout.write(`${JSON.stringify(res)}\n`);
    } catch (err) {
      process.stdout.write(`${JSON.stringify({ success: false, error: { code: 'invalid_request', message: `Malformed JSON line: ${err.message}` } })}\n`);
    }
  }
}
