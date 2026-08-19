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

## Relationship to the global project-management skill

This is a **repo-specific overlay**, not a standalone system. The universal 4-file Kanban
mechanics — `docs/projects/<kanban-state>/<PROJECT_PREFIX>/` folder layout, the
`PROJECT_PREFIX` naming rule (ALL CAPS WITH UNDERSCORES, unique, descriptive), the
"no ephemeral planning artifacts" invariant, and standard tracker checkbox syntax — are
defined once in the global `project-management` skill; read that first. This file's only
delta is the **OKF-interoperable document header** below, which this repo deliberately
layers on top of the universal header as part of dogfooding its own spec.

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

- Global project-management skill (universal Kanban mechanics): `project-management`
- SSSS Spec (current draft, v0.6): `docs/ssss-spec.md`
