# Permission grammar

A `security_role` document's `permissions` field is a flat YAML list of
strings. Stage 5.5 checks a required permission (`write:<type>` for
document envelopes, `write:event` for event envelopes) against this list
using exact/wildcard string matching — there is no hierarchy or inheritance
beyond the literal wildcard forms below.

## Grammar

| Pattern | Meaning |
|---|---|
| `write:<type>` | Write access to exactly one primitive type, e.g. `write:assistant`. |
| `read:<type>` | Read access to exactly one primitive type. Not currently enforced by Stage 5.5 (which only gates writes), but declared for forward compatibility / host-level read gating. |
| `*:<type>` | Both read and write access to exactly one primitive type. |
| `write:*` | Write access to ANY primitive type, including `event` and `index`. |
| `read:*` | Read access to any primitive type. |
| `*:*` | Full access to everything. |
| `write:event` | Write access to event envelopes specifically. NOT satisfied by `write:<some other type>` — only by itself, `write:*`, `*:event`, or `*:*`. |

## Worked examples

```yaml
# Role: reporter — may append events, nothing else
permissions:
  - "write:event"
```
- Event write → **allowed** (`write:event` matches exactly).
- Assistant write → **denied** (no `write:assistant`, `write:*`, `*:assistant`, or `*:*`).

```yaml
# Role: viewer — read-only
permissions:
  - "read:*"
```
- Any write (document or event) → **denied**. `read:*` never satisfies a
  `write:` requirement.

```yaml
# Role: workflow-editor
permissions:
  - "write:workflow"
  - "read:*"
```
- Workflow write → **allowed**.
- Assistant write → **denied** (workflow-scoped, not assistant-scoped).
- Event write → **denied** (`write:workflow` does not satisfy `write:event`
  — these are two distinct, non-overlapping permission strings by design).

## `admin` and `system` are not data-driven

`admin` gets `['write:*', 'read:*']` hardcoded in `src/engine.mjs`
regardless of `roles/admin/ROLE.md`'s actual content (the file, if present,
can only ADD to this via the same `data.permissions` merge every other role
uses — though since `write:*` already grants everything, additional entries
are redundant in practice). `system` bypasses the permission check
entirely — it never even reads a `permissions` list. Neither is "just
another role name" from the grammar's point of view; don't test them as if
they were data-driven roles.
