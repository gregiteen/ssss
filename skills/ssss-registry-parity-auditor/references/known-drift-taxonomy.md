# Known drift taxonomy — SSSS registry/spec/engine

Real drift classes found in this repo, each a worked case study. Use these as
the pattern library when triaging a new finding — most future drift will
look like one of these.

## Class 1 — Declared-but-unenforced registry field

**Case study**: `registry/core.json`'s `memory` primitive declared
`required_when: {"schema_version==2": ["confidence", "importance", "modality",
"subject", "predicate", "object", "sentiment_polarity"]}` and an `enums`
block (`category`, `modality`, `sentiment_polarity`, `priority`) from the
primitive's introduction — but `src/engine.mjs`'s `validateContent()`
originally only ever iterated `def.required_fields`. Neither `required_when`
nor `enums` was read anywhere in the write path. A memory node could declare
`schema_version: 2` and omit every conditionally-required field, or set
`category: "nonsense"`, and still pass validation and conformance.

**Why it was invisible**: the registry stayed valid JSON, every existing
conformance fixture still passed (none of them exercised `schema_version: 2`
or an out-of-enum value), and `ssss conformance`'s structural/registry checks
only validate that every primitive *declares* a `portability` class — they
never cross-reference declared fields against engine behavior.

**Fix pattern**: implement the missing enforcement in `validateContent()`
(see `src/engine.mjs`'s `required_when`/`enums` loops for the canonical
shape), then add positive AND negative conformance fixtures (see fixtures
012-014 in `conformance/fixtures.json`), then make the gap permanently
un-reintroducible with a static cross-check — this is exactly what
`scripts/audit-registry-field-usage.mjs` now does on every `npm test` run.

**How to find more of these**: run `node scripts/run-parity-audit.mjs`. Any
"unclassified registry key" output means a new field was added and nobody
decided yet whether the engine should enforce it — triage it immediately,
don't let it sit unclassified.

## Class 2 — Spec/implementation stage drift

**Case study**: Stage 5.5 (Granular Authorization / RBAC) was implemented
directly in `src/engine.mjs` — including the `security_role` primitive,
`roles/<role>/ROLE.md`, and the permission grammar — but `docs/ssss-spec.md`
§6.3's numbered pipeline prose was never updated to mention it. The spec and
the reference implementation it's supposed to describe silently diverged the
moment the code shipped.

**Fix pattern**: whenever a new pipeline stage, envelope type, or validation
step lands in `src/engine.mjs`, grep `docs/ssss-spec.md` §6.3 for whether the
numbered stage list already accounts for it. If not, that's a drift item —
open one the same way `conformance/README.md`'s reconciliation table does.

## Class 3 — Duplicate implementations of the same spec behavior

**Case study**: `scripts/autolink.mjs` implemented `index.md` generation
(spec §4.3, progressive disclosure) as `generateIndexes()`. Independently,
`scripts/build-reference-bundle.mjs` hand-rolled a *second*, structurally
different index generator inline — one that (unlike the first) correctly
walked intermediate ancestor directories but (unlike the first) used raw
filenames instead of frontmatter `title`/`name` as link labels, and didn't
sort output deterministically. Two implementations of "the same" spec
behavior had silently diverged in *opposite* ways.

**Fix pattern**: when you find two implementations of one spec behavior,
don't assume either is fully correct — diff their actual output on a
non-trivial fixture (nested directories, in this case) before picking one to
keep. The consolidated version in `scripts/autolink.mjs` now does what
*both* originals were individually missing.

## Class 4 — Non-portable or unverifiable citations

**Case study**: `.agents/skills/okf/SKILL.md` cited
`file:///Users/greg/Github/total-recall/knowledge-catalog` as its "Official
Resources" link — a path that only resolves on one developer's machine. The
underlying claim (Google's Open Knowledge Format is real) turned out to be
true when independently web-verified, but the citation itself was broken for
anyone else, and the skill additionally overclaimed a formal
"OKF-compliant superset" relationship that doesn't exist.

**Fix pattern**: any citation to an external standard should (a) be a public
URL, not a local path, and (b) state precisely what kind of relationship
exists (voluntary interoperability goal vs. a real, verifiable compliance
program) — don't let "we track this standard's ideas" quietly become "we are
certified against this standard" in the prose.

## Class 5 (found but not yet closed) — Multi-condition `required_when` gap

`docs/ssss-spec.md` §5.4's `memory` prose says: *"Memory nodes in the
`invariants` category additionally carry `priority: absolute` and
`immutable: true`."* This is a second conditional-requirement rule
(`category == "invariants"` implies `priority` and `immutable` are
required) that is NOT yet encoded in `registry/core.json`'s `required_when`
block (which only has the `schema_version==2` condition) — and `immutable`
isn't declared as a field on the `memory` primitive at all yet. The engine's
`required_when` mechanism already supports multiple condition keys (it's a
plain map), so encoding this is a registry data change plus a new
conformance fixture, not an engine change. Left open deliberately as the
next concrete task for this skill to pick up.
