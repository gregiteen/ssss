---
type: project_document
title: SSSS_FRONTIER_IMPROVEMENTS — Architecture
tags: ["project-management", "SSSS_FRONTIER_IMPROVEMENTS"]
timestamp: 2026-07-10T00:00:00Z
---

# SSSS_FRONTIER_IMPROVEMENTS — Architecture

> **Project Prefix**: `SSSS_FRONTIER_IMPROVEMENTS`
> **Kanban State**: 🏗️ In Progress
> **Author**: Claude Code
> **Date**: 2026-06-30

---

Every item cites the exact file/line read in this repo as of the current uncommitted working
tree (12 modified files, +181/-19 per `git diff --stat`). None of these are hypothetical; all
were verified by direct inspection, not inferred from the spec alone.

## P0 — Land the WIP safely

### P0.1 — Fix fail-open RBAC default and the `event` `write:null` gap

**Where**: `src/engine.mjs`, Stage 5.5 (lines 243–267, uncommitted).

```js
// line 245 — current (fail-open)
const actorRole = envelope.actor?.role || 'admin';
```

Any envelope omitting `actor.role` is granted full admin (`write:*`, `read:*`). This directly
contradicts the Stage 3 mandate this repo just formalized in commit `7d84104` (v0.5.1): a host
that forgets to overwrite `actor` with verified identity should fail closed, not fail open to
admin.

Separately, the `event` envelope branch (lines 229–231) never assigns `resolvedType` — it stays
`null` from its declaration at line 193 — so Stage 5.5's `requiredPerm` becomes literally
`write:null` for every event write (line 258), a permission string no legitimate role can ever
hold except via a `*:*`/`write:*` wildcard.

**Design**:
- Change the default to fail-closed: `envelope.actor?.role ?? null`, and treat a `null`/absent
  role as an explicit deny (or map to a documented, zero-permission `anonymous` role) rather than
  `'admin'`.
- Resolve `resolvedType` for `event` envelopes before Stage 5.5 runs — either mirror the `delete`
  branch's pattern (read the existing file's frontmatter `type` if the event targets an existing
  path) or introduce a distinct `write:event` permission so event writes are gated by an explicit,
  documented permission rather than an accidental `write:null`.
- Add two conformance fixtures: (a) an envelope with no `actor` field is rejected outright, not
  admin-promoted; (b) an `event` envelope from a role lacking the relevant permission is correctly
  denied, and one holding it is correctly allowed.

**Blast radius**: `src/engine.mjs` only, plus `conformance/fixtures.json`. No registry or bundle
format changes. Must land *before* the current uncommitted diff is committed — this is a
pre-commit fix, not a follow-up task.

### P0.2 — Fix OKF skill citation links; reframe compliance language

**Where**: `.agents/skills/okf/SKILL.md` and its mirror `.claude/skills/okf/SKILL.md`.

Research (see Dev Plan / Tracker for the full dossier) confirms Google's Open Knowledge Format is
real: Google Cloud published it June 12, 2026 (official blog post, named authors), and
`GoogleCloudPlatform/knowledge-catalog` is a real, active, Apache-2.0 GitHub repo (verified via
`gh api`, 5,797 stars as of the research date). The skill's *technical description* of OKF
(directory of Markdown files, YAML frontmatter, `type` the only mandatory field, `index.md`/
`log.md` reserved files) matches the real `okf/SPEC.md` closely and needs no correction.

What's broken: the "Official Resources" links point to
`file:///Users/greg/Github/total-recall/knowledge-catalog` and
`file:///Users/greg/Github/total-recall/knowledge-catalog/okf/SPEC.md` — local filesystem paths
specific to one machine. They should be:
- `https://github.com/GoogleCloudPlatform/knowledge-catalog`
- `https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md`

Additionally, the "How SSSS Integrates with OKF" section currently asserts SSSS "is essentially a
strict, deterministic superset of OKF" and instructs agents to maintain OKF compatibility as an
ongoing mandate. There is no formal relationship between SSSS and OKF (no adoption announcement
from Google, no cross-reference, no certification program to conform to). Reword this section to
state plainly: *SSSS voluntarily tracks compatibility with OKF's concept model (type-first YAML
frontmatter, directory-of-Markdown, `index.md`/`log.md` conventions) as an interoperability goal
SSSS has chosen for itself — not a certified or contractual relationship.*

**Blast radius**: two Markdown files, documentation-only. Optionally, one informative (not
normative) sentence in `docs/ssss-spec.md` noting the interoperability goal for future readers.

## P1 — Close spec/reality drift and test-coverage gaps

