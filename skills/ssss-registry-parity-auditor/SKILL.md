---
type: skill
title: SSSS Registry Parity Auditor
name: ssss-registry-parity-auditor
description: >
  Use this skill to audit whether SSSS's registry (registry/core.json +
  registry/extensions/*.json) is actually consumed by the reference engine
  (src/engine.mjs, src/registry.mjs) and matches docs/ssss-spec.md. Trigger on
  "audit registry drift", "does the spec still match the code", "is
  required_when actually enforced", "why is the conformance README's
  reconciliation table still open", when adding a NEW field to a registry
  primitive, or before cutting a release. Also trigger when a registry field
  is declared on a primitive but might be silently ignored by
  validateContent() — a drift class that is invisible to normal testing and
  was previously real in this repo (required_when/enums were declared on the
  memory primitive for a full release cycle with zero engine enforcement).
  Do NOT use for RBAC/authorization-specific auditing — use
  rbac-fail-open-auditor for that.
timestamp: 2026-07-02T00:00:00Z
---

# ssss-registry-parity-auditor

## Context

SSSS's whole design promise is that `registry/core.json` (+ extension
registries) IS the validation schema — there is no per-type engine code, so a
conformant host only has to read the registry to know what's required. That
promise silently breaks the moment someone adds a new field to a primitive
definition (`required_when`, an `enums` block, a new flag) without also
teaching `src/engine.mjs` / `src/registry.mjs` to read it. Nothing in normal
testing catches this: the registry stays valid JSON, `ssss conformance`
(pre-parity-audit) stayed green, and a document that violates the undeclared
constraint still passes.

This exact bug was real in this repo: `registry/core.json`'s `memory`
primitive declared `required_when: {"schema_version==2": [...]}` and an
`enums` block, but `validateContent()` in `src/engine.mjs` only ever checked
`required_fields`. A memory node could set `schema_version: 2` and omit every
field the registry said was then required, and still validate. See
`references/known-drift-taxonomy.md` for the full case study — that specific
gap is what this skill exists to make impossible to reintroduce.

There is now a deterministic, always-run guard for exactly this class of bug:
`scripts/audit-registry-field-usage.mjs` in the repo root, wired into every
`npm test` / `ssss conformance` run. **This skill does not reimplement that
check — it wraps it**, and additionally covers two things the automatic gate
does not: whether `spec_ref` annotations still point at real spec sections,
and whether `conformance/README.md`'s "Open reconciliation items" table is
stale in either direction.

## Steps

1. Run the repo's own automatic parity gate first — it's the fast, precise
   check: `node scripts/run-parity-audit.mjs` (thin wrapper around the repo's
   `scripts/audit-registry-field-usage.mjs`). If this fails, that's the
   headline finding; report it verbatim, it already tells you the exact
   primitive, key, and file.
2. Run `node scripts/audit-spec-refs.mjs` to check every primitive's
   `spec_ref` string actually resolves to a heading in `docs/ssss-spec.md`.
3. Run `node scripts/diff-reconciliation-table.mjs` to flag
   `conformance/README.md` drift-table rows that look stale against current
   registry/spec state.
4. If you're specifically investigating a NEW field someone just added to a
   registry primitive (not yet covered by the automatic gate's key lists),
   check whether it should be added to `ENGINE_ENFORCED_KEYS` (if
   `src/engine.mjs`/`src/registry.mjs` should enforce it at write time) or
   `KNOWN_NON_ENGINE_KEYS` (with a comment on where it IS actually consumed —
   e.g. `portability` is read by `src/bundle.mjs` at export time, not by the
   engine at write time) in `scripts/audit-registry-field-usage.mjs` itself.
   An "unclassified registry key" finding from that script means a human (or
   you) needs to make this call, not that it's automatically a bug.
5. If you find a genuine gap (declared-but-unenforced field), do not just
   report it — read `src/engine.mjs`'s `validateContent()` function and
   propose (or, if asked, implement) the enforcement logic, following the
   existing pattern for `required_fields`/`required_when`/`enums`. Add a
   conformance fixture proving both the positive and negative case, matching
   the style of `conformance/fixtures.json` fixtures 012-014.

## Rules

- Never hand-wave "the registry and engine are in sync" — every claim in
  this skill's output must cite the exact file/line or exact grep result
  that proves it, the same way the fixture case study does.
- The automatic gate (`scripts/audit-registry-field-usage.mjs`) is the
  source of truth for "is this key enforced." Don't second-guess it with
  vaguer reasoning; if it reports clean, trust it — its job is precisely to
  replace judgment calls with a deterministic check.
- `portability` is NOT an engine-enforcement gap when it shows up as
  "unclassified" — it's legitimately consumed by `src/bundle.mjs` at export
  time and `src/registry.mjs`'s `resolvePortability()`, not by
  `validateContent()` at write time. Don't flag it without reading
  `KNOWN_NON_ENGINE_KEYS` in the audit script first.
- `spec_ref` staleness is a real but lower-severity finding than an
  enforcement gap — a wrong doc pointer confuses readers, an unenforced
  constraint lets bad data land. Rank findings accordingly.

## Pitfalls

- Grepping only `src/engine.mjs` for a key produces false positives for
  fields consumed via a helper module it imports (e.g. `append_only` is read
  inside `src/registry.mjs`'s `isAppendType()`, not inlined in
  `engine.mjs`). The audit script already accounts for this
  (`ENGINE_FILES` covers both files) — if you write a new check, do the
  same, or you'll report a false bug.
- Extension registries use `canonical_path` where core uses
  `canonical_filename` — both are documentation-only fields, not enforcement
  gaps, despite the different name.
- Don't confuse "this key isn't referenced in the engine" with "this key is
  unused" — always check whether it's consumed by a different module for a
  different purpose (export, provisioning, documentation) before calling it
  a gap.

## References

- `references/known-drift-taxonomy.md` — the real drift classes found in
  this repo's history, with the memory `required_when`/`enums` case study in
  full.
- `references/engine-field-consumption-map.md` — human-readable version of
  the audit script's `ENGINE_ENFORCED_KEYS` / `KNOWN_NON_ENGINE_KEYS` split,
  with the "who actually reads this key" answer for every registry field.
