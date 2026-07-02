---
type: skill
title: Skill Architecture
name: skill
description: "Use this skill when creating, auditing, or modifying any skill package — including the ones shipped in this repo's skills/ directory. MANDATORY: You MUST read the full SKILL.md file before executing."
timestamp: 2026-07-02T00:00:00Z
---

# Skill Architecture — Canonical Format Guide

> **Version:** 2.1.0 | **Updated:** 2026-07-01

This is the definitive guide for how skills are structured, created, and maintained. Every agent that creates or modifies a skill MUST follow this spec exactly.

This copy is the one shipped as part of the SSSS repo (`skills/skill/`, tracked in
git) — it's identical in content to any local, gitignored copy an agent tool vendors
under `.agent/skills/skill/`, but this is the canonical, version-controlled source.

---

## 1. What is a Skill?

A skill is a **self-contained knowledge package** — kebab-case directory name matching
`skills/<skill-name>/` (spec §13 Naming Conventions), `SKILL.md` inside as its
canonical filename (spec §4.4). It gives an agent everything it needs to perform a
specific domain task correctly: instructions, executable scripts, reference material,
test criteria, and delegation prompts. A given host/tool MAY additionally vendor or
symlink skills into its own local directory (e.g. `.agent/skills/`, `.claude/skills/`)
— that's a discovery mechanism, not a second format.

Skills are NOT documentation. They are **executable expertise.**

---

## 2. Required Directory Structure

Every skill MUST contain these items. No exceptions.

```text
my-skill/
├── SKILL.md              # REQUIRED — The master instruction file
├── scripts/              # REQUIRED — Automation scripts
├── references/           # REQUIRED — Domain knowledge, specs, docs
├── evals/                # REQUIRED — Success criteria and tests
└── subagents/            # REQUIRED — Delegation prompts for subtasks
```

### Why all five are required

Agents will skip optional folders without a second thought. By requiring all five, we force the agent to **stop and think** about what belongs in each one. Even a hastily written eval or a minimal reference doc is infinitely more valuable than nothing — it can always be improved later.

---

## 3. SKILL.md — The Entrypoint

### Frontmatter (REQUIRED)

```yaml
---
type: skill
name: my-skill-name
description: "Use this skill when [TRIGGER CONDITION]. MANDATORY: You MUST read the full SKILL.md file before executing."
---
```

| Field | Rules |
|:---|:---|
| `type` | **Always `skill`.** This is SSSS's primitive discriminator (`registry/core.json` → `document_primitives.skill`, spec §5.4). It's an extra field to plain Agent-Skills-standard tooling (which only reads `name`/`description`) and REQUIRED for any SSSS-managed manifest, so it always belongs here — never omit it. |
| `name` | **Lowercase kebab-case.** Must exactly match the folder name. |
| `description` | **Trigger-optimized.** Must clearly state WHAT it does and WHEN to use it. Under 1024 chars. The IDE uses this string to decide when to show the skill — vague descriptions mean the skill never gets activated. |

A skill's frontmatter is simultaneously valid against two schemas — the open Agent
Skills standard (`name` + `description`, `type` ignored) and SSSS's `skill`
primitive (`type` + `name` + `description`, per `registry/core.json`). Since a
primitive schema's required fields are the *floor*, not the *ceiling*, adding
`type: skill` never breaks a non-SSSS consumer — it's just an extra field they
don't look at.

### ⛔ Frontmatter Anti-Patterns

```yaml
# ❌ WRONG — SSSS *memory-node* fields have no meaning on a skill primitive.
# (type: skill is CORRECT here — see above. It's slug/category/title/
# schema_version/importance/etc. that don't belong.)
slug: my-skill
category: architecture
title: "My Skill"
schema_version: 2
importance: 4
```

```yaml
# ✅ CORRECT — type + name + description
type: skill
name: my-skill
description: "Use this skill when doing X. MANDATORY: You MUST read the full SKILL.md file before executing."
```

### Body Content

