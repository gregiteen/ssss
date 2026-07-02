# Canonical project-document header

Every one of the 4 per-project documents (PRD / Architecture / Development Plan /
Project Tracker) starts with this exact header shape. `scripts/scaffold-project.mjs`
generates it automatically — this file exists so an agent can also hand-write or
audit one without re-deriving the shape.

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

## Field notes

- `type: project_document` — this is a repo-local convention, not an SSSS core
  primitive (`registry/core.json` has no `project_document` entry). It exists so
  these docs are self-describing OKF-style Markdown, not so the SSSS engine
  validates them.
- `<Document Type>` is one of: `Product Requirements`, `Architecture`,
  `Development Plan`, `Project Tracker`.
- `<PROJECT_PREFIX>` MUST be `SCREAMING_SNAKE_CASE` and unique across every
  lifecycle stage (`planned/`, `in-progress/`, `completed/`) — never reused, even
  after a project completes.
- **Kanban State must stay in sync with the document's physical folder.** If a
  project moves from `docs/projects/planned/X/` to `docs/projects/in-progress/X/`,
  every one of its 4 documents' Kanban State line must be updated in the same
  change — see `references/kanban-lifecycle.md`.
