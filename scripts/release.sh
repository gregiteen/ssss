#!/usr/bin/env bash
# ============================================================
# SSSS — Version Release Script
#
# Bumps VERSION, package.json, package-lock.json, and CHANGELOG.md,
# synchronizes skills/ssss and references, rebuilds the canonical
# reference bundle, generates the SBOM, and deploys the updated
# portable skill across all fleet repositories.
# ============================================================

set -euo pipefail

if [ "$#" -ne 1 ]; then
    echo "Usage: $0 <new-version>"
    exit 1
fi

NEW_VERSION=$1

if [[ ! "$NEW_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$ ]]; then
    echo "Invalid version: $NEW_VERSION"
    echo "Use semantic version format, e.g. 0.7.0 or 1.0.0-beta.1"
    exit 1
fi

cd "$(dirname "$0")/.."

echo "$NEW_VERSION" > VERSION
npm version "$NEW_VERSION" --no-git-tag-version --allow-same-version > /dev/null

node --input-type=module -e '
import fs from "node:fs";
const [version, date] = process.argv.slice(1);

// 1. CHANGELOG.md update
const changelogText = fs.readFileSync("CHANGELOG.md", "utf8");
if (!changelogText.includes(`## [${version}]`)) {
  const match = changelogText.match(/^## \[Unreleased\]\n([\s\S]*?)(?=^## \[)/m);
  if (!match) {
    console.error("CHANGELOG.md has no ## [Unreleased] section followed by a release.");
    process.exit(1);
  }
  const entries = match[1].trim() || "### Added\n- ";
  const section = `## [Unreleased]\n\n## [${version}] - ${date}\n${entries}\n\n`;
  fs.writeFileSync("CHANGELOG.md", changelogText.replace(match[0], section));
}

// 2. Synchronize portable skill packages
const skillDirs = ["skills/ssss", ".agent/skills/ssss"];
for (const dir of skillDirs) {
  if (!fs.existsSync(dir)) continue;

  // Root SKILL.md
  const skillFile = `${dir}/SKILL.md`;
  if (fs.existsSync(skillFile)) {
    let content = fs.readFileSync(skillFile, "utf8");
    content = content.replace(/^version:\s*[\d.-]+[^\r\n]*/m, `version: ${version}`);
    fs.writeFileSync(skillFile, content);
  }

  // Core SKILL.md
  const coreSkillFile = `${dir}/core/SKILL.md`;
  if (fs.existsSync(coreSkillFile)) {
    let content = fs.readFileSync(coreSkillFile, "utf8");
    content = content.replace(/^# SSSS portable core — [^\r\n]+/m, `# SSSS portable core — ${version}`);
    content = content.replace(/release tag v[\d.-]+[^\r\n]*/g, `release tag v${version}`);
    fs.writeFileSync(coreSkillFile, content);
  }

  // References sync
  const refDir = `${dir}/core/references`;
  if (fs.existsSync(refDir)) {
    if (fs.existsSync("docs/ssss-spec.md")) {
      fs.copyFileSync("docs/ssss-spec.md", `${refDir}/ssss-spec.md`);
    }
    if (fs.existsSync("registry/core.json")) {
      fs.copyFileSync("registry/core.json", `${refDir}/core-registry.json`);
    }
  }
}
' "$NEW_VERSION" "$(date +%Y-%m-%d)"

echo "✅ Bumped version to $NEW_VERSION (VERSION, package.json, package-lock.json, CHANGELOG.md, skills/ssss)"

echo "--- Rebuilding Reference Bundle ---"
node scripts/build-reference-bundle.mjs

echo "--- Generating Release SBOM ---"
node scripts/generate-sbom.mjs

echo "--- Propagating Portable Skill Across Fleet Repositories ---"
node skills/ssss/core/scripts/maintain.mjs --apply

echo "✅ Release preparation and local skill propagation complete for $NEW_VERSION."