The body of SKILL.md is the **master prompt** for the skill. Write it as procedural instructions that an agent can follow step-by-step. Include:

- **Context** — What problem does this skill solve?
- **Steps** — Numbered, concrete actions
- **Rules** — Hard constraints and invariants
- **Pitfalls** — What goes wrong and how to avoid it
- **Code examples** — Correct and incorrect patterns
- **References** — Pointers to files in `references/` for deeper context

---

## 4. scripts/ — Execution Layer

Contains executable code the agent runs via the sandbox to perform complex or deterministic operations.

**What belongs here:**
- Scaffolding scripts (e.g., `create-skill.sh`)
- Validation/linting scripts (e.g., `enforce-skill-optimization.mjs`)
- Watchers and cron-triggered automation (e.g., `watch.mjs`)
- Data transformation or migration scripts
- Any operation that should be deterministic rather than LLM-hallucinated

**Rules:**
- Scripts MUST be idempotent where possible
- Scripts MUST be self-contained (no implicit dependencies outside the skill)
- Scripts MUST handle errors gracefully with clear stderr output
- Use `console.error()` for logging, never `console.log()` in production scripts

**When creating a skill, ask yourself:** *"What operations in this domain should be automated with code instead of trusted to the LLM's judgment?"*

---

## 5. references/ — Domain Knowledge

Contains static reference documents the agent reads for context when the skill is activated.

**What belongs here:**
- API documentation or spec excerpts
- Schema definitions
- Configuration format guides
- Architecture decision records
- Links to external sources with cached key sections
- Example files or templates

**Rules:**
- Use Markdown (`.md`) files for text documentation
- Keep files focused — one topic per file
- Name files descriptively: `streamable-http-spec.md`, not `ref1.md`
- Include the source URL at the top of any extracted documentation

**When creating a skill, ask yourself:** *"What does an agent need to READ to understand this domain? What docs did I have to look up?"*

---

## 6. evals/ — Success Criteria

Contains assertions, test scripts, or evaluation criteria that verify the skill was executed correctly.

**What belongs here:**
- `evals.json` — Structured assertions (minimum 3)
- Test scripts that can be run in the sandbox
- Checklists of things to verify
- Expected output examples

**evals.json format:**
```json
[
  {
    "name": "frontmatter-has-name",
    "assertion": "SKILL.md YAML frontmatter contains a 'name' field",
    "severity": "error"
  },
  {
    "name": "description-is-trigger-optimized",
    "assertion": "description field starts with 'Use this skill when'",
    "severity": "warning"
  },
  {
    "name": "no-empty-directories",
    "assertion": "All required directories contain at least one non-.gitkeep file",
    "severity": "error"
  }
]
```

**When creating a skill, ask yourself:** *"How would I know if this skill was used correctly? What could go wrong? What should I check?"*

---

## 7. subagents/ — Delegation Prompts

Contains standalone prompt files for subtasks that can be delegated to parallel agents or focused workers.

**What belongs here:**
- Audit prompts (e.g., `audit-all-skills.md`)
- Review prompts (e.g., `review-output.md`)
- Specialized generation prompts (e.g., `generate-tests.md`)
- Decomposed subtask prompts for complex workflows

**Rules:**
- Each file is a complete, self-contained prompt
- Include role, context, constraints, and expected output format
- Name files as verbs: `audit-X.md`, `generate-Y.md`, `validate-Z.md`

**When creating a skill, ask yourself:** *"What parts of this task could be delegated to a focused subagent? What parallel work would speed this up?"*

---

## 8. Creating a New Skill

### Quick method (script):
```bash
bash .agent/skills/skill/scripts/create-skill.sh my-new-skill
```

### Manual method:
1. Create the folder: `.agent/skills/my-new-skill/`
2. Create `SKILL.md` with proper `type: skill` + `name` + `description` frontmatter
3. Create `scripts/`, `references/`, `evals/`, `subagents/` directories
4. Populate each directory — think deeply about what belongs in each one
5. Write `evals/evals.json` with at least 3 assertions

