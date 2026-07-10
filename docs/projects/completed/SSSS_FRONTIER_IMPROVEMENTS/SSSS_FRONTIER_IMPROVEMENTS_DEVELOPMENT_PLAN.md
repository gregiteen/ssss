---
type: project_document
title: SSSS_FRONTIER_IMPROVEMENTS — Development Plan
tags: ["project-management", "SSSS_FRONTIER_IMPROVEMENTS"]
timestamp: 2026-07-10T00:00:00Z
---

# SSSS_FRONTIER_IMPROVEMENTS — Development Plan

> **Project Prefix**: `SSSS_FRONTIER_IMPROVEMENTS`
> **Kanban State**: 🏗️ In Progress
> **Author**: Claude Code
> **Date**: 2026-06-30

---

## Research Dossier (evidence base for this plan)

Four live web-research tracks (2026-06-30) inform the prioritization below:

1. **OKF** — Google Cloud's Open Knowledge Format, announced 2026-06-12, is **verified real**
   (official blog post, named authors; `GoogleCloudPlatform/knowledge-catalog` confirmed via GitHub
   API — Apache-2.0, 5,797 stars). The repo's own `okf` skill correctly describes the spec but
   cites broken local file:// links instead of the real GitHub URLs.
2. **`skills.sh`** — Vercel's open Agent Skills Directory (`vercel-labs/skills` CLI, `npx skills`),
   launched ~Jan–Feb 2026. Uses GitHub itself as the registry (skills live as `SKILL.md` files in
   git repos) and an emerging `skills-lock.json` pattern for reproducible installs, analogous to
   `package-lock.json`.
3. **AI-native docs (`DESIGN.md`, `AGENTS.md`, `llms.txt`, spec-driven development)** —
   `AGENTS.md` is now stewarded by the Linux Foundation's Agentic AI Foundation (est. 2025-12-09),
   60,000+ repos, 28+ tools. Google Labs open-sourced `DESIGN.md` (2026-04-21, Apache 2.0,
   11,000+ stars), the closest structural analog to SSSS's frontmatter-tokens-plus-prose pattern.
   Spec-driven development (GitHub Spec Kit, AWS Kiro, etc.) is the dominant 2026 discipline for
   controlling agentic-coding output quality.
4. **2026 SWE/agentic-coding trends** — Multi-agent orchestration adoption has surged; MCP has
   ~97M monthly downloads and 10,000+ servers but sits in active "Skills vs MCP" debate with
   Markdown-based Skills for procedural playbooks; database-free, Markdown-first agent memory is a
   named, real pattern (`memweave`, `gitagent-protocol`) directly adjacent to SSSS's positioning;
   AI-generated code shows materially higher defect/security rates than human code, driving demand
   for exactly the auditable, diffable, schema-validated state model SSSS already provides.

**Net read**: SSSS's thesis is validated by convergent 2026 prior art. The work below is not about
proving the bet — it's about making sure the implementation and the spec keep telling the truth
about each other, and about not shipping the one security regression currently sitting uncommitted.

## Phase 1 — Land the WIP safely (security + correctness fixes before commit)

Blocking. The current uncommitted diff (12 files, +181/-19) must not be committed until this
phase lands, since it introduces the fail-open RBAC default.

1. Fix Stage 5.5 fail-open default in `src/engine.mjs` (`actor.role` absent → deny, not `'admin'`).
2. Fix `event` envelope `resolvedType` resolution so Stage 5.5 doesn't check `write:null`.
3. Add conformance fixtures proving both fixes (no-`actor` rejection; event-role denial/allow).
4. Fix broken `file://` links in `.agents/skills/okf/SKILL.md` and `.claude/skills/okf/SKILL.md`;
   reword the OKF section to "voluntary interoperability goal" framing.
5. Consolidate index.md generation: import `scripts/autolink.mjs`'s `generateIndexes()` into
   `scripts/build-reference-bundle.mjs` instead of the duplicated inline logic.
6. Commit the WIP only after 1–5 are folded in; re-run
   `node scripts/conformance.mjs conformance --engine` to confirm still-green plus new fixtures.

## Phase 2 — Close spec/reality drift and test-coverage gaps

Depends on Phase 1 landing (so the spec documents corrected, not buggy, behavior).

1. Amend `docs/ssss-spec.md` §6.5 to add error codes `400` and `404`; update
   `conformance/README.md`'s drift table item #2 to resolved.
2. Document Stage 5.5 as a numbered pipeline stage in `docs/ssss-spec.md` §6.3.
3. Add `docs/help/roles.md` for the `security_role`/RBAC model.
4. Add lease acquire/conflict/expiry conformance fixtures + `docs/help/leases.md`.
5. Fix the silent nested-map drop in `src/frontmatter.mjs`'s `serializeDocument` (warn or reject,
   not silent loss); add a regression fixture.

## Phase 3 — Tooling, migration proof, and interoperability positioning

Independent of Phase 2 internally, but sequenced last since it's lower-risk, higher-effort tooling
work rather than correctness fixes.

1. Publish JSON Schema for `registry/core.json` and the `.ucw` bundle manifest; host at a stable
   in-package path; fix the dead `$schema` URL.
2. Design and ship `ssss-lock.json` + `ssss lock` / `ssss verify-lock`, adapting the `skills.sh`
   ecosystem's lock-file pattern to detect registry drift between this repo and its consumers.
3. Add a migration/upgrade conformance fixture proving a v2→v1 structural-only patch leaves
   `tenant_private` files byte-identical (spec §17.4).
4. Hand the Track F sequencing insight (start with `total-recall` — smallest, memory-centric
   surface — before `ultrachat`, then `festech` last given its size) back to
   `SSSS_V1_BUSINESS_BUNDLE`'s own Tracker as a note. **Do not re-open or re-own Track F execution
   in this project's tracker** — it remains owned by that project.

## Sequencing Rationale

Phase 1 is strictly ordered first because it blocks a commit that is sitting in the working tree
right now — every day it's uncommitted is a day the fix is easy; once merged and built on top of,
the fail-open default becomes a live production behavior to patch around instead of a WIP bug to
correct. Phase 2 depends on Phase 1's corrected behavior being the thing the spec describes. Phase
3 has no hard dependency on Phase 2 but is intentionally sequenced last: it is real, valuable
tooling work (schema, lock file, migration proof) rather than a correctness or security fix, and
none of it should compete for attention with Phase 1.

## Phase 4 — Semantic, translation, and extension hardening (completed 2026-07-10)

1. Make registry declarations executable by enforcing regex patterns, immutable fields, and
   document reference constraints in the engine and bundle paths.
2. Fail extension composition closed on malformed schemas, symlinks, reserved names, invalid
   regexes, and core/sibling type collisions.
3. Add the `translation` primitive and spec §11.9 with exact source hashes, structural-only
   targets, approved-by-default overlays, and immutable symbolic control fields.
4. Build dependency-free semantic search and graph projection with stable identities, Unicode
   tokens, localized surfaces, and structural-only privacy defaults.
5. Materialize localized trees only outside the source vault and record a rebuildable manifest.
6. Preflight every bundle import envelope before the first commit.
7. Ship CLI/help/library/skill surfaces and positive, negative, privacy, collision, stale-hash,
   traversal, deterministic, and idempotency conformance coverage.
