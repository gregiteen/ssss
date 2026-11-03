---
type: skill
title: SSSS Project Management
name: ssss-project-management
description: >
  Project management skill for the SSSS (Structured Semantic Syntax System) standard repo.
  Guides agents through the standard SWE sequence (AUDIT → PRD → Architecture → Dev Plan → Tracker)
  and enforces per-project document isolation. ACTIVATE this skill for any task related to
  SSSS project planning, tracking, or feature scoping.
timestamp: 2026-11-03T00:00:00Z
---

# SSSS — Project Management Skill

> The canonical repository for the **Structured Semantic Syntax System (SSSS)** — the database-free,
> Markdown-first schema and mutation contract for AI agent state. SSSS voluntarily tracks
> interoperability with Google OKF's concept model (see the `okf` skill) but is not a
> certified or formally-affiliated OKF implementation.

## Overview

The SSSS repository is the vendor-neutral standard and canonical validator implementation
used across `festech.live`, `total-recall`, and `ultrachat`.

## Relationship to the global project-management skill

This is a **repo-specific overlay**, not a standalone system. The universal 5-file Kanban
mechanics — `docs/projects/<kanban-state>/<PROJECT_PREFIX>/` folder layout, the
`PROJECT_PREFIX` naming rule (ALL CAPS WITH UNDERSCORES, unique, descriptive), the
"no ephemeral planning artifacts" invariant, Phase 0 Audit rule, and standard tracker checkbox syntax — are
defined once in the global `project-management` skill; read that first. This overlay
adds SSSS readiness, severity, and document-header rules.

### Document Header Convention

Every project document MUST include the standardized OKF-compliant header:

```markdown
---
type: project_document
title: <PROJECT_PREFIX> — <Document Type>
tags: ["project-management", "<PROJECT_PREFIX>"]
timestamp: YYYY-MM-DDTHH:mm:ssZ
---

# <PROJECT_PREFIX> — <Document Type>

> **Project Prefix**: `<PROJECT_PREFIX>`
> **Kanban State**: 📋 Planned / 🏗️ In Progress / ✅ Completed
> **Author**: <Author>
> **Date**: YYYY-MM-DD
> **Based on audit**: <PROJECT_PREFIX>_AUDIT.md (Complete, <commit-hash>)
```

For `<PROJECT_PREFIX>_AUDIT.md`, replace the `Based on audit` line with:
```markdown
> **Audit Status**: In progress / Complete
> **Audited commit**: <commit-hash>
```

---

## OKF Interoperability

When writing or managing SSSS primitives, keep them interoperable with Google OKF's concept
model where it fits naturally — standardize on Markdown with YAML frontmatter, and use
OKF's recommended fields (`title`, `description`, `tags`, `timestamp`) alongside SSSS's own
`type` discriminator. This is a voluntary interoperability goal, not a compliance claim —
see the `okf` skill for the actual relationship between the two formats.

## Readiness and severity

A project is ready to close when the changed registry, normative spec, reference
engine, and fixtures agree; the repo's full code-quality tier and relevant
negative/replay cases pass; and the tracker verification phase is complete.
Use [the core workflow](references/core-workflow.md) for a concrete walkthrough.
Run `node skills/ssss-project-management/scripts/check-project-docs.mjs <PROJECT_PREFIX>`
before moving the folder to `completed/`.

- P0: Canonical Markdown or event-log loss, authorization bypass, or an unsafe published contract.
- P1: Conformance regression, broken CLI core workflow, or registry/spec mismatch.
- P2: Secondary adapter defect or unclear prose with a working reference path.
- P3: Editorial polish without contract ambiguity.

Review `registry/core.json`, `docs/ssss-spec.md`, the relevant `src/` module,
and `conformance/fixtures.json` together. Markdown and append-only events are
canonical; projections are rebuildable. Keep the package dependency-free Node
ESM, and keep host-specific policy out of the core registry. The repository is
`gregiteen/ssss`; `main` is trunk.

## Development Workflow

When starting work on a new feature or project:

1. **Conduct the Audit (`AUDIT`)** — Investigate existing code, data, tests, and invariants. Run baseline tests. Record findings with IDs. The audit must be `Complete` before any other document is created or code is edited.
2. **Write the PRD** — Define problem, scope, and requirements citing audit findings.
3. **Write the Architecture** — Design schema, API, component structure, and tradeoffs.
4. **Write the Dev Plan** — Break down into phased tasks.
5. **Execute with the Tracker** — Mark tasks `[/]` in-progress, `[x]` completed. Append every action to the mandatory bottom `## Action Log`.
6. **Verify and Archive** — Run full quality tier, record `Readiness Status: Verified`, move folder to `docs/projects/completed/`, and extract deferred items to `docs/projects/DEFERRED_BACKLOG.md`.

## Open Source vs. Private Boundary Hygiene

When authoring project documents in public open-source repositories (such as `@gregiteen/ssss-cli`):
- **Vendor-Neutral Scope**: Public specs and PRDs must describe contracts in terms of universal primitives (`resource`, `rule`, `workflow`), never proprietary application models.
- **No Private Host Entity Leaks**: Never cite internal proprietary product file paths (e.g. `apps/web/server/services/...`), internal database schemas, or production host secrets.
- **No Local Path Leakage**: Always use repository-relative paths (`src/engine.mjs`) or package specifiers (`@gregiteen/ssss-cli`), never workstation-specific absolute paths (`/Users/...`).
- **Sanitization Before Archival**: Verify with automated grep checks before moving any project from `in-progress/` to `completed/` that zero local host or private app names were introduced.

## SWE Workflow Comparison: Standard Industry vs. Your 5-File System

To provide full context for engineers and maintainers:
- **Standard Industry SWE Workflow**:
  - Teams use external issue trackers (Jira, Linear, GitHub Issues) for task tracking.
  - Requirements are often distributed across Google Docs or Notion PRDs, and design discussions happen in PR comments or RFC pull requests.
  - Changes are submitted via git branches and Pull Requests with code reviews and automated CI/CD checks (GitHub Actions).
- **Your 5-File Specification System (`AUDIT` → `PRD` → `ARCHITECTURE` → `DEV_PLAN` → `PROJECT_TRACKER`)**:
  - **Audit-First**: Unique and significantly more rigorous than typical startup engineering. Requiring an explicit, structured audit (`AUDIT.md`) with baseline test verification *before* writing requirements prevents assumption drift and premature coding.
  - **Repository-Native Source of Truth**: Instead of scattered cloud dashboards, all engineering intent, architecture decisions, and real-time execution logs live directly in version-controlled markdown alongside the codebase.
  - **Deterministic Verification**: Tasks are tied to explicit finding IDs (`A-001`), and every action taken is recorded with proof in an append-only action log.
  - **Dual Benefit**: It combines the thoroughness of formal Aerospace / Safety-Critical Systems engineering (RFC + traceability matrix) with the speed of autonomous agent pair programming.

## References

- Global project-management skill (universal Kanban mechanics): `project-management`
- SSSS Spec (v0.9): `docs/ssss-spec.md`
