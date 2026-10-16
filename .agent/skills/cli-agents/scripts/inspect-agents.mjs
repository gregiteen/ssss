#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';

export const KNOWN_BINARIES = ['codex','claude','agy','gemini','copilot','agent','cursor-agent','opencode','aider','goose','cline','kiro-cli','q','amp','droid','vibe','ollama','grok','antigravity'];
export function findBinary(name, env=process.env) {
  if(!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(name))throw new Error('Expected a binary name, not a path or shell expression');
  const dirs=[...(env.PATH||'').split(path.delimiter),path.join(os.homedir(),'.local','bin')];
  for(const dir of [...new Set(dirs.filter(Boolean))]) {
    const target=path.join(dir,name);
    try {const stat=fs.statSync(target);fs.accessSync(target,fs.constants.X_OK);if(stat.isFile())return target;} catch {}
  }
  return null;
}
export function inspect(name) {
  const binary=findBinary(name);
  if(!binary)return {name,binary_discovered:false,authenticated:'unknown',execution_verified:false};
  const real=fs.realpathSync(binary);
  // Do not execute the known API-wrapper alias during discovery.
  if(name==='antigravity')return {name,binary,physical_path:real,binary_discovered:true,version_verified:false,authenticated:'unknown',execution_verified:false,note:'Inspect identity; do not confuse this name with agy or assume subscription billing'};
  const result=spawnSync(binary,['--version'],{encoding:'utf8',timeout:8000,maxBuffer:65536,shell:false});
  const text=(result.stdout||result.stderr||'').trim();
  const version=text.match(/\b\d+\.\d+(?:\.\d+)?(?:[-+][\w.-]+)?\b/)?.[0]||null;
  return {name,binary,physical_path:real,binary_discovered:true,version_verified:result.status===0&&!!version,version,probe_failed:result.status!==0,authenticated:'unknown',execution_verified:false};
}
function main(args) {
  if(args.includes('--help')) {console.log('Usage: node inspect-agents.mjs [--binary NAME ...]\nRead-only PATH and bounded version probes; no prompt, auth dump, install or provider-key lookup.');return;}
  const names=new Set(KNOWN_BINARIES);
  for(let i=0;i<args.length;i++) {if(args[i]!=='--binary'||!args[i+1])throw new Error('Use --binary NAME');names.add(args[++i]);}
  console.log(JSON.stringify({scope:'local executable discovery; not auth or task proof',agents:[...names].map(inspect)},null,2));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(fs.realpathSync(process.argv[1])).href) {
  try {main(process.argv.slice(2));}catch(error){console.error(error.message);process.exitCode=1;}
}