### P1.1 — Amend spec §6.5 error codes; document Stage 5.5 in §6.3

`docs/ssss-spec.md:652-656` currently documents only `401`, `403`, `409`, `422`, `500`.
`conformance/README.md`'s own drift table (item #2) already flags that festech's real
implementation also returns `400` (path traversal / invalid request) and `404` (missing patch/
delete target) — an open, undecided reconciliation item, confirmed present in the file today.

Separately, Stage 5.5 (RBAC) exists only in `src/engine.mjs` and fixture-010; §6.3's pipeline
prose has not been updated to include it as a numbered stage. This is the exact kind of
spec/implementation drift this project's harvest-canonicalize methodology (see
`SSSS_V1_BUSINESS_BUNDLE`'s Architecture doc) is supposed to prevent.

**Design**: add rows for `400`/`404` to §6.5's table with the same one-line style as existing
rows; insert "Stage 5.5 — Granular Authorization" into §6.3's pipeline description between content
validation and commit, describing the *corrected* (fail-closed, post-P0.1) behavior. Update
`conformance/README.md`'s drift table to mark item #2 resolved once merged.

### P1.2 — Consolidate duplicate index.md generation

`scripts/autolink.mjs:238` already implements `generateIndexes(files, root, opts, summary)` for
spec §4.3 progressive disclosure, invoked at line 301 when `opts.index` is set. The uncommitted
WIP instead hand-rolled a second, independent index.md generator inline in
`scripts/build-reference-bundle.mjs:108-112` — confirmed by direct read, comment: `// Generate
index.md for progressive disclosure (§4.3)`. Two implementations of identical spec behavior will
now drift independently unless consolidated.

**Design**: export `generateIndexes` (or a reusable core function) from `scripts/autolink.mjs` and
import it into `scripts/build-reference-bundle.mjs` in place of the inline logic. Until the
duplication is removed, add a regression check (or extend the existing bundle round-trip check in
`scripts/conformance.mjs`) that fails if the two generators would produce different output.

### P1.3 — Conformance coverage for leases and the actor-overwrite mandate

`src/engine.mjs` implements `checkLease` (existence check, expiry-based auto-reclamation,
`lease_id` mismatch rejection) but `conformance/fixtures.json`'s current 10 fixtures contain zero
lease scenarios, and `docs/help/` (confirmed listing: `autolink.md`, `bundle.md`, `conformance.md`,
`export.md`, `import.md`, `overview.md`, `portability.md`, `provision.md`, `provisioning.md`,
`scaffold.md`) has no lease topic. Separately, spec §6.3 Stage 3 now MUSTs (v0.5.1) that a host
overwrite `actor` with verified session identity before RBAC use, but nothing in `conformance/`
demonstrates how a host proves it does this — reasonable, since the engine is a library without a
session layer, but still undocumented.

**Design**: add 2–3 fixtures — lease acquired then a conflicting write rejected `409`; lease
expiry auto-reclamation permitting a subsequent write; `lease_id` mismatch rejection. Add
`docs/help/leases.md` following the existing `docs/help/*.md` pattern. For the actor-overwrite
mandate, add a documented "host conformance pattern" (a clearly-marked illustrative fixture showing
a before/after `actor` field) so host implementers have something concrete to test against.

### P1.4 — Fix silent nested-map data loss in `serializeDocument`

`src/frontmatter.mjs:103` — `if (v && typeof v === 'object' && !Array.isArray(v)) continue; //
skip nested maps we can't round-trip`. Any `patch` envelope merging a nested-object frontmatter
field is silently dropped on write-back with no error, warning, or repair entry. Currently latent
(`security_role.permissions` is a flat array, so unaffected today) but a correctness landmine for
the next primitive that adds nested frontmatter — and a direct threat to the audit-trail guarantee
that is SSSS's core value proposition, since a "successful" patch could silently lose data.

**Design**: at minimum, change the silent `continue` to push a warning into the validation
`repair` array (or fail the operation) when a nested-map field would be dropped. Longer-term,
implement minimal nested-map serialization (one level deep, e.g. dotted-path emission) so patches
don't need the restriction at all. Add a conformance fixture that patches a nested field and
asserts either correct round-trip or explicit, visible rejection — never silent loss.

## P2 — Tooling, documentation, and interoperability positioning

### P2.1 — JSON Schema for `registry/core.json` and the `.ucw` bundle manifest

The registry's `$schema` field points to `https://ssss.dev/registry/v1`, a URL that likely does
not resolve. Neither `registry/core.json`'s own shape nor the `.ucw` bundle manifest has a
published JSON Schema or generated TypeScript types — only prose plus a `manifest_required_fields`
array. Third-party implementers, including this repo's own Track F consumers, have no
machine-checkable artifact to validate against short of re-reading `src/bundle.mjs`.

