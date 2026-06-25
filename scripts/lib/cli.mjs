/**
 * Tiny dependency-free CLI helpers shared by every `ssss` subcommand.
 *
 * Keeps the command modules terse: a flag parser that understands
 * `--flag value`, `--flag=value`, repeatable flags, and boolean switches; plus
 * a couple of formatting helpers so every command's `--help` looks the same.
 */

/**
 * Parse `argv` (already sliced past the subcommand) into { positionals, flags }.
 *
 * @param {string[]} argv
 * @param {object} [spec]
 * @param {Set<string>|string[]} [spec.booleans] - flags that take no value
 * @param {Set<string>|string[]} [spec.multi]    - flags that may repeat (→ array)
 * @param {object} [spec.alias]                   - { short: 'long' } aliases
 */
export function parseArgs(argv, spec = {}) {
  const booleans = new Set(spec.booleans || []);
  const multi = new Set(spec.multi || []);
  const alias = spec.alias || {};
  const positionals = [];
  const flags = {};

  const norm = (name) => alias[name] || name;
  const set = (name, value) => {
    if (multi.has(name)) (flags[name] ||= []).push(value);
    else flags[name] = value;
  };

  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i];
    if (tok === '--') { positionals.push(...argv.slice(i + 1)); break; }
    if (tok.startsWith('--')) {
      let name = tok.slice(2);
      let value;
      const eq = name.indexOf('=');
      if (eq !== -1) { value = name.slice(eq + 1); name = name.slice(0, eq); }
      name = norm(name);
      if (booleans.has(name)) { flags[name] = true; continue; }
      if (value === undefined) value = argv[++i];
      set(name, value);
    } else if (tok.startsWith('-') && tok.length === 2) {
      const name = norm(tok.slice(1));
      if (booleans.has(name)) { flags[name] = true; continue; }
      set(name, argv[++i]);
    } else {
      positionals.push(tok);
    }
  }
  return { positionals, flags };
}

/** Parse repeated `--param key=value` flags into a plain object. */
export function parseKeyValues(list) {
  const out = {};
  for (const item of list || []) {
    const eq = String(item).indexOf('=');
    if (eq === -1) { out[item] = true; continue; }
    out[item.slice(0, eq)] = item.slice(eq + 1);
  }
  return out;
}

/** Render a usage block consistently across commands. */
export function usage({ name, summary, usage: use, options = [], examples = [], seeAlso = [] }) {
  const lines = [];
  if (summary) lines.push(summary, '');
  lines.push(`Usage: ${use}`);
  if (options.length) {
    lines.push('', 'Options:');
    const w = Math.max(...options.map(([f]) => f.length));
    for (const [flag, desc] of options) lines.push(`  ${flag.padEnd(w)}  ${desc}`);
  }
  if (examples.length) {
    lines.push('', 'Examples:');
    for (const ex of examples) lines.push(`  ${ex}`);
  }
  if (seeAlso.length) lines.push('', `See also: ${seeAlso.join(', ')}`);
  return lines.join('\n');
}

/** Print an error to stderr and exit non-zero. */
export function die(message, code = 1) {
  console.error(`ssss: ${message}`);
  process.exit(code);
}

/** True if the user asked for help on this subcommand. */
export function wantsHelp(argv) {
  return argv.includes('--help') || argv.includes('-h');
}
