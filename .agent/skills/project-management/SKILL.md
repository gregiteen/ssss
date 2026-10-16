---
name: project-management
description: "Use this skill when managing project documentation, GitHub issues, pull requests, and project tracker checklists in ANY repository. Defines the universal 5-file Kanban documentation system shared across all repos: the AUDIT comes first and must be complete before the PRD, ARCHITECTURE, DEVELOPMENT_PLAN and PROJECT_TRACKER are written. Do NOT use for code implementation. MANDATORY: You MUST read the full SKILL.md file before executing."
command: /project-management
---

# Project Management (Universal)

## Purpose

This is the **universal, repo-agnostic** project management system. It defines the mechanics — file structure, naming, Kanban folders, tracker conventions, and standard operating modes — that every repo uses to turn ideas into GitHub issues, pull requests, and trackable execution plans.

This shared skill is the primary method. Repository manifests, runtime code and configuration supply local facts; an optional thin overlay may document verified differences. An absent overlay is normal and does not authorize creating one.

## Respect the repository's verified architecture

Discover storage, schemas and mutation contracts from the repository's actual implementation and applicable instructions. Use SSSS where that repository requires it; this universal method does not impose a product architecture on unrelated repositories. Project Markdown documents are ordinary documentation; vault nodes still require their owning CLI/API.

## Step 0 — Read this shared method and discover optional local differences

Before doing anything else, check whether the current repo has its own overlay skill at:

```
.agent/skills/<repo-slug>-project-management/SKILL.md
```

Repository-specific overlays may extend this generic method. Discover and read
the overlay in the current repository; do not infer another project's tracker.

- **If it exists**: read it. It defines the product/domain-specific layer — definition of done, severity/blocker test, architecture reminders, GitHub repo name and branch strategy, deployment and testing specifics, and any overrides to the prioritization order below. This global skill still governs the file mechanics (folder layout, naming, tracker syntax); the overlay never needs to redefine those.
- **If it does not exist**: use this shared method with verified repository facts. Do not force-create or recommend an overlay merely because one is absent. Create one only for a requested, useful local difference.

## Rule: Never hardcode the active project or epic in a skill file

Skill files are read at the start of every session and are easy to forget to update — hardcoded "current phase" or "current epic" text goes stale fast and then actively misleads future agents (this is exactly what happened before this skill was standardized: a copy of this file kept claiming an epic was "in progress" long after another copy of the same file had it marked "completed & archived"). Skills describe **process**, not **current state**.

Resolve the actual active work dynamically, in this order, every time:

1. The user's latest explicit instruction in the current conversation.
2. A root `HANDOFF.md`, if the repo has one.
3. The active `*_PROJECT_TRACKER.md` file(s) under `docs/projects/in-progress/`.
4. Current GitHub issues or board items — only after the local project docs are checked.
5. `docs/projects/DEFERRED_BACKLOG.md` — only for deferred or parking-lot work.

If sources disagree, prefer the user's latest instruction, then update whichever source is stale so the next agent doesn't repeat the mistake.

## The Standard: 5-File Kanban Documentation System

All project documentation lives in `docs/projects/`, organized as a Kanban board.

> **THE FIRST RULE: EVERY PROJECT STARTS WITH AN AUDIT.**
> The first file of every project is `<PROJECT_PREFIX>_AUDIT.md`. It is an extensive, evidence-based audit of the existing code, data, infrastructure and standing rules that the project touches. **No other project document (PRD, ARCHITECTURE, DEVELOPMENT_PLAN, PROJECT_TRACKER) is created, and no code is changed, until the audit exists and is marked `Complete`.** The other four documents are written from the audit and cite its finding IDs. A project with no audit is not planned; it is a guess.
>
> If you catch yourself having already written a PRD or edited code first, stop, write the audit now, then revise the other documents and any code to match what it found. Say so in the audit's "Process note".

### Kanban folders

| Folder | Purpose |
|--------|---------|
| `backlog/` | Rough ideas not yet scoped |
| `planned/` | Scoped but not yet started |
| `in-progress/` | Active work |
| `completed/` | Shipped projects (moved here after archival) |
| `archived/` | Abandoned or superseded projects |
| `DEFERRED_BACKLOG.md` | **Global safety net** — deferred tasks and unfinished items extracted from completed trackers |

