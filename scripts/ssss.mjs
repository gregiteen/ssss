#!/usr/bin/env node
/**
 * @gregiteen/ssss-cli dispatcher — the `ssss` command.
 *
 * Routes the first positional argument to a subcommand. The bundle/provisioning
 * commands (export/validate/inspect/provision/import/help) export a `run(argv)`
 * function; `autolink.mjs` exports `main()` (also reused as a library by
 * `build-reference-bundle.mjs` for `generateIndexes`, so it no longer
 * self-executes on import); `conformance.mjs` is still legacy and self-executes
 * on import, reading process.argv directly.
 *
 * Run `ssss help` for documentation topics, or `ssss <command> --help` for flags.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const VERSION = (() => {
  try { return fs.readFileSync(path.resolve(HERE, '..', 'VERSION'), 'utf8').trim(); }
  catch { return '0.0.0'; }
})();

const TOP_LEVEL_HELP = `@gregiteen/ssss-cli v${VERSION} — Structured Semantic Syntax System

Usage: ssss <command> [options]

Scaffold:
  new <dir>             Scaffold a new SSSS project (--with-total-recall, --install).

Vault → bundle → tenant lifecycle:
  export <vault>        Package a vault into a .ucw bundle (spec §16).
  validate <bundle>     Check a bundle against the schema + portability rules.
  inspect <bundle>      Human-readable summary of a bundle.
  provision <bundle>    Plan an install: params + link integrity → envelopes (§17).
  import <bundle>       Replay a bundle/plan into a target vault (idempotent).

Authoring & conformance:
  autolink [dir]        Generate OKF wiki links across a vault.
  conformance           Run the canonical conformance suite (spec §12).
                        --engine | --endpoint <url> [--token <pat>]

Docs:
  help [topic]          Show local documentation (runtime, portability, bundle, provisioning, …).
  version               Print the version.

Run 'ssss <command> --help' for a command's flags, or 'ssss help' for topics.
The spec, registry, and conformance suite live in this package:
  docs/ssss-spec.md · registry/core.json · conformance/fixtures.json`;

const sub = process.argv[2];
const rest = process.argv.slice(3);

// Commands that export run(argv).
const MODULES = {
  new: './cmd-new.mjs',
  scaffold: './cmd-new.mjs',
  export: './cmd-export.mjs',
  validate: './cmd-validate.mjs',
  inspect: './cmd-inspect.mjs',
  provision: './cmd-provision.mjs',
  import: './cmd-import.mjs',
  help: './cmd-help.mjs',
};

if (sub in MODULES) {
  const mod = await import(MODULES[sub]);
  await mod.run(rest);
} else {
  switch (sub) {
    case 'autolink': {
      const mod = await import('./autolink.mjs');
      await mod.main();
      break;
    }
    case 'conformance':
      await import('./conformance.mjs');
      break;
    case 'version':
    case '--version':
    case '-v':
      console.log(VERSION);
      break;
    case undefined:
    case '--help':
    case '-h':
      console.log(TOP_LEVEL_HELP);
      break;
    default:
      console.error(`Unknown command: ${sub}\nRun 'ssss --help' for usage, or 'ssss help' for topics.`);
      process.exit(1);
  }
}
