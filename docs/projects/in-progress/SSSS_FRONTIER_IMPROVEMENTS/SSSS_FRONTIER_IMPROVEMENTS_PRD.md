---
type: project_document
title: SSSS_FRONTIER_IMPROVEMENTS — PRD
tags: ["project-management", "SSSS_FRONTIER_IMPROVEMENTS"]
timestamp: 2026-06-30T00:00:00Z
---

# SSSS_FRONTIER_IMPROVEMENTS — PRD

> **Project Prefix**: `SSSS_FRONTIER_IMPROVEMENTS`
> **Kanban State**: 🏗️ In Progress
> **Author**: Claude Code
> **Date**: 2026-06-30

---

## 0. Origin

This project was produced by a repo analysis of `ssss` (architecture, recent commits, and the
current uncommitted working tree) cross-referenced against four live 2026 web-research tracks:
Google Cloud's Open Knowledge Format (OKF), the agent-skill distribution ecosystem (`skills.sh`),
AI-native documentation conventions (`DESIGN.md`, `AGENTS.md`/`CLAUDE.md`, `llms.txt`,
spec-driven development), and broader 2026 SWE/agentic-coding trends. Every item below is
grounded in a specific file/line read directly from this repo, not general advice — see the
Architecture doc for citations.

## 1. Vision

**Keep SSSS's spec and its reference implementation provably in sync, close the gaps that would
undermine trust in it as a standard, and position it deliberately within the 2026 wave of
Markdown+YAML-frontmatter agent-context formats it now has real, verified prior art alongside
(OKF, DESIGN.md, AGENTS.md, SKILL.md) — instead of drifting quietly the way `conformance/README.md`'s
own drift table shows it already has once.**

SSSS's core thesis — a database-free, Markdown-first schema and mutation contract for AI agent
state — is no longer a niche bet. 2026 research independently confirms convergent prior art at
every layer SSSS touches: Google Cloud's OKF (announced June 12, 2026) at the general
knowledge-bundle layer, `AGENTS.md`/`SKILL.md` at the instruction layer (Linux Foundation's
Agentic AI Foundation, 60,000+ repos), `DESIGN.md` at the structured-token layer, and named
"markdown-first agent memory" projects (`memweave`, `gitagent-protocol`) at the memory layer this
repo's own sibling app `total-recall` occupies. This validates the bet. It does not excuse the
gaps found underneath it.

## 2. Problem Statement

Repo analysis surfaced eleven concrete gaps, ranging from a live security regression in
uncommitted code to strategic positioning debt. They fall into three buckets:

1. **A security regression is about to be committed.** The uncommitted Stage 5.5 RBAC gate in
   `src/engine.mjs` defaults a missing `actor.role` to `'admin'` (fail-open) and never resolves
   `resolvedType` for `event` envelopes, so every event write is silently checked against
   `write:null`. This directly contradicts the Stage 3 security mandate this repo formalized in
   its immediately preceding commit (`7d84104`, v0.5.1). It must not ship as-is.
