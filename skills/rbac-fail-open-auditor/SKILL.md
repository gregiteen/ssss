---
type: skill
title: RBAC Fail-Open Auditor
name: rbac-fail-open-auditor
description: >
  Use this skill when auditing or hardening Stage 5.5 RBAC on an SSSS vault
  or engine fork — e.g. before production launch, after adding a
  security_role or ROLE.md, when actor.role might be missing or spoofable,
  when someone asks whether a bad actor can write without a role, or after
  ANY change to src/engine.mjs's Stage 5.5 block. Builds and runs adversarial
  envelopes (missing actor, unknown role, zero-permission role, system-role
  bypass, event-vs-document-type permission gating) against the reference
  engine and reports fail-open vs fail-closed per case, generating
  conformance-schema-compatible negative fixtures for any confirmed gap. Do
  NOT use for registry/spec drift unrelated to authorization — use
  ssss-registry-parity-auditor for that.
timestamp: 2026-07-02T00:00:00Z
---

# rbac-fail-open-auditor

## Context

This repo shipped a real fail-open RBAC bug: Stage 5.5 in `src/engine.mjs`
resolved `const actorRole = envelope.actor?.role || 'admin';` — any envelope
missing `actor.role` silently got full admin access instead of being denied,
directly contradicting the Stage 3 mandate the repo had just formalized
(a host exposing the Operation Contract to untrusted clients MUST overwrite
`actor` with verified identity before RBAC runs). A second, related bug: the
`event` envelope branch never set `resolvedType`, so every event write was
checked against the permission `write:null` — a string no real role could
ever hold except via a `*:*`/`write:*` wildcard, meaning legitimately-scoped
non-admin roles were incorrectly denied on every event write.

Both are fixed now (see `references/stage-5-5-rbac-notes.md` for the
before/after), and `conformance/fixtures.json` fixtures 011, 016, and 018
are permanent regression fixtures for exactly these two cases. **This
skill's job is to make sure the next change to Stage 5.5 doesn't
reintroduce a variant of either bug**, by generating and running a broader
adversarial matrix than any one conformance fixture covers on its own.

## Steps

1. Read the CURRENT `src/engine.mjs` Stage 5.5 block yourself first — don't
   assume it still looks like the notes in `references/stage-5-5-rbac-notes.md`.
   Confirm: what does an absent `actor` resolve to? What permission string
   does an `event` envelope require? Does `system` still bypass
   unconditionally? Does `admin` still get a hardcoded `write:*`/`read:*`
   regardless of `roles/admin/ROLE.md`'s actual content?
2. Run `node scripts/enumerate-envelopes.mjs <repo>` to generate the
   adversarial envelope matrix (missing actor, unknown role name, a role
   file that doesn't exist on disk, a role with zero matching permissions, a
   role with only `read:*`, `system`, explicit `admin`) across all four
   envelope types.
3. Run `node scripts/probe-rbac.mjs <repo>` to fire that matrix through
   `createEngine().processOperation()` against a disposable temp vault and
   classify every case as fail-open (unexpectedly allowed) or fail-closed
   (correctly denied).
4. For any fail-open result, run
   `node scripts/emit-negative-fixtures.mjs <repo>` to turn it into a
   conformance-schema-compatible fixture (same shape as
   `conformance/fixtures.json` fixture-011/018) so the finding becomes a
   permanent regression test, not just a one-time report.
5. Report every fail-open finding with the exact envelope that triggered it,
   the exact line in `src/engine.mjs` responsible, and the generated fixture.
   A clean run (no fail-open cases) is still worth reporting explicitly —
   "ran N adversarial cases, 0 fail-open" is a real, useful finding.

## Rules

- "Fail-open" means an envelope that SHOULD be denied by any reasonable
  reading of the permission grammar was instead allowed. Don't report a
  case as fail-open just because you personally think the default should be
  stricter — ground every finding in what the actual permission the role
  holds (or doesn't) implies.
- Always test the FOUR distinct code paths separately: `system` role
  (unconditional bypass — this is intentional, not a bug, don't flag it),
  explicit `admin` role (hardcoded `write:*`/`read:*` — also intentional),
  a real named role read from `roles/<role>/ROLE.md`, and an absent/missing
  `actor` (must deny). Conflating these produces false findings.
- `event` envelopes have no resolved document type — they must be checked
  against the fixed `write:event` permission, not `write:<type>`. If you see
  an event-related finding mention `write:null`, that's the exact historical
  bug pattern; verify it hasn't regressed.
- Every confirmed fail-open finding MUST ship with a reproducing envelope
  and a generated fixture. A prose-only report ("this seems risky") is not
  an acceptable output from this skill.

## Pitfalls

- `roles/<role>/ROLE.md` is read from the VAULT'S filesystem
  (`path.join(vaultRoot, 'roles', actorRole, 'ROLE.md')`), not from any
  in-memory registry. A probe against a fresh temp vault with no `roles/`
  directory will correctly deny every non-system, non-admin role — that's
  expected, not a bug, unless you've first created the role file as part of
  your test sequence (see fixture-015/017's create-then-use pattern).
- The engine's idempotency cache means replaying the exact same
  `idempotency_key` + `workspace_id` returns the CACHED response without
  re-running Stage 5.5 at all. If your adversarial matrix reuses an
  idempotency_key from an earlier successful case, you'll get a false
  "allowed" result that has nothing to do with the current envelope's
  actor/role — always generate fresh UUIDs per probe.
- `admin` gets `perms = ['write:*', 'read:*']` hardcoded in code,
  regardless of whether `roles/admin/ROLE.md` exists or what it contains.
  Don't test "does a malicious `roles/admin/ROLE.md` with fewer permissions
  actually restrict the admin role" and report it as a bug — this is a
  documented, intentional design choice (admin is a privileged built-in
  name, not purely data-driven).

## References

- `references/stage-5-5-rbac-notes.md` — line-by-line walkthrough of the
  (fixed) Stage 5.5 logic, including the historical bug as a case study.
- `references/permission-grammar.md` — the `write:*` / `*:<type>` /
  `write:<type>` / `read:*` grammar with worked allow/deny examples.
