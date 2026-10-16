// Body for total-recall command create startup-check --global.
// Registration is performed by the owning session, not by merely importing this reference.
const { realpathSync } = await import('node:fs');
const { dirname, join } = await import('node:path');
const { pathToFileURL } = await import('node:url');
const runningEntry = realpathSync(process.argv[1]);
const packageRoot = dirname(dirname(runningEntry));
const { loadKnownRepoRoots, loadRegistry } = await import(pathToFileURL(join(packageRoot, 'src/core/skills-registry.mjs')));
const { resolveBrainLayer } = await import(pathToFileURL(join(packageRoot, 'src/core/config.mjs')));
const brainDir = resolveBrainLayer('global').brainDir;
const source = loadRegistry(brainDir).skills?.start?.source_path;
if (!source) throw new Error('Shared start source is not registered');
const { runStartupCheck } = await import(pathToFileURL(join(source, 'scripts/resolve-startup-entry.mjs')));
await runStartupCheck({ runningEntry, roots: loadKnownRepoRoots(brainDir), args: process.argv.slice(3) });
