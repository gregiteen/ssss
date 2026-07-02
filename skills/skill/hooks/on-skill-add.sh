#!/bin/bash
# on-skill-add.sh — Auto-regenerate the skill routing table when a new skill is added.
#
# Trigger: Run after creating a new skill via create-skill.sh or manually.
# Action: Runs update-skill-index.mjs to sync the routing table and INSTRUCTIONS.md.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"

echo "🔄 OnSkillAdd hook triggered — regenerating skill index..."
node "$ROOT/.agent/skills/skill/scripts/update-skill-index.mjs"
echo "✅ Routing table and INSTRUCTIONS.md updated."
