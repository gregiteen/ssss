import chokidar from 'chokidar';
import { execFileSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '../../../../');
const SKILLS_DIR = path.join(ROOT, '.agent/skills');

const hooks = {
  add: path.join(SKILLS_DIR, 'skill/hooks/on-skill-add.sh'),
  delete: path.join(SKILLS_DIR, 'skill/hooks/on-skill-delete.sh'),
};

console.log(`\n👁️  Skill Watcher Daemon Started`);
console.log(`   Watching: ${SKILLS_DIR}/**/SKILL.md`);

// Debounce state
let timeoutId = null;
let pendingActions = new Set();

function executeHooks() {
  const actions = Array.from(pendingActions);
  pendingActions.clear();

  try {
    if (actions.includes('add') || actions.includes('change')) {
      console.log(`\n[Watcher] Triggering on-skill-add.sh...`);
      execFileSync('bash', [hooks.add], { stdio: 'inherit' });
    } else if (actions.includes('unlink')) {
      console.log(`\n[Watcher] Triggering on-skill-delete.sh...`);
      execFileSync('bash', [hooks.delete], { stdio: 'inherit' });
    }
  } catch (error) {
    console.error(`\n[Watcher] Hook execution failed: ${error.message}`);
  }
}

function queueAction(action) {
  pendingActions.add(action);
  if (timeoutId) clearTimeout(timeoutId);
  // Debounce for 1.5 seconds to batch file saves
  timeoutId = setTimeout(executeHooks, 1500);
}

chokidar.watch(path.join(SKILLS_DIR, '**/SKILL.md'), {
  ignored: /(^|[\/\\])\../, // ignore dotfiles
  persistent: true,
  ignoreInitial: true // Do not trigger on initial scan
})
.on('add', filePath => {
  console.log(`[Watcher] File added: ${path.relative(ROOT, filePath)}`);
  queueAction('add');
})
.on('change', filePath => {
  console.log(`[Watcher] File changed: ${path.relative(ROOT, filePath)}`);
  queueAction('change');
})
.on('unlink', filePath => {
  console.log(`[Watcher] File removed: ${path.relative(ROOT, filePath)}`);
  queueAction('unlink');
})
.on('error', error => console.error(`[Watcher] error: ${error}`));
