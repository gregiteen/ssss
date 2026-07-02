#!/usr/bin/env bash
# ============================================================
# SSSS — Version Release Script
#
# Bumps the VERSION file and adds a stub in CHANGELOG.md
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

echo "$NEW_VERSION" > VERSION

# Quick sed to insert new version at the top of the changelog
sed -i.bak "/^## \[.*\]/i \\
## [$NEW_VERSION] - $(date +%Y-%m-%d)\\
### Added\\
- \\
\\
" CHANGELOG.md

rm -f CHANGELOG.md.bak

echo "✅ Bumped version to $NEW_VERSION"
