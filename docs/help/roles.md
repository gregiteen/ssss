# Security roles & RBAC (spec §5.4 security_role, §6.3 Stage 5.5)

Every write goes through Stage 5.5 — Granular Authorization — after content
validation and before commit. It's fail-closed: a write with no verified
`actor.role` is denied, never silently promoted to a default role.

## The `security_role` primitive

```markdown
---
type: security_role
name: "editor"
permissions:
  - "write:workflow"
  - "write:assistant"
  - "read:*"
---

Can edit workflows and assistants; read-only on everything else.
```

Canonical location: `roles/<role>/ROLE.md`, where `<role>` matches the
`name` field. `permissions` is a flat list — see the grammar below.

## Permission grammar

| Pattern | Grants |
|---|---|
| `write:<type>` | Write access to exactly one primitive type. |
| `read:<type>` | Read access to exactly one primitive type. |
| `*:<type>` | Read + write on exactly one primitive type. |
| `write:*` | Write access to every primitive type, including `event`. |
| `read:*` | Read access to every primitive type. |
| `*:*` | Full access. |

`event` envelopes have no resolved document type, so they're gated on the
fixed permission `write:event` specifically — `write:<some other type>`
does **not** satisfy it, and neither does an unrelated wildcard scoped to a
document type.

## The three non-negotiable role behaviors

| `actor.role` | Behavior |
|---|---|
| `"system"` | Unconditional bypass. Used by trusted internal callers (the provisioning pipeline stamps every generated envelope this way — see `ssss help provisioning`). Not data-driven; don't expect a `roles/system/ROLE.md`. |
| `"admin"` | Hardcoded `write:*`/`read:*`, regardless of `roles/admin/ROLE.md`'s content (a file there can only add to this, never restrict it). |
| *(absent)* | **Denied.** A host that exposes the Operation Contract to untrusted clients MUST overwrite `actor` with verified session identity before the envelope reaches the engine (spec §6.3 Stage 3). A missing `actor.role` is not a default — it's an authorization failure. |

Any other role name is resolved by reading `roles/<role>/ROLE.md` from the
target vault at write time. No file there means zero permissions.

## Auditing this yourself

The `rbac-fail-open-auditor` agent skill (`.agent/skills/rbac-fail-open-auditor/`)
builds an adversarial envelope matrix and runs it against the reference
engine to catch regressions in this logic — including the specific
historical bug it's named after (a fail-open default that briefly shipped
in this repo's own uncommitted history; see that skill's
`references/stage-5-5-rbac-notes.md` for the full case study).

See also: `ssss help portability`, `ssss help bundle`.
