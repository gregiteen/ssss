/** Portable owner helper: preserve local wrappers, deploy managed SSSS core, verify every eligible consumer. */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2);
const value = flag => { const i=args.indexOf(flag); return i<0 ? null : args[i+1]; };
const source = path.resolve(value('--source') || path.join(path.dirname(fileURLToPath(import.meta.url)), '../..'));
const apply = args.includes('--apply');
const executable = execFileSync('which',['total-recall'],{encoding:'utf8'}).trim();
const packageRoot = path.resolve(path.dirname(fs.realpathSync(executable)), '..');
const api = await import(pathToFileURL(path.join(packageRoot,'src/core/skills-registry.mjs')));
const brain = path.resolve(value('--brain') || path.join(os.homedir(),'.agent/skills/total-recall'));
const sharedRoot = path.resolve(value('--shared-root') || os.homedir());
const registry = api.loadRegistry(brain);
const expectedCore = api.hashSkillLayer(source,'core');
if (!expectedCore || !fs.existsSync(path.join(source,'SKILL.md'))) throw new Error('Invalid source-owned portable SSSS package');
const known = api.loadKnownRepoRoots(brain,{includeCwd:false});
const targets = new Set([sharedRoot, ...known]);
const rows = registry.installs.filter(row=>row.skill_id==='ssss');
const obsolete = rows.filter(row=>row.repo && !fs.existsSync(row.repo)).map(row=>({path:row.path,repo:row.repo,status:'obsolete_repository',required:false}));
const stamp = new Date().toISOString().replace(/[:.]/g,'-');
const backup = path.join(brain,'skill-package-history','ssss',stamp);
const results=[];
if (apply) api.registerSkill(brain,source,{source:source,source_type:'portable-owner-package',authoritative_scope:true});
for (const root of targets) {
  if (!fs.existsSync(root)) { results.push({repo:root,status:'missing_repository',required:true}); continue; }
  let destination=path.join(root,'.agent/skills/ssss');
  let alias=null;
  try {
    if(fs.existsSync(destination) && fs.lstatSync(destination).isSymbolicLink()) {
      alias=destination; destination=fs.realpathSync(destination);
      if (api.readSkillMeta(destination).id !== 'ssss') throw new Error('Shared alias does not identify an SSSS skill');
    }
    if (!apply) { results.push({repo:root,path:destination,status:'would_deploy',required:true}); continue; }
    const priorWrapper=path.join(destination,'SKILL.md');
    const routed=fs.existsSync(priorWrapper) && /(?:core\/SKILL\.md|total-recall:managed-core-route:v1)/.test(fs.readFileSync(priorWrapper,'utf8'));
    if(api.hashSkillLayer(destination,'core')===expectedCore && routed) {
      results.push({repo:root,path:destination,status:'verified',required:true,expected_core:expectedCore,observed_core:expectedCore,wrapper_preserved:true,changed:false,...(alias?{alias}: {})});
      continue;
    }
    // Snapshot the package only, never a vault/database or unrelated skill.
    if(fs.existsSync(destination)) {
      const id=Buffer.from(root).toString('base64url');
      fs.cpSync(destination,path.join(backup,id),{recursive:true,dereference:false});
    }
    if (alias) {
      api.replaceSkillDir(path.join(source,'core'),path.join(destination,'core'),{requiredFile:null,preserveExisting:false});
      const mapped=api.loadRegistry(brain);
      mapped.installs=mapped.installs.filter(row=>!(row.skill_id==='ssss'&&row.path===alias));
      mapped.installs.push({skill_id:'ssss',path:alias,repo:root,layered:true,version:api.readSkillMeta(source).version,core_hash:expectedCore,repo_hash:api.hashSkillLayer(destination,'repo'),registry_hash:mapped.skills.ssss.content_hash,installed_at:new Date().toISOString()});
      api.saveRegistry(brain,mapped);
    } else api.deploySkill(brain,'ssss',{repo:root,routeCore:true});
    const wrapper=path.join(destination,'SKILL.md');
    const text=fs.readFileSync(wrapper,'utf8');
    const marker='<!-- total-recall:managed-core-route:v1 -->';
    if(!text.includes(marker) && !text.includes('(core/SKILL.md)')) fs.writeFileSync(wrapper,text.trimEnd()+`\n\n${marker}\nRead the [maintained portable core](core/SKILL.md) for current protocol contracts; preserve repository-specific instructions above.\n`);
    const observed=api.hashSkillLayer(destination,'core');
    results.push({repo:root,path:destination,status:observed===expectedCore?'verified':'hash_mismatch',required:true,expected_core:expectedCore,observed_core:observed,wrapper_preserved:true,changed:true,...(alias?{alias}: {})});
  } catch(error) { results.push({repo:root,path:destination,status:'error',required:true,error:error.message}); }
}
if(apply) {
  const updated=api.loadRegistry(brain);
  for(const row of updated.installs.filter(row=>row.skill_id==='ssss')) {
    row.obsolete=Boolean(row.repo && !fs.existsSync(row.repo));
    if(row.obsolete) row.obsolete_reason='Recorded repository no longer exists; retained for history, never recreated';
    else delete row.obsolete_reason;
  }
  api.saveRegistry(brain,updated);
}
const report={checked_at:new Date().toISOString(),apply,source,version:api.readSkillMeta(source).version,expected_core:expectedCore,backup:apply?backup:null,results,obsolete,updated:results.filter(row=>row.changed).length,failed:results.filter(row=>row.required&&!['verified','would_deploy'].includes(row.status)).length};
console.log(JSON.stringify(report,null,2));
if(report.failed)process.exitCode=1;
