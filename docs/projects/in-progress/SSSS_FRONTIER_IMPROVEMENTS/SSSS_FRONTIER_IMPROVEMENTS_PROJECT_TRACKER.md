---
type: project_document
title: SSSS_FRONTIER_IMPROVEMENTS — Tracker
tags: ["project-management", "SSSS_FRONTIER_IMPROVEMENTS"]
timestamp: 2026-07-10T00:00:00Z
---

# SSSS_FRONTIER_IMPROVEMENTS — Tracker

> **Project Prefix**: `SSSS_FRONTIER_IMPROVEMENTS`
> **Kanban State**: 🏗️ In Progress
> **Author**: Claude Code
> **Date**: 2026-06-30

---

> Status legend: `[ ]` todo · `[/]` in progress · `[x]` done · `[~]` done-with-deferral (note inline).

### Phase 1 — Land the WIP safely ✅
- `[x]` Fix Stage 5.5 fail-open RBAC default in `src/engine.mjs` (`actor.role` absent now
  denies; only an explicit `'system'`/`'admin'` bypasses) — **P0**
- `[x]` Fix `event` envelope permission resolution — gated on the fixed `write:event`
  permission instead of the unsatisfiable `write:null` — **P0**
- `[x]` Add conformance fixtures for both Stage 5.5 fixes (fixture-011 no-actor rejection;
  fixture-015/016 write:event allowed; fixture-017/018 read-only role denied on event write)
- `[x]` Correct `.agents/skills/okf/SKILL.md` (+ `.claude/skills/okf` symlink) links from
  `file://` paths to the real `https://github.com/GoogleCloudPlatform/knowledge-catalog` URLs;
  reframed the OKF section as voluntary interoperability, not compliance/certification — **P0**
- `[x]` Consolidated index.md generation: `scripts/autolink.mjs`'s `generateIndexes()` is now
  exported and reused by `scripts/build-reference-bundle.mjs`. In the process, fixed a real bug
  in the ORIGINAL `autolink.mjs` version (it never indexed intermediate ancestor directories,
  e.g. `roles/index.md` for `roles/admin/ROLE.md`) and caught a regression introduced while
  fixing it (a spurious vault-root `index.md` that broke bundle import — the engine's index
  bypass only matches `*/index.md`, not a bare root `index.md`) before it shipped.
- `[x]` Committed-readiness: `npm test` (`node scripts/conformance.mjs conformance --engine`)
  passes 18/18 fixtures + 6/6 bundle checks after all Phase 1 fixes.

### Phase 1.5 — New finding (not in original scope): registry/engine enforcement gap ✅
- `[x]` Discovered and fixed: `registry/core.json`'s `memory` primitive declared
  `required_when` (conditional fields for `schema_version: 2`) and `enums` (category/modality/
  sentiment_polarity/priority) that `validateContent()` in `src/engine.mjs` never read —
  a document could violate either declared constraint and still validate. Implemented
  enforcement for both in `src/engine.mjs`.
- `[x]` Added conformance fixtures 012–014 proving both the positive and negative cases.
- `[x]` Built `scripts/audit-registry-field-usage.mjs` — a static, deterministic check that
  every registry field an enforcement-relevant key (`required_fields`/`required_when`/`enums`/
  `append_only`) is actually referenced in `src/engine.mjs` + `src/registry.mjs`, or flags an
  "unclassified registry key" if a new field hasn't been triaged. **Wired into `npm test` /
  `ssss conformance` permanently** so this exact class of drift can never silently regress again
  — this is the "automatic, not agent-invoked" half of the tooling this project's Phase 3
  originally only imagined as an agent skill.

### Phase 2 — Close spec/reality drift and test-coverage gaps 🏗️ (partially done)
- `[x]` Amended spec §6.5 to add error codes `400` and `404`; resolved `conformance/README.md`
  drift item #2 (marked ✅, confirmed via the new `diff-reconciliation-table.mjs` tool)
- `[x]` Documented Stage 5.5 RBAC as a numbered stage (`5.5`) in spec §6.3, including the
  fail-closed-on-missing-actor requirement
