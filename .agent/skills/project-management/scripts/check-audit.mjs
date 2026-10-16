#!/usr/bin/env node
/**
 * Enforces "every project starts with an audit".
 *
 *   node check-audit.mjs [docs/projects]      # checks every project folder
 *
 * A project folder fails when it has any of PRD / ARCHITECTURE / DEVELOPMENT_PLAN /
 * PROJECT_TRACKER but no complete <PREFIX>_AUDIT.md, or the audit is missing sections.
 * Exit 1 on any failure. Folders listed in <docs>/AUDIT_EXEMPT.txt (one prefix per
 * line, for projects that predate the rule) are reported but not failed.
 */
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.argv[2] || 'docs/projects');
const STATES = ['in-progress', 'planned', 'backlog'];
const OTHERS = ['PRD', 'ARCHITECTURE', 'DEVELOPMENT_PLAN', 'PROJECT_TRACKER'];
const SECTIONS = [/scope and method/i, /inventory/i, /runtime surface/i, /data and state/i, /integrations/i, /security and privacy/i, /standing-rule conflicts/i, /quality baseline/i, /debt and dead code/i, /deploy and operations/i, /content and product fit/i, /findings register/i, /impact on the requested change/i, /decisions/i];
const exemptFile = path.join(root, 'AUDIT_EXEMPT.txt');
const exempt = new Set(fs.existsSync(exemptFile) ? fs.readFileSync(exemptFile, 'utf8').split('\n').map((l) => l.trim()).filter(Boolean) : []);

let failed = 0;
for (const state of STATES) {
  const dir = path.join(root, state);
  if (!fs.existsSync(dir)) continue;
  for (const prefix of fs.readdirSync(dir)) {
    const folder = path.join(dir, prefix);
    if (!fs.statSync(folder).isDirectory()) continue;
    const files = fs.readdirSync(folder);
    const hasOthers = OTHERS.some((k) => files.includes(`${prefix}_${k}.md`));
    if (!hasOthers) continue;
    const audit = path.join(folder, `${prefix}_AUDIT.md`);
    const problems = [];
    if (!fs.existsSync(audit)) problems.push('no AUDIT document');
    else {
      const text = fs.readFileSync(audit, 'utf8');
      if (!/Audit Status\*\*:\s*Complete/i.test(text)) problems.push('Audit Status is not Complete');
      if (!/Audited commit\*\*:\s*[0-9a-f]{7,40}/i.test(text)) problems.push('no audited commit hash');
      for (const re of SECTIONS) if (!re.test(text)) problems.push(`missing section: ${re.source}`);
      if (!/\|\s*A-\d{3}\s*\|/.test(text)) problems.push('findings register has no A-nnn rows');
    }
    if (problems.length) {
      const tag = exempt.has(prefix) ? 'EXEMPT' : 'FAIL';
      if (tag === 'FAIL') failed++;
      console.log(`${tag}  ${state}/${prefix}: ${problems.join('; ')}`);
    } else console.log(`ok    ${state}/${prefix}`);
  }
}
process.exit(failed ? 1 : 0);
