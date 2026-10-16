import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveStartupEntry } from '../scripts/resolve-startup-entry.mjs';
function pkg(root, name, native) { fs.mkdirSync(path.join(root,'bin'),{recursive:true});fs.writeFileSync(path.join(root,'package.json'),JSON.stringify({name,bin:{'total-recall':'bin/total-recall.mjs'}}));fs.writeFileSync(path.join(root,'bin','total-recall.mjs'),native?"const COMMANDS = { startup: 'startup.mjs' };":"const COMMANDS = {};");if(native){fs.mkdirSync(path.join(root,'src','cli'),{recursive:true});fs.writeFileSync(path.join(root,'src','cli','startup.mjs'),'export default()=>{}');}return path.join(root,'bin','total-recall.mjs');}
test('registered source compatibility is unique, identity checked and alias aware',()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'start-resolver-'));
 try {const old=pkg(path.join(temp,'old'),'example-cli',false);const source=pkg(path.join(temp,'source'),'example-cli',true);const wrong=pkg(path.join(temp,'wrong'),'other-cli',true);
 assert.equal(resolveStartupEntry({runningEntry:old,roots:[path.join(temp,'source'),path.join(temp,'wrong')],override:null}),fs.realpathSync(source));
 assert.throws(()=>resolveStartupEntry({runningEntry:old,roots:[],override:null}),/No verified/);
 const second=pkg(path.join(temp,'second'),'example-cli',true);assert.throws(()=>resolveStartupEntry({runningEntry:old,roots:[path.join(temp,'source'),path.join(temp,'second')],override:null}),/Multiple/);
 assert.equal(resolveStartupEntry({runningEntry:old,roots:[],override:second}),fs.realpathSync(second));assert.throws(()=>resolveStartupEntry({runningEntry:old,override:wrong}),/validation/);
 const alias=path.join(temp,'alias');fs.symlinkSync(source,alias);assert.equal(resolveStartupEntry({runningEntry:alias,override:null}),fs.realpathSync(source));
 } finally {fs.rmSync(temp,{recursive:true});}
});
