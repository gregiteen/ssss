#!/usr/bin/env bash
set -euo pipefail
skill_root="$(cd -- "$(dirname -- "$0")/.." && pwd)"
docs_root="${1:-docs/projects}"
if [ ! -d "$docs_root" ]; then
  echo "Local documentation validation failed: project directory does not exist: $docs_root" >&2
  exit 1
fi
node "$skill_root/scripts/check-audit.mjs" "$docs_root"
echo "Local project audit checks passed. Remote issue state was not validated."
