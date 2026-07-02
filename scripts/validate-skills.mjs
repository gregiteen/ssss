#!/usr/bin/env node
/**
 * Skill-package conformance: every skill shipped under skills/ (tracked,
 * published — as opposed to an agent tool's local .agent/skills/ vendor
 * copy) must (a) validate as an SSSS `skill` primitive per
 * registry/core.json, and (b) satisfy the skill package's own required
 * directory structure (scripts/, references/, evals/, subagents/, each
 * non-empty, evals/evals.json with 3+ assertions).
 *
 * This is the automatic backstop for a bug this repo actually shipped: the
 * skill-format guide told agents `type: skill` was a frontmatter
 * anti-pattern, when registry/core.json and docs/ssss-spec.md §5.4 both
 * REQUIRE it. Every skill in this repo silently violated its own spec.
 * Wired into `ssss conformance` (scripts/conformance.mjs) so that class of
 * drift can't recur unnoticed.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRegistries } from '../src/registry.mjs';
import { parseDocument } from '../src/frontmatter.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SKILLS_DIR = path.resolve(__dirname, '..', 'skills');
const REQUIRED_DIRS = ['scripts', 'references', 'evals', 'subagents'];
const MIN_EVALS = 3;
const NAME_RE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

function nonEmptyRealFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f !== '.gitkeep' && !f.startsWith('.'));
}

/**
 * @returns {string[]} human-readable problem descriptions; empty = fully conformant.
 */
export function validateSkills(skillsDir = SKILLS_DIR) {
  const problems = [];
  if (!fs.existsSync(skillsDir)) return problems; // nothing shipped yet is not an error

  const { types, core } = loadRegistries();
  const skillDef = types.get('skill');
  if (!skillDef) {
    problems.push("registry/core.json no longer defines a 'skill' primitive — validate-skills.mjs is stale.");
    return problems;
  }
  const requiredFields = [
    ...new Set([
      ...(core.universal_frontmatter?.required || ['type']),
      ...(skillDef.required_fields || ['type', 'name', 'description']),
    ]),
  ];

  const entries = fs.readdirSync(skillsDir, { withFileTypes: true }).filter((e) => e.isDirectory());
  for (const entry of entries) {
    const name = entry.name;
    const dir = path.join(skillsDir, name);
    const skillMd = path.join(dir, 'SKILL.md');

    if (!fs.existsSync(skillMd)) {
      problems.push(`skills/${name}/: missing SKILL.md (canonical filename, spec §4.4).`);
      continue;
    }

    // ── Frontmatter: must validate against the registry's skill primitive ──
    const { data } = parseDocument(fs.readFileSync(skillMd, 'utf8'));
    for (const field of requiredFields) {
      if (data[field] === undefined || data[field] === null || data[field] === '') {
        problems.push(`skills/${name}/SKILL.md: missing required field '${field}' (registry/core.json skill primitive).`);
      }
    }
    if (data.type !== undefined && data.type !== 'skill') {
      problems.push(`skills/${name}/SKILL.md: type is '${data.type}', expected 'skill'.`);
    }
    if (data.name !== undefined && data.name !== name) {
      problems.push(`skills/${name}/SKILL.md: frontmatter name '${data.name}' does not match its directory name '${name}' (spec §13 naming convention).`);
    }
    if (!NAME_RE.test(name)) {
      problems.push(`skills/${name}/: directory name is not kebab-case (spec §13 naming convention).`);
    }

    // ── Required directory structure ──
    for (const sub of REQUIRED_DIRS) {
      const files = nonEmptyRealFiles(path.join(dir, sub));
      if (!files.length) {
        problems.push(`skills/${name}/${sub}/: required and must contain at least one real file (a bare .gitkeep does not count).`);
      }
    }

    // ── evals/evals.json shape ──
    const evalsPath = path.join(dir, 'evals', 'evals.json');
    if (fs.existsSync(evalsPath)) {
      try {
        const evals = JSON.parse(fs.readFileSync(evalsPath, 'utf8'));
        if (!Array.isArray(evals) || evals.length < MIN_EVALS) {
          problems.push(`skills/${name}/evals/evals.json: must be an array of at least ${MIN_EVALS} assertions (found ${Array.isArray(evals) ? evals.length : 'non-array'}).`);
        }
      } catch (err) {
        problems.push(`skills/${name}/evals/evals.json: invalid JSON (${err.message}).`);
      }
    }
  }

  return problems;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const problems = validateSkills();
  if (problems.length) {
    console.error('❌ Skill conformance failed:');
    for (const p of problems) console.error(`   • ${p}`);
    process.exit(1);
  }
  console.log('✅ Skill conformance: every shipped skill validates against the skill primitive and required directory structure.');
}
