---
name: start
description: "Use this skill when the user types /start or opens a new session in any repository. Runs the Total Recall brief (npx total-recall brief), reports what matters, then follows the repository's own start skill when it has one. MANDATORY: read fully before executing."
repo_scoped: false
---

# /start — global session start

Every repository gets the same first step; each repository may add its own.

## 1. Shared runtime preflight (always)

Use the installed CLI from the current repository: `./total-recall startup-check ensure --json`, or `total-recall startup-check ensure --json` when there is no repo launcher. This explicit /start step starts only missing configured managed local services. Ordinary `brief` remains read-only. Read `references/runtime-contract.md` for readiness boundaries. The functional `scripts/start-session.mjs` wrapper performs the preflight and brief with bounded child processes.

Report server health, authenticated brain access, daemon identity, SSSS tooling, and current-app readiness separately. An undeclared app remains unknown; shared readiness proves only shared runtime health. Supply app check/start command names only when the owning repository explicitly registers those commands. Never guess commands or start sibling repositories. Never change credentials or permission scopes merely to make a check pass.

The registered `startup-check` composable wrapper resolves the native builtin or one verified source checkout from existing registered repository roots. `TR_STARTUP_CLI` is an explicit optional override; ambiguous or missing sources fail. If that wrapper is unavailable, try the native `startup` command and report unsupported checks when the installed package lacks it. Do not auto-download a package or claim the runtime was checked.


Before reporting an unreachable server, allow the bounded transport retry in the startup command to finish. Health and authenticated-instructions requests each allow ten seconds and one retry. HTTP authorization errors, unrecognized responses, and foreign/unknown process identities remain failures. Recheck shared startup once after the product bootstrap when it initially reported only transport failures; report the latest verified result and note any recovery. Never restart a live process to conceal a timeout.

Use `startup-check check --json`, `status --json`, and `daemon status` to diagnose a running system. `doctor` checks installation prerequisites and free ports: its occupied-port message alone does not prove a running Total Recall server is unhealthy. Verify the listener identity before interpreting it as a conflict.

Verify `help daemon --json` and `help startup --json` using the installed CLI. Missing `docs/reference/cli-reference.md` is a package defect; restore the matching canonical reference and its packaging entry, then re-run installed help. Do not invent an unsupported service command.

## 2. Brief (always)

From the repository root run the Total Recall brief, via the repo launcher when
one exists:

```bash
./total-recall brief      # or: npx total-recall brief
```

It is read-only and prints, for the repo you are in: local time, timezone and
UTC; branch, dirty files, last commit; the project id (random UUID) and the
project groups it belongs to; the compiled rules count and when they were
compiled; installed skills; composable commands (with risk class); secrets
health as **counts only** (rotation due, reused values, untracked); pending
daemon tasks; mesh status; in-progress and planned trackers; openwiki pages; and
what to do next. Add `--mesh` to ping every mesh node, `--json` to parse it.

If `brief` is missing (`Unknown command: brief`), the global commands are not
installed on this machine: say so and fall back to `npx total-recall --help`,
`git status`, and the repo's openwiki.

## 3. Repo start (when present)

If the brief's **Next** line names a repo start skill
(`.agent/skills/start/SKILL.md` in that repo), read it fully and follow it only when it is repo-owned (`repo_scoped: true` or verified distinct repository instructions). A `repo_scoped: false` shared copy is this same workflow: do not recursively invoke it. Product-specific
servers, logins, browser panes, and other product-specific steps live there,
never here. If there is none, read the openwiki entry page and the repo's
`repo-expert` skill it names before changing code.

## 4. Report to the user

Keep it short:

1. One line: repo, branch, what is in progress (trackers), anything uncommitted.
   Then the domain in one line: providers it holds keys for, integrations,
   automations, launchers — this is what you may explore and run (through the
   Total Recall CLI and the repo's own launchers) without asking where things are.
2. The brief's **Warnings**, each with the command that shows detail. Never
   print secret values or masked fragments; counts and key names only.
3. What the repo's start skill did (server up, URL opened…), if it ran.
4. Ask what to work on only if the user has not already said.

## Rules

- Do not fix warnings during /start unless the user asks; list them. A warning
  that blocks the work the user asked for gets fixed as part of that work.
- Data freshness: say when something the brief reports is old (for example
  openwiki last updated months ago, surfaces not compiled recently).
- Everything here goes through the Total Recall CLI. If a step is repeated in
  every session, update the builtin `src/cli/brief.mjs` through the owning repository project plan. `brief` is a builtin, so `command update brief` cannot replace its implementation.