A repo doesn't need every folder from day one (`backlog/` and `archived/` are commonly added later) — but never invent alternate folder names.

### Per-project document set

Every **new project or feature** gets its own dedicated set of **5 fresh documents** in its own sub-folder, created in the order below. Never append to another project's documents — if you're starting new work, create new documents; if you're continuing existing work, find and use that project's existing documents.

**Folder structure mandate:**

```
docs/projects/<kanban-state>/<PROJECT_PREFIX>/
```

| # | Document | Path (example, in-progress) | Naming Pattern | Written |
|---|----------|------------------------------|-----------------|---------|
| 1 | **AUDIT** | `docs/projects/in-progress/<PROJECT_PREFIX>/<PROJECT_PREFIX>_AUDIT.md` | `<PROJECT_PREFIX>_AUDIT` | **First. Must be `Complete` before 2–5 exist** |
| 2 | **PRD** | `.../<PROJECT_PREFIX>_PRD.md` | `<PROJECT_PREFIX>_PRD` | From the audit |
| 3 | **Architecture** | `.../<PROJECT_PREFIX>_ARCHITECTURE.md` | `<PROJECT_PREFIX>_ARCHITECTURE` | From the audit |
| 4 | **Dev Plan** | `.../<PROJECT_PREFIX>_DEVELOPMENT_PLAN.md` | `<PROJECT_PREFIX>_DEVELOPMENT_PLAN` | From PRD + architecture |
| 5 | **Tracker** | `.../<PROJECT_PREFIX>_PROJECT_TRACKER.md` | `<PROJECT_PREFIX>_PROJECT_TRACKER` | Last; every P0/P1 audit finding becomes a tracker item |

Agents MUST move the entire project **folder** (not just loose files) between Kanban directories as status changes.

Some repos also keep root-level **master/umbrella documents** (e.g. `<PRODUCT>_PRD.md` directly under `docs/projects/`) as a high-level reference for overall product vision — distinct from, and not a substitute for, per-project docs. Whether a repo uses this pattern is a repo-specific decision (see the overlay skill).

### The audit (document 1): what "extensive" means

Use [references/audit-template.md](references/audit-template.md). Copy it to `<PROJECT_PREFIX>_AUDIT.md` and fill every section; a section that does not apply says `N/A` and why. The audit is read from the **code and the running system**, not from the repo's own docs (which drift). Cite `path:line` or a command and its output for every claim.

An audit is extensive when it covers all of these, at a depth matching the project's blast radius:

1. **Scope and method:** what was audited, the commit hash, the date, what was deliberately left out.
2. **Inventory:** entry points, directory map, sizes of the largest files, generated versus authored files, what is tracked in git and what should not be (binaries, backups, env files, PII).
3. **Runtime surface:** every HTTP route or command, scheduled job, background process, and who can call it (public, visitor, admin, token). Every environment variable and where it is read.
4. **Data and state:** where state lives, its format, who writes it, what is personal data, what is deployed or synced and what must not be.
5. **Integrations:** every third-party service and account the code touches, the credentials it uses, and where they come from (secret store versus env versus code).
6. **Security and privacy:** authentication and authorization paths, cookie and token handling, injection or traversal risks in the paths the project touches, secrets or PII in git.
7. **Standing-rule conflicts:** compare the code with the user's invariants and corrections (Total Recall rules, banned providers or products, hardcoding rules, open-source rules). Every conflict is a finding.
8. **Quality baseline:** run the repo's real test and gate commands on the sanctioned host (the Mac mini) **before any change**, and record pass/fail counts and every failure with its cause. Note lint/type status and coverage gaps around the files the project will touch.
9. **Debt and dead code:** stray scripts, unused features, duplicated logic, TODO/FIXME, features that are half-built or over-claimed.
10. **Deploy and operations:** how it ships, where, with what excludes, what can be destroyed by a deploy, how to roll back.
11. **Content and product fit** (when the project has user-facing content): does the copy, data and behaviour say what the owner needs it to say today.
12. **Findings register:** one table, every finding with an ID (`A-001`), severity `P0-critical` / `P1-high` / `P2-medium` / `P3-low`, evidence, impact, recommendation, and a disposition (`fix in this project` / `defer` / `won't fix` with reason).
13. **Impact on the requested change:** which findings block, shape, or are affected by what the user asked for.
14. **Decisions:** questions that only the owner can answer, each with a recommended default so work is never blocked waiting.

