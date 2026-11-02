import {fileURLToPath} from 'node:url'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import {execFileSync} from 'node:child_process'; import assert from 'node:assert/strict';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'ssss-helper-')); const source=path.join(root,'source'),brain=path.join(root,'brain'),repo=path.join(root,'repo'),helper=fileURLToPath(new URL('../core/scripts/maintain.mjs', import.meta.url));
try {
 fs.mkdirSync(path.join(source,'core'),{recursive:true});fs.writeFileSync(path.join(source,'SKILL.md'),'---\nname: ssss\ndescription: portable\nversion: 0.12.1\n---\n# Portable\n');fs.writeFileSync(path.join(source,'core/SKILL.md'),'# Current protocol\n');
 const wrapper=path.join(repo,'.agent/skills/ssss/SKILL.md');fs.mkdirSync(path.dirname(wrapper),{recursive:true});fs.writeFileSync(wrapper,'---\nname: ssss\n---\n# Keep authored local instructions\n');
 const run=(apply)=>JSON.parse(execFileSync(process.execPath,[helper,'--source',source,'--brain',brain,'--shared-root',repo,...(apply?['--apply']:[])],{encoding:'utf8'}));
 assert.equal(run(false).apply,false);assert(!fs.existsSync(path.join(path.dirname(wrapper),'core')));
 const first=run(true);assert.equal(first.failed,0);assert.equal(first.updated,1);assert(fs.readFileSync(wrapper,'utf8').includes('Keep authored local instructions'));
 const second=run(true);assert.equal(second.updated,0);assert.equal(second.failed,0);assert(!fs.existsSync(second.backup));
 console.log('PASS portable helper dry-run, preserve authored wrapper, deploy managed core, independent hash verification and idempotent no-op');
} finally {fs.rmSync(root,{recursive:true,force:true});}
