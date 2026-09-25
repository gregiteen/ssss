#!/usr/bin/env node
/**
 * Confirm a release landed on npm: wait for the version to appear (the
 * registry can lag a few minutes after `npm publish`), then check that its
 * gitHead equals the v<version> tag commit on origin and that `latest`
 * points at it.
 *
 * Usage: node skills/push/scripts/verify-publish.mjs <version> [--timeout-seconds N]
 */
import { execFileSync } from 'node:child_process';

const PACKAGE = '@gregiteen/ssss-cli';
const [version] = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
const timeoutFlag = process.argv.indexOf('--timeout-seconds');
const timeoutSeconds = timeoutFlag > 0 ? Number(process.argv[timeoutFlag + 1]) : 600;

if (!version) {
  console.error('Usage: verify-publish.mjs <version> [--timeout-seconds N]');
  process.exit(2);
}

function npmView(field) {
  try {
    return execFileSync('npm', ['view', `${PACKAGE}@${version}`, field], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

const tagLine = execFileSync('git', ['ls-remote', '--tags', 'origin', `refs/tags/v${version}`], { encoding: 'utf8' }).trim();
const tagCommit = tagLine.split(/\s+/)[0];
if (!tagCommit) {
  console.error(`❌ Tag v${version} is not on origin. Push the tag before publishing.`);
  process.exit(1);
}

const deadline = Date.now() + timeoutSeconds * 1000;
let gitHead = npmView('gitHead');
while (!gitHead && Date.now() < deadline) {
  console.log(`… ${PACKAGE}@${version} not visible on npm yet; checking again in 15s`);
  await new Promise((resolve) => setTimeout(resolve, 15_000));
  gitHead = npmView('gitHead');
}
if (!gitHead) {
  console.error(`❌ ${PACKAGE}@${version} did not appear on npm within ${timeoutSeconds}s.`);
  process.exit(1);
}

const latest = execFileSync('npm', ['view', PACKAGE, 'dist-tags.latest'], { encoding: 'utf8' }).trim();
const problems = [];
if (gitHead !== tagCommit) problems.push(`gitHead ${gitHead} does not match tag v${version} commit ${tagCommit}`);
if (latest !== version) problems.push(`dist-tag latest is ${latest}, not ${version}`);

if (problems.length) {
  for (const problem of problems) console.error(`❌ ${problem}`);
  process.exit(1);
}
console.log(`✅ ${PACKAGE}@${version} is on npm as latest, built from tag v${version} (${tagCommit}).`);