2. **The repo's own self-description contains a citation bug that looks worse than it is.** The
   `okf` skill (`.agents/skills/okf/SKILL.md`, mirrored at `.claude/skills/okf/SKILL.md`) cites
   `file:///Users/greg/Github/total-recall/knowledge-catalog` — a local path on one developer's
   machine — as its "Official Resources." Research confirms Google's OKF is real and the skill's
   *technical description* of it is accurate; only the links are broken and non-portable, and the
   "SSSS is a strict superset of OKF" framing overstates a relationship that does not formally
   exist (no adoption announcement, no cross-reference from Google's side).
3. **Spec/implementation drift and undertested surfaces.** Error codes 400/404 exist in a real
   host (festech) but not in spec §6.5. Stage 5.5 RBAC exists in code but not in spec §6.3. Index
   generation is implemented twice (`scripts/autolink.mjs` and `scripts/build-reference-bundle.mjs`)
   independently. Leases and the actor-overwrite mandate ship with zero conformance coverage. A
   silent data-loss path exists in frontmatter nested-map serialization. No JSON Schema exists for
   `registry/core.json` or the `.ucw` manifest despite the registry's own `$schema` field pointing
   at a URL that likely does not resolve.

## 3. Goals & Non-Goals

**Goals**
- Land the uncommitted WIP (`security_role`/RBAC + index.md generation) *safely* — fail-closed by
  default, no `write:null` gap — before it is committed.
- Correct the repo's OKF citations and reframe OKF compatibility as a voluntary interoperability
  goal, not a claimed certification.
- Close the specific spec/implementation drift items identified (error codes, Stage 5.5
  documentation, duplicate index generation).
- Add conformance coverage for two real-but-untested pipeline features (leases, actor-overwrite).
- Fix the one identified latent correctness bug with repo-wide blast radius (nested-map frontmatter
  data loss).
- Ship a machine-checkable schema for the registry and bundle manifest so third-party implementers
  (including this repo's own Track F rollout) have something to validate against besides reading
  source.
- Feed the 2026 agent-skill-distribution research (lock files, GitHub-as-registry) into how Track F
  rollout is executed, without re-owning Track F itself.

**Non-Goals (this phase)**
- Re-tracking or re-scoping Track F (cross-repo rollout into festech/ultrachat/total-recall) — that
  track is already owned by `docs/projects/in-progress/SSSS_V1_BUSINESS_BUNDLE/`. This project only
  hands back sequencing guidance (start with total-recall, lowest blast radius) discovered during
  research; it does not duplicate or fork that tracker.
- Building marketplace-grade bundle signing/verification tooling for the `provenance.signature`
  field — flagged as real but explicitly out of scope until a marketplace track exists.
- Any performance work on the Stage 5.5 `ROLE.md` re-read-per-operation pattern — noted as a valid
  follow-up but explicitly not urgent at current scale, and must not block or be conflated with the
  P0 security fix.
- Claiming or pursuing formal certification against Google's OKF — SSSS may voluntarily track
  interoperability; it has no path to or need for "compliance" with an external body that does not
  offer one.

## 4. Users

- **SSSS maintainers** — need the spec and `src/engine.mjs` to stay provably synchronized, and need
  the uncommitted WIP to land without shipping a security regression.
- **Third-party implementers** (festech, ultrachat, total-recall, and any future host) — need a
  machine-checkable schema and documented error/permission contract to validate against, not just
  prose and source-reading.
- **Anyone evaluating SSSS against 2026 prior art** (OKF, AGENTS.md, DESIGN.md) — needs the repo's
  own claims about that prior art to be accurate and honestly scoped.

## 5. Success Criteria

- `node scripts/conformance.mjs conformance --engine` passes with new fixtures proving (a) an
  envelope with no `actor` is rejected, not admin-promoted, and (b) an `event` envelope is checked
  against a real resolved type, not `write:null`.
- Both `okf` `SKILL.md` copies link to `https://github.com/GoogleCloudPlatform/knowledge-catalog`
  and describe OKF interoperability as voluntary, not a compliance claim.
- `docs/ssss-spec.md` §6.5 lists 400/404; §6.3 documents Stage 5.5 as a numbered pipeline stage
  matching the corrected (fail-closed) implementation.
- `scripts/build-reference-bundle.mjs` imports `generateIndexes` from `scripts/autolink.mjs`
  instead of a second inline implementation.
- Conformance fixtures exist for lease acquire/conflict/expiry and the actor-overwrite mandate;
  `docs/help/leases.md` and `docs/help/roles.md` exist.
- A patch containing a nested-object frontmatter field either round-trips correctly or is visibly
  rejected — never silently dropped.
- `registry/core.schema.json` (or equivalent) exists and is wired into `ssss validate`/conformance;
  the registry's `$schema` field resolves to a real in-package path.
- `SSSS_V1_BUSINESS_BUNDLE`'s Tracker (owned separately) has received the Track F sequencing note
  from this project (start with total-recall) — this project does not need to execute Track F to
  be considered complete.