Rules for the audit:
- It **records; it does not change code.** Bugs found are logged with an ID. Per the standing "fix what you see" rule they are then fixed immediately as the first items of the tracker, never left broken and never silently patched during the audit.
- Read whole files for the parts the project touches; use search for the rest. Say which is which.
- Baseline tests run **before** scoped edits on the repository's sanctioned host. Prefer a clean audited export; when the authorized session includes uncommitted work, explicitly identify the working-tree snapshot and record its limitations. Never describe that evidence as a clean-commit baseline.
- Mark `Audit Status: Complete` only when sections 1–14 are filled and the baseline was run. Until then the other documents must not exist.
- A small change gets a short audit (sections may be one line each), never no audit. An existing-code project (integration, rewrite, feature in a large repo) gets the full one.

### Naming the project prefix

`PROJECT_PREFIX` MUST be:

- **ALL CAPS WITH UNDERSCORES** (screaming snake case)
- **Descriptive of the specific project/feature** — not a generic label
- **Unique** — never reuse another project's prefix

> **NEVER use generic filenames** like `PRD.md`, `ARCHITECTURE.md`, `DEV_PLAN.md`, or `PROJECT_TRACKER.md`. Always prefix with the project name, e.g. `STRIPE_BILLING_INTEGRATION_PRD.md`. This is a protocol violation, not a style preference — it prevents namespace collisions across projects and repos.

> **ABSOLUTE INVARIANT: NO EPHEMERAL PLANNING ARTIFACTS.** Never create an `implementation_plan.md`, `task.md`, or `walkthrough.md` scratch file. All planning is redirected to these canonical project documents.

### Document header convention

Every project document starts with:

```markdown
# <PROJECT_PREFIX> — <Document Type>

> **Project Prefix**: `<PROJECT_PREFIX>`
> **Kanban State**: 📋 Planned / 🏗️ In Progress / ✅ Completed
> **Author**: <author>
> **Date**: YYYY-MM-DD

---
```

The AUDIT adds two lines: `> **Audit Status**: In progress / Complete` and `> **Audited commit**: <hash>`. Every other document adds `> **Based on audit**: <PROJECT_PREFIX>_AUDIT.md (Complete, <hash>)`.

A repo-specific overlay may extend this with additional frontmatter (e.g. YAML frontmatter for a schema the repo already uses) — that's an addition, not a replacement.

### Tracker convention

The tracker uses standard markdown checkboxes — this is strictly required because tooling and background scripts parse these files:

```markdown
## ⏳ Phase N: <Phase Name>

Goal: <one-line goal>

- [x] Completed task with [linked file](/absolute/path/to/file)
- [ ] Pending task
- [/] In-progress task

## Verification Log

- YYYY-MM-DD: `command` — result

## Action Log

| Timestamp (UTC) | Agent | Action / files or commands | Result | Evidence |
| --- | --- | --- | --- | --- |
| ISO-8601 time | Acting agent | Meaningful action and scoped paths/command | Observed outcome or uncertainty | Durable evidence or tool result |
```

- Use `- [x]` for complete, `- [/]` for in-progress, `- [ ]` for pending. Never plain bullets or numbered lists for tasks.
- Every tracker's **Phase 0 is "Audit"** and is checked off only when `<PROJECT_PREFIX>_AUDIT.md` is `Complete`; its Phase 1 is the fixes for the audit's P0/P1 findings.
- Every tracker MUST include a final phase dedicated to testing and verification. A project cannot move to `completed/` without that phase fully checked off.
- Change the phase header emoji from `⏳` to `✅` when all items in that phase are complete.
- Always update the tracker first when completing a task — don't ask permission to check a box; if the work is verified, check it off, then propose the next item.

### Mandatory bottom append-only Action Log

Every active tracker ends with `## Action Log`, which remains its final section. Append an entry for **all meaningful actions**: reads/inventory, decisions, file writes, commands, tests, deployments, delegation, failures and verification. Related repeated read-only work may share one entry listing its scope; never hide a failed attempt or material decision in a generic success summary. Record actual UTC time, actor, files/commands, observed result and evidence. Do not include secret values or credential-bearing output.

