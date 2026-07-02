#!/bin/bash
# create-skill.sh — Scaffold a new Dev Skill from the template
#
# Usage: bash .agent/skills/skill/scripts/create-skill.sh <skill-name>
# Example: bash .agent/skills/skill/scripts/create-skill.sh my-new-skill

set -euo pipefail

SKILL_NAME="${1:-}"

if [ -z "$SKILL_NAME" ]; then
  echo "❌ Usage: bash create-skill.sh <skill-name>"
  echo "   Example: bash create-skill.sh my-new-skill"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"
SKILLS_DIR="$ROOT/.agent/skills"
TARGET="$SKILLS_DIR/$SKILL_NAME"

if [ -d "$TARGET" ]; then
  echo "❌ Skill '$SKILL_NAME' already exists at $TARGET"
  exit 1
fi

echo "📦 Creating skill: $SKILL_NAME"

# Create directory structure
mkdir -p "$TARGET"/{scripts,references}

# Create SKILL.md with frontmatter template
cat > "$TARGET/SKILL.md" << EOF
---
name: $SKILL_NAME
description: "TODO: Write a trigger-optimized description. Format: WHAT it does + WHEN to use it + WHEN NOT to use it. Under 1024 chars."
---

# $SKILL_NAME

> TODO: Write procedural instructions for this skill.

## Step 1: [First Action]

TODO: Describe the first step.

## Step 2: [Second Action]

TODO: Describe the second step.

## References

- If you need X, see \`references/X.md\`
EOF

echo "✅ Created $TARGET/SKILL.md"
echo "✅ Created $TARGET/scripts/"
echo "✅ Created $TARGET/references/"
echo ""
echo "📝 Next steps:"
echo "  1. Edit $TARGET/SKILL.md with real instructions"
echo "  2. Write a trigger-optimized description in the frontmatter"
echo "  3. Run: node .agent/skills/skill/scripts/update-skill-index.mjs"
echo ""
echo "🏁 Done."