- `[x]` Wrote `docs/help/roles.md` for the `security_role`/RBAC primitive (auto-discovered by
  `ssss help roles`)
- `[~]` Add lease acquire/conflict/expiry conformance fixtures and `docs/help/leases.md`
  — transferred to `docs/projects/completed/IMPROVEMENTS/` and implemented there.
- `[~]` Fix silent nested-map drop in `src/frontmatter.mjs`'s `serializeDocument` (add warning/
  repair signal, don't silently lose data); add regression fixture — transferred to
  `docs/projects/completed/IMPROVEMENTS/` and implemented there.

### Phase 3 — Tooling, migration proof, and interoperability positioning ⬜ (mostly deferred)
- `[ ]` Publish JSON Schema for `registry/core.json` and the `.ucw` bundle manifest; fix the dead
  `$schema` URL
- `[ ]` Design and ship `ssss-lock.json` + `ssss lock` / `ssss verify-lock`, adapted from the
  `skills.sh` ecosystem's lock-file pattern, to detect registry drift with consumers
- `[ ]` Add migration conformance fixture proving structural-only patch leaves `tenant_private`
  files untouched (spec §17.4)
- `[ ]` Hand the Track F sequencing note (start with `total-recall`, then `ultrachat`, then
  `festech` last) to `SSSS_V1_BUSINESS_BUNDLE`'s Tracker — **do not re-track Track F execution
  here; it remains owned by that project**

### Phase 4 — Ship skills as a first-class, dogfooded SSSS primitive ✅
Prompted by: "we can deploy skills in both [total-recall and here] and we need to fix the
skills with required folders and proper frontmatter — complement the ssss format, why not,
it's open source." Turned out `registry/core.json` and `docs/ssss-spec.md` §5.4 had already
fully specified a `skill` primitive (`type`/`name`/`description`, portability `structural`) —
it just had zero fixture coverage and was actively contradicted by this repo's own tooling.
- `[x]` **Fixed a real spec contradiction**: `skill`'s own format guide told agents `type: skill`
  was a frontmatter anti-pattern; the registry and spec both REQUIRE it. Corrected the guide
  (`skills/skill/SKILL.md` v2.1.0) — the actual anti-pattern is memory-node-only fields
  (`slug`/`category`/`schema_version`/etc.), not `type`.
- `[x]` Created a new **tracked, non-gitignored** `skills/` directory at repo root — until this
  phase, `.claude/`, `.agent/`, and `.agents/` were ALL wholesale gitignored, so none of this
  repo's 8+ skills were part of the published, open-source project at all.
- `[x]` Migrated the original 5 SSSS-relevant skills into it, adding the missing `type: skill`
  discriminator to every one: `skill`, `okf`, `ssss-project-management`,
  `ssss-registry-parity-auditor`, `rbac-fail-open-auditor`. Also stripped a prompt-injection
  payload (`<!-- BEGIN INJECTED MEMORY -->` block containing directives like "do not mention
  Windsurf" and a canary string) that was present in the shipped copy of `skill`'s SKILL.md —
  not appropriate to publish in an open-source file regardless of its origin.
- `[x]` Built out real required-folder content for the two skills that had none at all (`okf`,
  `ssss-project-management`) rather than stub files: a working `scripts/scaffold-project.mjs`
  that automates the previously-manual "create 4 canonical docs" workflow (tested against a
  scratch repo — creates, refuses to duplicate an existing prefix, rejects non-SCREAMING_SNAKE
  prefixes), a link-checker for `okf`'s cited URLs (`scripts/check-okf-links.mjs`, tested live —
  all 3 citations resolve), plus reference docs, evals.json (3-5 assertions each), and subagent
  audit prompts for both.
- `[x]` Fixed a second overclaim while in the neighborhood: `ssss-project-management`'s SKILL.md
  said SSSS is "Fully compliant with Google OKF" — directly contradicting the voluntary/no-formal-
  relationship framing already established in the `okf` skill fix (Phase 1). Corrected.
- `[x]` Added conformance fixtures 019–021 for the `skill` primitive — zero fixture coverage
  existed for it before this phase despite the primitive being defined since early registry
  versions. Valid case reuses the spec §5.4 example verbatim; two violation cases (missing
  `type`, missing `description`).