**Design**: publish `registry/core.schema.json` describing `registry/core.json`'s shape (families,
`required_fields`, `portability` enum, etc.) and a second schema for the `.ucw` bundle manifest's
required fields. Wire a validation step (extend `scripts/conformance.mjs` or add
`ssss validate-registry`) that checks `registry/core.json` and any extension registry against this
schema before the engine loads it. Host the schema at a stable in-package path and point the
`$schema` field at it.

### P2.2 — `docs/help/roles.md` for the `security_role`/RBAC primitive

`docs/help/` has topic docs for every other CLI-discoverable concept but none for the brand-new
`security_role` primitive, despite `ssss help <topic>` being the documented discovery mechanism.

**Design**: add `docs/help/roles.md` documenting the `security_role` shape, the canonical
`roles/<role>/ROLE.md` location, the permission-string grammar (`write:*`, `*:<type>`, etc.), and
the corrected fail-closed default once P0.1 lands. Wire it into `ssss help roles`.

### P2.3 — Adopt lock-file and GitHub-as-registry conventions from the `skills.sh` ecosystem for Track F

Live research on `skills.sh` (Vercel's open agent-skills directory, backed by the `vercel-labs/skills`
CLI) surfaced a directly transferable pattern: a `skills-lock.json`-style lock file, analogous to
`package-lock.json`, that pins the exact source/version of each installed skill so a team can
reproduce an identical set. Skills.sh also treats GitHub itself as the registry rather than a
hosted index — skills live as `SKILL.md` files in git repos, resolved and installed by URL/path
rather than published to a central store.

This maps directly onto the exact problem Track F rollout exists to solve: `conformance/README.md`'s
drift table exists because festech/ultrachat/total-recall each hold a private, divergent copy of
the Operation Contract instead of consuming `@gregiteen/ssss-cli`. A pinned lock file gives Track F a
concrete artifact to detect drift with, instead of relying on manual drift-table upkeep.

**Design**: define an `ssss-lock.json` format (or equivalent) that a consuming repo commits,
recording the exact `@gregiteen/ssss-cli` package version plus a content hash of the registry it has
adopted. Add `ssss lock` (write the lock file from the currently installed package) and
`ssss verify-lock` (fail — for CI — if the local registry's hash no longer matches the pinned
value). This is scoped as tooling this repo ships; it does not require touching festech/ultrachat/
total-recall directly, and Track F consumers can adopt it opportunistically once it exists.

**Non-owned**: this project does not execute Track F. The sequencing insight from research — start
with `total-recall` (smallest, memory-centric integration surface) before `ultrachat`, then
`festech` (118 extension primitives, ~4,024 vault files — highest blast radius) — should be handed
back to `SSSS_V1_BUSINESS_BUNDLE`'s own Tracker as a note, not re-tracked here.

## P3 — Marketplace-integrity proof

### P3.1 — Migration/upgrade conformance fixture for spec §17.4

The `migration` and `release` primitives exist in `registry/core.json` but zero conformance
coverage exercises spec §17.4's promised "structural-only patch, `tenant_private` untouched"
upgrade path — a marketplace-grade claim (buyers get updates without their private data touched)
currently unproven under test.

**Design**: add one conformance fixture (or a dedicated check following the existing bundle
round-trip pattern in `scripts/conformance.mjs`) that provisions a v1 vault, applies a migration
document patching only `structural` files, and asserts byte-for-byte that every `tenant_private`
file's `content_hash` is unchanged before/after.

## P4 — Semantic and translation architecture (implemented 2026-07-10)

The canonical Markdown layer remains unchanged by localization. `translation` documents are
structural overlays whose identity (`translation_id`, `source_path`, `locale`) is immutable and
whose `source_hash` binds them to exact source bytes. The semantic engine may overlay only title,
description, and body; all control fields come from the source.

`src/semantic.mjs` builds a deterministic projection:

```text
validated structural Markdown
  -> stable semantic identity + source hash
  -> localized surface overlay (optional, approved, hash-current)
  -> Unicode token record + explicit/wiki/Markdown graph edges
  -> query result or derived locale tree outside the vault
```

The trust boundary is portability-aware. Structural documents are eligible by default;
tenant-private and resource-bound documents require an explicit authorized opt-in. Registry
extension composition fails during load on malformed fields, invalid regexes, symlinks, or type
collisions. Bundle import preflights the entire envelope plan before committing, so registry and
reference failures are atomic at the plan boundary.
