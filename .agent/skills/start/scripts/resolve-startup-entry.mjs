import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
function packageFor(entry) {
  const real = fs.realpathSync(entry);
  let dir = path.dirname(real);
  for (let i = 0; i < 8; i++) {
    try { const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')); if (manifest.name) return { root: dir, manifest, entry: real }; } catch {}
    const parent = path.dirname(dir); if (parent === dir) break; dir = parent;
  }
  throw new Error('CLI package identity unavailable');
}
function verifyEntry(entry, expectedName) {
  try {
    const pkg = packageFor(entry);
    const bin = pkg.manifest.bin?.['total-recall'];
    if (pkg.manifest.name !== expectedName || typeof bin !== 'string' || fs.realpathSync(path.resolve(pkg.root, bin)) !== pkg.entry) return null;
    if (!fs.statSync(path.join(pkg.root, 'src', 'cli', 'startup.mjs')).isFile()) return null;
    if (!/startup:\s*['"]startup\.mjs['"]/.test(fs.readFileSync(pkg.entry, 'utf8'))) return null;
    return pkg.entry;
  } catch { return null; }
}
export function resolveStartupEntry({ runningEntry, roots = [], override = process.env.TR_STARTUP_CLI } = {}) {
  const current = packageFor(runningEntry);
  if (override) { const selected = verifyEntry(override, current.manifest.name); if (!selected) throw new Error('Configured startup CLI failed package/entry validation'); return selected; }
  const native = verifyEntry(current.entry, current.manifest.name); if (native) return native;
  const candidates = new Set();
  for (const root of roots) {
    try { const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')); const bin = manifest.bin?.['total-recall']; if (typeof bin === 'string') { const selected = verifyEntry(path.resolve(root, bin), current.manifest.name); if (selected) candidates.add(selected); } } catch {}
  }
  if (candidates.size !== 1) throw new Error(candidates.size ? 'Multiple registered startup sources; configure TR_STARTUP_CLI explicitly' : 'No verified registered startup source; installed CLI has no startup support');
  return [...candidates][0];
}
export async function runStartupCheck(options) {
  const entry = resolveStartupEntry(options);
  const { root } = packageFor(entry);
  const handler = await import(pathToFileURL(path.join(root, 'src', 'cli', 'startup.mjs')));
  await handler.default(options.args || ['check', '--json']);
}
