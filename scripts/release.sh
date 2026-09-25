#!/usr/bin/env bash
# ============================================================
# SSSS — Version Release Script
#
# Bumps VERSION, package.json and package-lock.json, and turns the
# CHANGELOG's [Unreleased] entries into a section for the new version
# (a stub when [Unreleased] is empty).
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
const text = fs.readFileSync("CHANGELOG.md", "utf8");
if (text.includes(`## [${version}]`)) process.exit(0);
const match = text.match(/^## \[Unreleased\]\n([\s\S]*?)(?=^## \[)/m);
if (!match) { console.error("CHANGELOG.md has no ## [Unreleased] section followed by a release."); process.exit(1); }
const entries = match[1].trim() || "### Added\n- ";
const section = `## [Unreleased]\n\n## [${version}] - ${date}\n${entries}\n\n`;
fs.writeFileSync("CHANGELOG.md", text.replace(match[0], section));
' "$NEW_VERSION" "$(date +%Y-%m-%d)"

echo "✅ Bumped version to $NEW_VERSION (VERSION, package.json, package-lock.json, CHANGELOG.md)"