Create the ledger when the tracker is created and capture preceding audit/planning actions accurately. Append throughout execution and reconcile before a task/phase/final response is marked complete. Keep historical rows unchanged; correct an earlier statement with a new row referencing it. Add new phases or other sections above the Action Log. Delegated workers return their actions/evidence; the coordinator must reconcile them into the owning tracker before claiming completion. No unsolicited external messages are authorized by this requirement.

Use a verified existing tracker append command when available. Otherwise edit this ordinary Markdown tracker directly; it is documentation, not a memory-vault node. Do not invent a new logging service/helper solely to append rows. Local audit/triage helpers provide limited checks, never evidence of live deployment or remote GitHub validation.

### Archival rule

When completing a project, the agent MUST:

1. Verify the testing phase is fully checked off and every audit finding has a final disposition — a project cannot move to `completed/` without it.
   After reviewing the actual evidence, record `Readiness Status: Verified` and `Readiness Evidence: <durable log/artifact and environment>` above the final Action Log. These declarations support conservative local triage; their existence alone is not proof the evidence is valid. Pending `[/]` work blocks archival just like `[ ]` work.
2. Move the project folder from `in-progress/` to `completed/`.
3. Extract any unchecked `- [ ]` items or future-enhancement ideas from the tracker.
4. Append them to `DEFERRED_BACKLOG.md` under the project's section heading.
5. Never delete deferred items — preserve them for future sessions.

### The SWE Project Lifecycle

0. **Audit** (AUDIT) — read the existing code, data, infrastructure and standing rules; run the baseline tests; register every finding. Nothing else starts before this is `Complete`.
1. **Discovery** (PRD & Architecture) — define *what* is being built and *how* the systems connect, given what the audit found.
2. **Planning** (Dev Plan & Tracker) — break the architecture into a step-by-step plan, then extract binary yes/no tasks into the tracker. Every P0/P1 finding has a tracker item.
3. **Execution** — never code blindly; every PR checks off a specific tracker box. Don't let work drift into a later phase while an earlier one is incomplete.

### Architecture & documentation sync

Before closing out a major project or phase, verify whether architectural artifacts (`ARCHITECTURE.md`, a `repo-expert`-style skill, or equivalent) need updating. Code is not done until the repo's own memory of itself reflects it.

## Operating Modes

### 1. Planning Mode

Use when the user asks what to work on, what matters, or how close the project is to its next milestone.

1. Resolve the active work per the "Active Project Resolution" rule above.
2. Check whether the repo-specific readiness/verification walkthrough (see overlay skill) has been completed.
3. Identify blockers before polish work.
4. Select 3–7 issues for the session, not 20.

```md
## This week's focus
[One sentence]

## Do first
1. [Issue/task]
2. [Issue/task]
3. [Issue/task]

## Do not touch yet
- [Backlog idea]
- [Non-critical distraction]

## Biggest risk
[The thing most likely to block or break this]
```

### 2. Triage Mode

Use when the user reports bugs, confusion, errors, screenshots, logs, or anxiety about the project.

Classify each item by severity, area, whether it blocks the repo's core workflow, and next action:

- `P0-critical`: blocks the core workflow, data safety, or production operation.
- `P1-high`: seriously damages the core workflow but has a workaround.
- `P2-medium`: annoying or incomplete, but usage can continue.
- `P3-low`: polish, copy, visual cleanup.

Blocker test (repo-specific overlay defines the concrete workflow this refers to):

> Would this prevent the product from being safely used, correctly built, or reliably deployed?

```md
## Triage

### P0 / Blocker
- [Item] → [Issue/action]

### P1
- [Item] → [Issue/action]

### P2/P3
- [Item] → Backlog unless already in current scope

## Next move
[One concrete step]
```

### 3. Feature Development Tracking Mode

Use when executing a multi-phase project via its `*_PROJECT_TRACKER.md`. Follow the Tracker convention above exactly. Maintain momentum: when one task is checked off, immediately propose the next.

### 4. Issue Creation Mode

Use when converting a concern into a GitHub issue. A good issue is small enough to complete and test — never "fix app", "improve UI", or "clean up codebase".

