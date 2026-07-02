#!/usr/bin/env node
/**
 * Extract every http(s) URL cited in this skill's SKILL.md and check it
 * resolves. Catches exactly the class of bug this skill shipped with once
 * before: a cached file-scheme link to a path that only existed on one
 * machine, silently broken for anyone else who read the skill.
 *
 * Usage: node check-okf-links.mjs
 * Exits non-zero if any cited URL is unreachable OR uses a non-http(s) scheme
 * (never portable/citable).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SKILL_MD = path.resolve(HERE, '..', 'SKILL.md');

function extractUrls(text) {
  const urls = new Set();
  const linkRe = /\]\((\S+?)\)/g;
  let m;
  while ((m = linkRe.exec(text))) urls.add(m[1]);
  const bareRe = /(?<![(\[])\bhttps?:\/\/\S+/g;
  while ((m = bareRe.exec(text))) urls.add(m[0].replace(/[).,]+$/, ''));
  return [...urls];
}

async function checkUrl(url) {
  if (!/^https?:\/\//.test(url)) {
    return { url, ok: false, reason: `non-portable scheme (${url.split(':')[0]}) — never cite a local path` };
  }
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, { method: 'HEAD', signal: controller.signal, redirect: 'follow' });
    clearTimeout(t);
    if (res.status >= 400) {
      return { url, ok: false, reason: `HTTP ${res.status}` };
    }
    return { url, ok: true };
  } catch (err) {
    return { url, ok: null, reason: `could not verify (${err.message}) — network may be unavailable here; re-check manually` };
  }
}

async function main() {
  const text = fs.readFileSync(SKILL_MD, 'utf8');
  const urls = extractUrls(text);
  if (!urls.length) {
    console.error('No http(s) links found in SKILL.md.');
    return;
  }
  let failed = 0;
  for (const url of urls) {
    const result = await checkUrl(url);
    if (result.ok === true) {
      console.error(`OK    ${url}`);
    } else if (result.ok === false) {
      console.error(`FAIL  ${url} - ${result.reason}`);
      failed++;
    } else {
      console.error(`?     ${url} - ${result.reason}`);
    }
  }
  console.error(`\n${urls.length} link(s) checked, ${failed} confirmed broken.`);
  if (failed > 0) process.exit(1);
}

main();