### The Deliberation Checklist

Before committing a new skill, answer ALL of these:

| Folder | Question |
|:---|:---|
| `SKILL.md` | Is the description trigger-optimized? Will the IDE activate this skill at the right time? |
| `scripts/` | What operations should be deterministic code, not LLM guesses? |
| `references/` | What domain knowledge does the agent need? What docs did I have to look up? |
| `evals/` | How do I know if this skill was used correctly? What could go wrong? |
| `subagents/` | What subtasks could be parallelized or delegated to a focused worker? |

---

## 9. Quality Enforcement

The enforcement script (`scripts/enforce-skill-optimization.mjs`) validates all skills on commit:

1. Every skill must have a `SKILL.md` with `name` and `description` frontmatter
2. All five directories must exist and contain at least one real file (`.gitkeep` alone doesn't count)
3. `evals/evals.json` must contain at least 3 assertions
4. No placeholder/TODO-only SKILL.md files in committed skills

---

## 10. Safe Integration of External Skills

When downloading, importing, or adding external skills from registries like `skills.sh` (via `npx skills add <name>`), agents and developers MUST perform security audits before executing any scripts:

1. **Verify Executable Scripts**: Open and scan all scripts under `scripts/`. Look for shell template strings with dynamic interpolation or unchecked execution arguments.
2. **Restrict Path Operations**: Ensure path references are validated and match regular expressions (e.g. `SAFE_NAME` pattern) to prevent path traversal vulnerabilities.
3. **Assert Sandbox Isolation**: Prefer executing unfamiliar external skill scripts inside isolated sandbox environments or containers to guarantee zero adverse host system impact.

---

## 11. Common Mistakes

| Mistake | Why It's Wrong | Fix |
|:---|:---|:---|
| Omitting `type: skill` | Not an IDE-discovery problem (the IDE only reads `name`/`description`), but it breaks SSSS conformance — the manifest won't validate against `registry/core.json`'s `skill` primitive. | Always include `type: skill` |
| Using `slug`/`category`/`schema_version`/`importance` in frontmatter | Those are SSSS *memory-node* fields, not skill fields — they have no meaning on the `skill` primitive. | Use `type`, `title`, `description`, `timestamp`, and `name` (plus any skill-specific fields you define) |
| Empty `references/` with just `.gitkeep` | Agent loses critical domain context | Add at least one reference doc — even a short one |
| Empty `evals/` | No way to verify the skill worked | Write 3+ assertions in `evals.json` |
| Vague description | `"A skill for doing stuff"` → IDE never triggers it | `"Use this skill when X. Do NOT use for Y."` |
| Mixing format spec with implementation details | Contaminates portable knowledge with project-specific internals | Keep format docs generic, put project details in PRD |

---

## Changelog

### v2.1.0 (2026-07-01)
- **Fixed a spec contradiction**: this guide previously listed `type: skill` as a
  frontmatter anti-pattern. It is not — `docs/ssss-spec.md` §5.4 `skill` and
  `registry/core.json`'s `skill` primitive both REQUIRE `type: skill` for any
  SSSS-managed manifest. The actual anti-pattern is *memory-node* fields
  (`slug`, `category`, `title`, `schema_version`, `importance`, ...), which have
  no meaning on the `skill` primitive. Corrected the frontmatter example, the
  anti-pattern block, and the common-mistakes table.

### v2.0.0 (2026-05-11)
- **BREAKING**: Removed Total Recall-specific implementation details (surface.mjs routing, memory injection blocks, Gemma 4 references, P2 scheduling). This skill is now the universal format spec.
- Added deliberation checklist forcing agents to think about each folder
- Added "When creating a skill, ask yourself" prompts for each directory
- Added frontmatter anti-patterns section
- Added evals.json format example
- Added common mistakes table

### v1.0.0 (2026-05-10)
- Initial version. Mixed universal skill format with Total Recall memory compiler internals, causing agent confusion.
