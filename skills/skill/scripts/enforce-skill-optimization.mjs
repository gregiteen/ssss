/**
 * enforce-skill-optimization.mjs
 *
 * Pre-commit validation for the skill ecosystem.
 * Ensures every skill in .agent/skills/ meets the canonical format:
 *   - SKILL.md with proper name + description frontmatter
 *   - All required directories exist with real content
 *   - evals/evals.json has ≥3 assertions
 *
 * Exit code 1 = validation failed (blocks commit)
 * Exit code 0 = all skills valid
 */

import fs from 'node:fs';
import path from 'node:path';

const SKILLS_DIR = path.join(process.cwd(), '.agent/skills');
const REQUIRED_DIRS = ['scripts', 'references', 'evals', 'subagents'];

function parseYamlFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;

  const fields = {};
  for (const line of match[1].split('\n')) {
    const kv = line.match(/^(\w+):\s*(.+)/);
    if (kv) {
      fields[kv[1]] = kv[2].replace(/^["']|["']$/g, '');
    }
  }
  return fields;
}

function hasRealContent(dirPath) {
  if (!fs.existsSync(dirPath)) return false;
  const entries = fs.readdirSync(dirPath);
  return entries.some(e => e !== '.gitkeep');
}

function checkSkills() {
  if (!fs.existsSync(SKILLS_DIR)) {
    console.error('⚠️  No .agent/skills/ directory found. Skipping.');
    process.exit(0);
  }

  const dirs = fs.readdirSync(SKILLS_DIR).filter(d =>
    fs.statSync(path.join(SKILLS_DIR, d)).isDirectory()
  );

  const errors = [];
  const warnings = [];

  for (const skillName of dirs) {
    const skillPath = path.join(SKILLS_DIR, skillName);
    const skillMd = path.join(skillPath, 'SKILL.md');

    // ── SKILL.md must exist ──────────────────────────────────────────────
    if (!fs.existsSync(skillMd)) {
      errors.push(`${skillName}: Missing SKILL.md`);
      continue;
    }

    const content = fs.readFileSync(skillMd, 'utf8');
    const frontmatter = parseYamlFrontmatter(content);

    // ── Frontmatter must have name + description ─────────────────────────
    if (!frontmatter) {
      errors.push(`${skillName}: SKILL.md has no YAML frontmatter`);
    } else {
      if (!frontmatter.name) {
        errors.push(`${skillName}: frontmatter missing 'name' field (has '${Object.keys(frontmatter).join(', ')}' instead)`);
      } else if (frontmatter.name !== skillName) {
        warnings.push(`${skillName}: frontmatter name '${frontmatter.name}' doesn't match folder name '${skillName}'`);
      }

      if (!frontmatter.description) {
        errors.push(`${skillName}: frontmatter missing 'description' field`);
      }

      // Warn about SSSS memory node fields leaking into skill frontmatter
      const badFields = ['type', 'slug', 'category', 'schema_version', 'importance', 'priority', 'modality'];
      const found = badFields.filter(f => frontmatter[f]);
      if (found.length > 0) {
        errors.push(`${skillName}: frontmatter contains SSSS memory node fields (${found.join(', ')}). Skills use only 'name' and 'description'.`);
      }
    }

    // ── Required directories ─────────────────────────────────────────────
    for (const reqDir of REQUIRED_DIRS) {
      const dirPath = path.join(skillPath, reqDir);
      if (!fs.existsSync(dirPath)) {
        errors.push(`${skillName}: missing required directory: ${reqDir}/`);
      } else if (!hasRealContent(dirPath)) {
        warnings.push(`${skillName}: ${reqDir}/ has no real content (only .gitkeep). Consider adding domain-specific files.`);
      }
    }

    // ── evals.json quality check ─────────────────────────────────────────
    const evalsPath = path.join(skillPath, 'evals', 'evals.json');
    if (fs.existsSync(evalsPath)) {
      try {
        const evals = JSON.parse(fs.readFileSync(evalsPath, 'utf8'));
        if (!Array.isArray(evals)) {
          errors.push(`${skillName}: evals.json must be a JSON array`);
        } else if (evals.length < 3) {
          warnings.push(`${skillName}: evals.json has only ${evals.length} assertion(s) — minimum 3 recommended`);
        }
      } catch {
        errors.push(`${skillName}: evals.json is invalid JSON`);
      }
    }
  }

  // ── Report ───────────────────────────────────────────────────────────────
  if (warnings.length > 0) {
    console.error('\n⚠️  Warnings:');
    for (const w of warnings) console.error(`   ${w}`);
  }

  if (errors.length > 0) {
    console.error('\n❌ Errors:');
    for (const e of errors) console.error(`   ${e}`);
    console.error(`\n🚨 SKILL ENFORCEMENT FAILED — ${errors.length} error(s) found.`);
    console.error('   Fix the errors above before committing.\n');
    process.exit(1);
  }

  console.error(`\n✅ All ${dirs.length} skills passed enforcement checks.`);
  if (warnings.length > 0) {
    console.error(`   (${warnings.length} warning(s) — not blocking)\n`);
  }
  process.exit(0);
}

checkSkills();