```md
## Goal
What should be true when this is done?

## Why this matters
[Repo-specific: how does this protect stability / unblock users / reduce risk?]

## Acceptance criteria
- [ ] Specific testable outcome
- [ ] Specific testable outcome

## Test path
How should this be manually tested?

## Notes
Links, screenshots, logs, related files, or related issues.
```

### 5. Pull Request Review Mode

Use when reviewing a PR or deciding whether work is safe to merge.

Review against:

- Does it close or advance a real issue?
- Does it help the repo's current priority (per the overlay skill)?
- Does it introduce obvious runtime risk?
- Does it respect the repo's architecture (see overlay skill's architecture reminders)?
- Does it avoid exposing secrets or credentials?
- Does it have a clear test path?

```md
## Review

### Summary
[What this PR changes]

### Must fix before merge
- [ ] [Blocking concern]

### Should fix soon
- [ ] [Non-blocking concern]

### Test before merge
- [ ] [Manual test]

### Decision
Approve / Request changes / Comment only
```

### 6. Readiness / Verification Walkthrough Mode

The most important stability or readiness test for any product: a clean-account, no-shortcuts walkthrough of the real core workflow. The overlay skill defines what that workflow actually is (e.g. "sign up → create workspace → send a message" or "deploy → initialize → run 24/7 without intervention"). Never declare something stable or ready based only on code progress — prove it with a walkthrough.

```md
## Readiness walkthrough

### Environment
- Date:
- Environment/account used:

### Steps
- [ ] [Repo-specific core-workflow step]
- [ ] [Repo-specific core-workflow step]

### Final call
- [ ] Ready
- [ ] Not ready; blockers listed below
```

### 7. User Overwhelm Mode

Use when the user feels lost, flooded, or unsure what matters.

- Reduce scope immediately.
- Identify the next concrete action.
- Re-anchor to the current tracker or readiness walkthrough.
- Turn chaos into 1–3 tasks. Don't dump a giant plan unless asked for one.

## GitHub Management Rules

### Issues & Pull Requests

Every issue needs: goal, why it matters, acceptance criteria, test path. Every PR needs: summary, related issue, impact, test checklist.

### Branches

Default assumption is **trunk-based development** — a single active trunk branch, short-lived `feat/`, `bugfix/`, `chore/` branches merged quickly. The overlay skill may override this (e.g. a repo using a `production`/`main` split with an auto-sync watcher) — check it before assuming.

### Feature flags

New major features or sweeping architectural changes should be hidden behind a feature flag until verified stable, so trunk-based merges don't destabilize the live product. Strip the flag and dead fallback code once the feature is stable — that cleanup is itself trackable work, not something to leave indefinitely.

### Deployment & testing

Deployment mechanics and test-runner specifics (Vitest config, environment matching, mocking conventions, deploy scripts) are repo-specific — defer to the repo's own `code-quality`, `test`, `push`/`deploy` skills, and to the overlay skill's "architecture reminders" section. Universal rule regardless of repo: **verify → commit → push → verify**, and never skip code-quality checks before pushing.

### Labels

Suggested defaults — Type: `bug`, `feature`, `cleanup`, `docs`, `security`. Priority: `P0-critical`, `P1-high`, `P2-medium`, `P3-low`. Area labels are repo-specific.

## Prioritization Framework (default — overlay skill may override)

1. Data safety and security.
2. Core workflow reliability (the thing the product exists to do).
3. Data/state integrity.
4. Usability of the core path.
5. Cost/usage boundaries and reporting loops.
6. Polish.
7. New features.

When in doubt, choose the task that gets a real user through the product with less friction, over a task that adds something new.

## Decision Rules

**When a new idea appears**, ask: Does it help the current priority? Is it required for the readiness walkthrough? Does it reduce risk? Can it be tested this week? If not, backlog it.

**When a bug appears**, ask: Does it block the core workflow? Does it affect data safety? Does it create cost risk? Does it make the product look broken to a user? If yes to any, it's a blocker.

**When the user asks "are we close?"**, answer from evidence, not vibes: Has the readiness walkthrough been run? How many blockers remain? Can a user get through the product without explanation?

## Parallel work within authorized scope

While background work runs, progress on independent items already authorized by the active tracker. Do not initiate pushes, deployments, credential audits, new projects or unrelated maintenance merely to remain busy. Respect dependency ordering, shared-file ownership, host limits and the user's current scope. Log delegated work and join every owned process.

