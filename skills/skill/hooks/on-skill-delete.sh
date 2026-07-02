#!/bin/bash
# on-skill-delete.sh — Auto-clean the skill routing table when a skill is removed.
#
# Trigger: Run after deleting a skill directory.
# Action: Runs update-skill-index.mjs to sync the routing table and INSTRUCTIONS.md.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"

echo "🧹 OnSkillDelete hook triggered — cleaning skill index..."
node "$ROOT/.agent/skills/skill/scripts/update-skill-index.mjs"
echo "✅ Routing table and INSTRUCTIONS.md cleaned."
