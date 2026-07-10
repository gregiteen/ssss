# Engine field consumption map

Human-readable mirror of `scripts/audit-registry-field-usage.mjs`'s
`ENGINE_ENFORCED_KEYS` / `KNOWN_NON_ENGINE_KEYS` split. If this file and the
script ever disagree, the script is authoritative — update this file to
match, not the other way around.

## Enforced by the engine at write time (src/engine.mjs + src/registry.mjs)

| Key | Where | Behavior |
|---|---|---|
| `required_fields` | `engine.mjs` `validateContent()` | Every listed field must be present and non-empty. |
| `required_when` | `engine.mjs` `validateContent()` | Fields required only when a `"field==value"` condition on the document matches. Supports multiple condition keys per primitive. |
| `enums` | `engine.mjs` `validateContent()` | A present field's value(s) must be drawn from the declared list. |
| `patterns` | `engine.mjs` `validateContent()` | String fields must match the registry-declared Unicode regular expression. Invalid patterns fail during registry load. |
| `immutable_fields` | `engine.mjs` operation/patch validation | Existing identity fields cannot be changed by replacement or patch; an explicit migration is required. |
| `references` | `engine.mjs` + `registry.mjs` `validateReferenceConstraints()` | Referenced paths are contained, non-symlink files and may enforce source type, portability, and exact content hashes. |
| `append_only` | `registry.mjs` `isAppendType()`, called from `engine.mjs` | Rejects any `operation`/`patch` write that doesn't extend the existing body verbatim; rejects `delete` entirely. |

## Consumed elsewhere, NOT by write-time validation (do not flag as a gap)

| Key | Consumer | Purpose |
|---|---|---|
| `portability` | `registry.mjs` `resolvePortability()`, `bundle.mjs` export filtering | Governs whether a primitive may leave the workspace in a given export profile (§5.5). Read at export time, not write time. |
| `resource` | `bundle.mjs` provisioning | Extension-defined `resource_bound` binding metadata (e.g. `resource.binds`, `resource.provision_relation`). Read during `provisionBundle`. |
| `canonical_filename` / `canonical_path` | Documentation / scaffolding only | Tells a human (or `ssss new`) the conventional file path; the engine does not enforce that a document lives at this exact path. |
| `filename_convention` | Documentation only | Same as above, for slug-based paths. |
| `family` | Documentation / grouping only | No runtime behavior. |
| `spec_ref` | Documentation only (this skill's `audit-spec-refs.mjs` checks it, the engine does not) | Points at the spec section that defines the primitive. |
| `notes`, `optional_fields` | Documentation only | Informational; optional fields are — deliberately — not validated for presence. |

## If you add a new registry key

1. Decide: does `src/engine.mjs` (directly or via `src/registry.mjs`) need to
   read it to enforce something at write time? If yes, implement it in
   `validateContent()` (or the relevant stage) and add it to
   `ENGINE_ENFORCED_KEYS` in `scripts/audit-registry-field-usage.mjs`.
2. If no — it's consumed by `src/bundle.mjs`, documentation, or tooling — add
   it to `KNOWN_NON_ENGINE_KEYS` with a one-line comment on where it IS
   consumed, and add a row to this table.
3. Either way, run `node scripts/audit-registry-field-usage.mjs` before
   committing. An "unclassified registry key" failure means you skipped step
   1 or 2.
