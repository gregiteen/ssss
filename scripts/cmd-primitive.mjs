/** Primitive authoring and inspection commands for SSSS 0.9. */
import fs from 'node:fs';
import path from 'node:path';
import { definePrimitive, definitionsToExtensionRegistry } from '../src/primitive.mjs';
import { parseArgs, die, wantsHelp } from './lib/cli.mjs';

const HELP = `Usage: ssss primitive create|validate|inspect|migrate [file] [options]\n\n` +
  `create: --namespace <id> --name <text> [--language <tag>] [--fields <json>] [--out <file>]\n` +
  `validate|inspect: <definition.json> [--typescript] [--out <file>]\n` +
  `migrate: <definition.json> --to-version <n> [--out <file>]`;

function readJson(file) { return JSON.parse(fs.readFileSync(path.resolve(file), 'utf8')); }
function emit(value, output) {
  const text = typeof value === 'string' ? value : `${JSON.stringify(value, null, 2)}\n`;
  if (output) fs.writeFileSync(path.resolve(output), text, { flag: 'wx', mode: 0o600 });
  else process.stdout.write(text);
}
function typeScript(definition) {
  const name = definition.primitive_id.replace(/[^A-Za-z0-9]+/g, '_').replace(/^\d/, '_$&');
  const fields = definition.fields.map((field) => {
    const kind = field.kind === 'boolean' ? 'boolean' : field.kind === 'number' ? 'number' : field.kind === 'enum' ? field.values.map(JSON.stringify).join(' | ') : 'string';
    return `  ${JSON.stringify(field.id)}${field.required ? '' : '?'}: ${kind};`;
  }).join('\n');
  return `export interface ${name} {\n  type: ${JSON.stringify(definition.primitive_id)};\n${fields}\n}\n`;
}

export async function run(argv) {
  if (wantsHelp(argv)) { console.log(HELP); return; }
  const verb = argv[0];
  const { positionals, flags } = parseArgs(argv.slice(1), { booleans: ['typescript'] });
  try {
    if (verb === 'create') {
      if (!flags.namespace || !flags.name) die(`create requires --namespace and --name.\n${HELP}`);
      const definition = definePrimitive({ namespace: flags.namespace, name: flags.name, language: flags.language, fields: flags.fields ? JSON.parse(flags.fields) : [] });
      emit(definition, flags.out); return;
    }
    if (!positionals[0]) die(`A definition file is required.\n${HELP}`);
    const definition = definePrimitive(readJson(positionals[0]));
    if (verb === 'validate') { emit({ valid: true, primitive_id: definition.primitive_id }, flags.out); return; }
    if (verb === 'inspect') { emit(flags.typescript ? typeScript(definition) : { definition, registry: definitionsToExtensionRegistry(definition.namespace, [definition]) }, flags.out); return; }
    if (verb === 'migrate') {
      const version = Number(flags['to-version']);
      if (!Number.isInteger(version) || version <= definition.version) die('--to-version must be an integer greater than the current version.');
      emit({ ...definition, version, revision: 1, migrations: [...(definition.migrations || []), { from: definition.version, to: version, strategy: 'explicit' }] }, flags.out); return;
    }
    die(`Unknown primitive verb '${verb || ''}'.\n${HELP}`);
  } catch (error) { die(error.message); }
}
