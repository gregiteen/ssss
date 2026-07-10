# Localization and translation overlays (spec §5.4, §11.9)

A `translation` is a structural overlay for one exact source document. It never
forks the source or translates symbolic control fields.

```yaml
---
type: translation
title: "Política de reembolsos — español"
description: "Traducción al español."
timestamp: 2026-07-10T00:00:00Z
translation_id: refund-policy-es
source_path: rules/refund-policy.md
source_hash: sha256:<hash-of-current-source-bytes>
locale: es
status: approved
translated_fields: [title, description, body]
translated_title: "Política de reembolsos"
translated_description: "Reglas de reembolso para compradores."
---

Contenido traducido.
```

Only `title`, `description`, and body may change. `type`, ids, status values,
permissions, relations, portability, and every other control field remain canonical.
The engine rejects stale source hashes, missing or private sources, traversal,
symlinks, recursive translation, and changes to immutable overlay identity.

Draft and reviewed overlays are retained for workflow, but normal localization uses
approved overlays only. Use `--include-drafts` only for an explicit preview.

```bash
ssss localize ./vault --locale es --out ./derived/es
```

The output must be a new or empty, non-symlinked directory outside the source vault.
It preserves source-relative paths, excludes private/resource-bound documents by
default, and writes `.ssss-projection.json` so the derived result is auditable and
rebuildable.

Use `ssss semantic ./vault --locale es` to query localized surfaces without
materializing files. See also: `ssss help semantic`.
