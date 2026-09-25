---
type: project_document
title: SPEC_CODE_ALIGNMENT — Architecture
tags: ["project-management", "SPEC_CODE_ALIGNMENT"]
timestamp: 2026-09-24T00:00:00Z
---

# SPEC_CODE_ALIGNMENT — Architecture

> **Project Prefix**: `SPEC_CODE_ALIGNMENT`
> **Kanban State**: ✅ Completed
> **Author**: Claude (Opus 5.5) with Greg Iteen
> **Date**: 2026-09-24

---

## 1. Commit point

The canonical commit is **VFS write + event append**. Before the event is
appended, any failure rolls the VFS back (existing behavior). After the event
is appended, the mutation is committed:

```text
prepare → [dry_run: reconcile(dry_run) → return]
        → VFS write (CAS) → event append        ── failure → reconcile + VFS rollback
        → finalize                              ── failure → reconcile, warning, still success
        → projections → idempotency record
```

`reconcile` receives `{ resourceState, error, envelope, principal, phase }`, where
`phase ∈ dry_run | commit | finalize`. That tells the host whether it is
cancelling a reservation or compensating after a committed intent.

## 2. Error codes

`failure()` takes a code. The codes come from the existing fixture table:

| Code | HTTP | Raised when |
|------|------|-------------|
| `invalid_request` | 400 | bad command type, missing envelope field, non-JSON event content, unsafe path |
| `unauthorized` | 401 | missing or invalid verified principal |
| `forbidden` | 403 | principal not scoped to the workspace, or missing capability |
| `not_found` | 404 | the patch or delete target is absent |
| `lease_conflict` | 409 | lease missing, mismatched, or expired |
| `version_conflict` | 409 | VFS compare-and-swap lost with no idempotent winner |
| `idempotency_conflict` | 409 | same key, different request hash |
| `validation_failed` | 422 | registry validation, type change, immutable field, append-only delete |
| `internal_error` | 500 | unreadable stored state, resource prepare failure, commit failure |

`http.mjs` exports `ERROR_STATUS` and `statusForResponse(response)`.

## 3. Spec example gate

`scripts/audit-spec-examples.mjs` extracts every ```` ```markdown ```` block
whose first line is `---` and that declares a `type`, then validates it with
the core validator. It also checks the spec's §6.5 code table against
`ERROR_STATUS`. It runs in `npm test` alongside the registry parity audit.