The following queue is a menu for explicitly scoped work, not automatic authorization:

> [!IMPORTANT]
> Choose an independent authorized task while background work runs; waiting is appropriate when no safe independent work remains.

**Tier 1 — Immediate value**
1. Review the active branch state; push/sync only when authorized under the repo's release rules
2. Update `HANDOFF.md` with current session state, if the repo uses one
3. Check and update project trackers with completed work
4. Commit any uncommitted local changes (only when asked to commit)

**Tier 2 — Code quality & maintenance**
5. Run the repo's own type-check / lint entrypoints (never raw `tsc`/`eslint` if the repo has wrapper scripts — check its `code-quality` skill)
6. Update skill documentation if any skill is out of date
7. Verify trackers match actual repo state
8. Scan recently modified files for stray `TODO`/`FIXME`/`HACK`

**Tier 3 — Documentation & planning**
9. Draft/update dev plans for backlog projects
10. Triage known blockers from the active tracker
11. Update the repo's `repo-expert`-style skill if architecture changed
12. Draft GitHub issues for discovered bugs

**Tier 4 — Hardening**
13. Audit for expired/rotated keys, hardcoded secrets
14. Check for critical dependency vulnerabilities
15. Verify feature flags are gating unreleased features correctly

**Tier 5 — Performance & UX debt**
16. Flag oversized files/functions for refactor
17. Audit accessibility (missing `aria-label`, keyboard nav) on recently touched UI
18. Check test coverage on recently modified files

**Rules:** never repeat the same queue item without new evidence; append actions to the tracker ledger; do not expand scope when authorized independent work is exhausted.

## What Not To Do

- Don't write a PRD, architecture, plan or tracker before the audit is `Complete`, and don't change code before it. "It is a small change" means a short audit, not none.
- Don't audit from the repo's docs or from memory; read the code and run the baseline.
- Don't leave audit findings unresolved: each gets a disposition, and P0/P1 findings are fixed, not just listed.
- Don't create huge, vague tasks ("fix app", "clean up codebase").
- Don't treat new features as more important than active blockers.
- Don't merge untested changes casually.
- Don't hardcode current project/epic status in this or any skill file (see the rule above).
- Don't duplicate this skill's mechanics into a repo-specific overlay — reference this skill instead.
- Don't answer "are we close?" on vibes instead of evidence.

## Creating a repo-specific overlay skill

Only create an overlay when requested or when an explicitly authorized local difference needs a durable instruction. Use the `skill` format and include **only verified local differences** from this shared method:

- What "done"/"stable"/"ready" concretely means for this product, and the readiness walkthrough steps.
- The severity/blocker test in this repo's own terms.
- Architecture reminders a reviewer needs (stack, key modules, invariants).
- The repo's actual GitHub repo name and branch strategy if it differs from trunk-based default.
- Any prioritization or deployment/testing overrides.

Point to this global skill for everything else — don't re-paste the Kanban folder table, naming rules, or tracker convention into the overlay; that duplication is exactly how the previous version of this system drifted out of alignment across repos.

## Success Condition

This skill succeeds when work becomes calm, visible, and testable. The user should always know: what matters this session, what's blocking progress, and what issue represents the next concrete action.

<!-- BEGIN INJECTED MEMORY: do not edit by hand; rebuilt by total-recall surface -->
<!-- @route: tfidf, generated_at: 2026-05-21T06:00:44.284Z -->

- **no-cursor-or-windsurf-mentions** (confidence 1, importance critical):
  Do not mention Cursor or Windsurf

- **always-reply-to-all-messages** (confidence 1, importance critical):
  Always reply directly to all user messages without exception

- **operating-instructions** (confidence 1, importance 5):
  Total Recall Core Operating Protocol

- **inviolable-ide-instruction-7a4d8913** (confidence 1, importance critical):
  Inviolable IDE Instruction: # Temporary Cursor Rules for testing

- **security-audit-protocol** (confidence 1, importance 4):
  Security audit protocol and hardening requirements

- **research-code-as-agent-harness** (confidence 0.95, importance 4):
  Research: Code as Agent Harness (arXiv:2605.18747)

- **chocolate-brownies** (confidence 0.95, importance 4):
  Chocolate brownies must be fudgey and rich

<!-- END INJECTED MEMORY -->
