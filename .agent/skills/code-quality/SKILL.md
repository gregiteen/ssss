---
name: code-quality
repo_scoped: true
description: "Use this skill before committing, publishing, or releasing @gregiteen/ssss-cli, and whenever fixing quality gate errors. This repo is the SSSS reference engine and CLI in pure Node ESM — zero external dependencies, no TypeScript, and no ESLint. Its gates are SSSS engine conformance, full fixture validation, and syntax sweeps. Run checks as BACKGROUND jobs via scripts/check.mjs. MANDATORY: You MUST read the full SKILL.md file before executing."
---

# Code Quality — SSSS (@gregiteen/ssss-cli)

**Stack:** Node ESM (`"type": "module"`), node >= 18, zero external runtime dependencies, reference engine at `src/engine.mjs`, CLI dispatcher at `scripts/ssss.mjs`.

> **No tsc, no eslint here.** Neither is declared in `package.json`. SSSS is the
> reference implementation and contract authority. Quality in this repo means:
> zero external runtime dependencies, 100% SSSS specification conformance across
> all fixtures, deterministic event replay, and fail-closed security.

## The loop

```bash
node .agent/skills/code-quality/scripts/check.mjs
```

Launch as a **background job**, then read:

```bash
node .agent/skills/code-quality/scripts/report.mjs
```

## This repo's gates

| id | tier | what it is |
|:---|:---|:---|
| `conformance-engine` | fast | `npm test` → `node ./scripts/conformance.mjs conformance --engine` |
| `conformance-full` | full | `npm run conformance` → full conformance suite with all fixtures |

## Repo invariants

**Anti-Slop Protocol**: NEVER use the words 'sovereign', 'synergy', or 'leverage'.

**Zero External Runtime Dependencies**: `dependencies` in `package.json` must remain empty `{}`. All primitives, cryptographic signing, VFS adapters, and parsers are native Node ESM.

**Fail-Closed Security**: Authorization (§5), idempotency stores (§7), leases (§8), and direct-write guards (§14) must fail closed when unverified or conflicted.

**Pure Node ESM**: No TypeScript, no ESLint. Do not introduce transpilation steps, build scripts, or typecheckers that do not exist here.

## Pitfalls

- All changes to `src/engine.mjs`, `src/runtime.mjs`, or `src/registry.mjs` must maintain backwards compatibility with existing fixture envelopes.
- One check at a time machine-wide (`check.mjs` holds a global lock).