- `[x]` Built `scripts/validate-skills.mjs` — validates every skill under `skills/` against the
  registry's `skill` primitive (frontmatter) AND the required-directory-structure convention,
  wired into `npm test` as a permanent automatic guard (mirrors the Phase 1.5 pattern).
- `[x]` Repointed `.claude/skills/{skill,okf,ssss-project-management,ssss-registry-parity-auditor,
  rbac-fail-open-auditor}` symlinks to the new tracked `skills/<name>/` locations; deleted the
  now-stale duplicate copies that used to live under gitignored `.agent/`/`.agents/`.
- `[x]` Added the missing core `skills/ssss/` package as the sixth tracked SSSS skill and included
  it in the npm package allowlist. It now
  routes agents to live package/registry/spec/conformance evidence, distinguishes the reference
  kernel from host adapters, ships a dependency-free validator, and replaces the installed
  global stub whose validator failed at startup on a missing `gray-matter` dependency.
- `[ ]` **Not done this phase — explicit follow-up, different repo**: build an actual "skill
  deployer" in `~/Github/total-recall` (a push/publish command, complementing its existing
  pull-only `sync-repo.mjs`) so Total-Recall-personal skills (`total-recall`, `research`,
  `cli-agents` — deliberately NOT migrated into this repo's `skills/`, since they're about a
  different system, not SSSS) can be shared across projects the same way. Out of this repo's
  scope; requires its own session against that repo.

### Phase 5 — Semantic, translatable, secure extension kernel ✅

- `[x]` Promoted registry `patterns`, `immutable_fields`, and `references` into enforced engine
  behavior and extended the parity auditor so future schema fields cannot remain decorative.
- `[x]` Hardened extension loading: validates definition shape and regexes, sorts deterministically,
  rejects symlinks/reserved names, and fails on core or sibling primitive collisions.
- `[x]` Added the core `translation` primitive and spec §11.9: exact-hash structural sources,
  immutable overlay identity, approved-by-default application, and natural-language-only fields.
- `[x]` Added `src/semantic.mjs` plus `ssss semantic`: deterministic Unicode tokens, stable
  identities, explicit/wiki/Markdown graph edges, localized ranking, and structural-only privacy
  defaults with an explicit high-trust private opt-in.
- `[x]` Added `ssss localize`: atomic materialization outside the source vault into an empty,
  non-symlinked derived tree with a rebuildable projection manifest.
- `[x]` Made bundle validation enforce registry references and changed import to validate the
  complete plan before its first commit, preventing partial installs on late failures.
- `[x]` Added fixtures 024–026 and dedicated extension-registry (7 checks), semantic/localization
  (16 checks), bundle/provisioning (14 checks), and CLI (4 checks) conformance groups.
- `[x]` Updated the tracked/package SSSS skill, validator, reference, evals, offline help, README,
  spec v0.7, security/UX impact report, reference bundle, and active/global skill mirrors.

