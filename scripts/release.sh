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
