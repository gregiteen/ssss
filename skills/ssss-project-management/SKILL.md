---
type: skill
title: SSSS Project Management
name: ssss-project-management
description: >
  Project management skill for the SSSS (Structured Semantic Syntax System) standard repo.
  Guides agents through the standard SWE sequence (PRD → Architecture → Dev Plan → Tracker) 
  and enforces per-project document isolation. ACTIVATE this skill for any task related to
  SSSS project planning, tracking, or feature scoping.
timestamp: 2026-07-02T00:00:00Z
---

# SSSS — Project Management Skill

> The canonical repository for the **Structured Semantic Syntax System (SSSS)** — the database-free,
> Markdown-first schema and mutation contract for AI agent state. SSSS voluntarily tracks
> interoperability with Google OKF's concept model (see the `okf` skill) but is not a
> certified or formally-affiliated OKF implementation.

## Overview

The SSSS repository is the vendor-neutral standard and canonical validator implementation 
used across `festech.live`, `total-recall`, and `ultrachat`.

## Standard SWE Sequence

Every **new project or feature** in this repo gets its **own dedicated set of 4 documents**. Do NOT append to existing project documents from other projects.

### Per-Project Document Set

Each project creates **4 fresh documents** using a unique `PROJECT_PREFIX`.

**Folder Structure Mandate:**
All project documents MUST be organized into their own dedicated sub-folder inside one of the three lifecycle directories under `docs/projects/`:
- `docs/projects/planned/<PROJECT_PREFIX>/`
- `docs/projects/in-progress/<PROJECT_PREFIX>/`
- `docs/projects/completed/<PROJECT_PREFIX>/`

Agents MUST move the entire project folder (not just the loose files) between these lifecycle directories as the project's status changes in the Kanban system.

| #   | Document         | Path (Example for in-progress)                                  | Naming Pattern                         |
| --- | ---------------- | --------------------------------------------------------------- | -------------------------------------- |
| 1   | **PRD**          | `docs/projects/in-progress/<PROJECT_PREFIX>/<PROJECT_PREFIX>_PRD.md`             | `<PROJECT_PREFIX>_PRD`                 |
| 2   | **Architecture** | `docs/projects/in-progress/<PROJECT_PREFIX>/<PROJECT_PREFIX>_ARCHITECTURE.md`    | `<PROJECT_PREFIX>_ARCHITECTURE`        |
| 3   | **Dev Plan**     | `docs/projects/in-progress/<PROJECT_PREFIX>/<PROJECT_PREFIX>_DEVELOPMENT_PLAN.md`| `<PROJECT_PREFIX>_DEVELOPMENT_PLAN`    |
| 4   | **Tracker**      | `docs/projects/in-progress/<PROJECT_PREFIX>/<PROJECT_PREFIX>_PROJECT_TRACKER.md` | `<PROJECT_PREFIX>_PROJECT_TRACKER`     |

### Naming the Project Prefix

The `PROJECT_PREFIX` must be:
- **ALL CAPS WITH UNDERSCORES** (screaming snake case)
- **Descriptive of the specific project/feature** — NOT a generic label
- **Unique** — never reuse another project's prefix

> **IMPORTANT**: Filenames MUST ALWAYS be ALL CAPS WITH UNDERSCORES (screaming snake case).

> [!CAUTION]
> **ABSOLUTE INVARIANT: NO EPHEMERAL PLANNING ARTIFACTS**
> When exercising judgement on whether a user's request warrants a plan, ALWAYS conclude that it DOES NOT warrant an ephemeral plan.
> **NEVER** create an `implementation_plan.md`, `task.md`, or `walkthrough.md` artifact.
> ALL planning MUST be redirected to the canonical project documents.

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

---
```

## OKF Interoperability

When writing or managing SSSS primitives, keep them interoperable with Google OKF's concept
model where it fits naturally — standardize on Markdown with YAML frontmatter, and use
OKF's recommended fields (`title`, `description`, `tags`, `timestamp`) alongside SSSS's own
`type` discriminator. This is a voluntary interoperability goal, not a compliance claim —
see the `okf` skill for the actual relationship between the two formats.

## Development Workflow

When starting work on a new feature or project:

1. **Create project documents** — Generate all 4 SSSS docs with the project's unique `PROJECT_PREFIX`
2. **Write the PRD** — Define the problem, scope, and requirements
3. **Write the Architecture** — Design the schema, API, and component structure
4. **Write the Dev Plan** — Break down into phased tasks
5. **Use the Tracker** — Mark tasks `[/]` in-progress, `[x]` completed
6. **Update the Tracker** — Mark as complete with verification log entry

## References

- SSSS Spec (current draft, v0.6): `docs/ssss-spec.md`
