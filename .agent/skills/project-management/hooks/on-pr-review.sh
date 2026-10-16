#!/usr/bin/env bash
set -euo pipefail
skill_root="$(cd -- "$(dirname -- "$0")/.." && pwd)"
"$skill_root/hooks/on-issue-update.sh" "${1:-docs/projects}"
echo "Local documentation prerequisite checked. This hook does not approve a PR or validate remote review state."