### Related tooling built this session (agent skills, not part of the 4-phase plan above)
The two audit skills referenced in Phase 1.5/Phase 4 are now shipped at `skills/` (tracked,
open-source), not `.agent/skills/` — see Phase 4 above for the migration. Their content is
otherwise unchanged from when they were first built:
- `ssss-registry-parity-auditor` — wraps `scripts/audit-registry-field-usage.mjs` plus
  `audit-spec-refs.mjs` (checks every `spec_ref` resolves to a real spec heading) and
  `diff-reconciliation-table.mjs` (flags stale rows in `conformance/README.md`'s drift table).
- `rbac-fail-open-auditor` — builds and runs an adversarial Stage 5.5 envelope matrix
  (`enumerate-envelopes.mjs` + `probe-rbac.mjs`), and converts confirmed fail-open findings into
  conformance-fixture-shaped regression tests (`emit-negative-fixtures.mjs`). Verified against
  this repo's own historical bug: reintroducing the original `|| 'admin'` fail-open default into
  a scratch copy of `src/engine.mjs` and re-running the probe produces exactly 1 fail-open
  finding, 0 against every other scenario.

All 6 shipped skills pass `node scripts/validate-skills.mjs` (wired into `npm test`) cleanly.

### Cross-Project Notes
- This project does **not** own Track F (cross-repo rollout). See
  `docs/projects/in-progress/SSSS_V1_BUSINESS_BUNDLE/SSSS_V1_BUSINESS_BUNDLE_PROJECT_TRACKER.md`
  for that track's live status. Only the sequencing insight from research is handed back here.
- This project does **not** own the total-recall skill-deployer work (Phase 4's last item) —
  that belongs to `~/Github/total-recall`'s own tracker, not this one, once someone works there.
- `research` and `cli-agents` (under `.agent/skills/`, vendored inside the `total-recall`
  package) still have pre-existing format violations (missing required dirs, an invalid `type`
  field). Deliberately left alone this session — they're Total-Recall-specific, not SSSS-specific,
  so out of scope for what's shipped in *this* repo's `skills/`. Previously flagged separately
  via a spawned background task, not tracked here.

### Verification Log
- 2026-06-30 — Project created via repo analysis (uncommitted WIP + committed history read
  directly) cross-referenced against four live 2026 web-research tracks (OKF, skills.sh,
  AI-native docs, SWE/agentic-coding trends).
- 2026-06-30 — **Phase 1 landed.** `src/engine.mjs` Stage 5.5: fail-closed default
  (`actor.role` absent → deny), `event` envelopes gated on `write:event` instead of
  `write:null`. `.agents/skills/okf/SKILL.md` links fixed + reframed. Index.md generation
  consolidated into `scripts/autolink.mjs`'s `generateIndexes()` (also fixed two real bugs found
  in the process — see Phase 1 notes above). `conformance/fixtures.json` gained fixtures
  011–018 (8 new, all passing). `npm test` → 18/18 fixtures + 6/6 bundle checks, confirmed via
  `node scripts/conformance.mjs conformance --engine` and `node scripts/build-reference-bundle.mjs`.
- 2026-06-30 — **Phase 1.5 (new finding, not originally scoped).** Registry/engine parity gap
  found and fixed: `required_when`/`enums` on the `memory` primitive were declared but
  unenforced. Implemented enforcement in `validateContent()`; added fixtures 012–014; built and
  wired `scripts/audit-registry-field-usage.mjs` into `npm test` as a permanent, automatic
  regression guard for this entire class of bug (not just this one instance).
- 2026-06-30 — **Phase 2 partially landed.** Spec §6.5 gained `400`/`404`; `conformance/README.md`
  drift item #2 marked resolved (verified via the new `diff-reconciliation-table.mjs`, which
  correctly reported it open before the fix and clean after). Spec §6.3 gained Stage 5.5 as a
  documented numbered pipeline stage. `docs/help/roles.md` written and auto-discovered by
  `ssss help roles`. Lease fixtures and the nested-map serialization fix remain open — deferred,
  not started this session (larger scope than the rest of this pass).
- 2026-06-30 — Built two agent-skill packages (`ssss-registry-parity-auditor`,
  `rbac-fail-open-auditor`) as automation for this exact class of audit going forward; both
  tested against this repo (clean on the fixed state, and `rbac-fail-open-auditor`'s probe was
  additionally verified to catch the original bug when deliberately reintroduced into a scratch
  copy). Full details in the "Related tooling" section above.
- 2026-07-10 — Added tracked `skills/ssss/`, synchronized the active/global SSSS skill surfaces,
  removed the installed validator's undeclared `gray-matter` dependency, corrected bundle
  exporter identity to `@gregiteen/ssss-cli@0.7.1`, and extended bundle conformance to pin both
  default and reference provenance to package metadata. `npm test` passes with 6 shipped skills
  and 11/11 bundle/provisioning checks.
- 2026-07-10 — **Phase 5 landed.** Core spec/registry moved to v0.7 with translation overlays,
  deterministic semantic search/localization, strict extension composition, executable pattern/
  immutable/reference constraints, and two-phase bundle import. Expanded conformance passes
  26/26 fixtures, 8/8 runtime, 7/7 operation regressions, 7/7 extension registries, 16/16
  semantic/localization, 14/14 bundle/provisioning, and 4/4 CLI checks.
