/**
 * Schema export and inspection commands for SSSS.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, die, wantsHelp } from './lib/cli.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const SCHEMAS_DIR = path.resolve(ROOT, 'schemas');

const HELP = `Usage: ssss schema core|bundle|export [options]

Commands:
  core [--out <file>]      Output the Core Registry JSON Schema.
  bundle [--out <file>]    Output the .ucw Bundle JSON Schema.
  export [--out <dir>]     Export all canonical schemas to a directory (default: ./schemas).
`;

function emit(value, output) {
  const text = typeof value === 'string' ? value : `${JSON.stringify(value, null, 2)}\n`;
  if (output) {
    fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true });
    fs.writeFileSync(path.resolve(output), text, { encoding: 'utf8' });
  } else {
    process.stdout.write(text);
  }
}

export async function run(argv) {
  if (wantsHelp(argv)) { console.log(HELP); return; }
  const verb = argv[0];
  const { flags } = parseArgs(argv.slice(1));

  try {
    const coreSchemaPath = path.join(SCHEMAS_DIR, 'core-registry.schema.json');
    const bundleSchemaPath = path.join(SCHEMAS_DIR, 'bundle.schema.json');

    if (verb === 'core') {
      const content = fs.readFileSync(coreSchemaPath, 'utf8');
      emit(content, flags.out);
      return;
    }
    if (verb === 'bundle') {
      const content = fs.readFileSync(bundleSchemaPath, 'utf8');
      emit(content, flags.out);
      return;
    }
    if (verb === 'export') {
      const targetDir = path.resolve(flags.out || './schemas');
      fs.mkdirSync(targetDir, { recursive: true });
      fs.copyFileSync(coreSchemaPath, path.join(targetDir, 'core-registry.schema.json'));
      fs.copyFileSync(bundleSchemaPath, path.join(targetDir, 'bundle.schema.json'));
      console.log(`Exported canonical schemas to ${targetDir}`);
      return;
    }
    die(`Unknown schema verb '${verb || ''}'.\n${HELP}`);
  } catch (error) {
    die(error.message);
  }
}
