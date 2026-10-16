---
name: cli-agents
description: "Use this skill when discovering, authenticating, dispatching or coordinating terminal coding agents, including Codex, Claude Code, Antigravity, Gemini and other installed CLIs, or propagating their shared orchestration instructions. Read the full skill before dispatch; verify each CLI's account, permissions and output contract."
version: 3.0.0
repo_scoped: false
---

# CLI Agents — Terminal Agent Orchestration

Use actual installed developer CLIs with the user's authorized account and task. Codex and Claude Code support subscription sign-in; a terminal child must have usable CLI authentication. An app session or an executable on PATH does not prove that authentication. Never substitute API billing when subscription execution was requested.

This is a generic method shared across repositories. Resolve binaries, repo roots, models, accounts, concurrency and runtime configuration at execution time. Keep machine-specific readiness and task progress in the owning project tracker, rather than this skill. [Terminal agent catalog](references/TERMINAL_AGENTS.md) covers documented agents and how to add further installed tools. Listed documentation support does not assert an installed or working Total Recall adapter.

## 1. Discover before dispatch

1. Read the user's scope and the repository's own instructions, tracker, test and release rules.
2. Run `node <skill-dir>/scripts/inspect-agents.mjs` for PATH discovery and bounded version probes. Additional terminal binaries can be supplied with repeated `--binary NAME`. Use absolute helper paths discovered from this SKILL.md location; do not assume the current working directory is the skill folder.
3. Inspect the installed CLI's `--help` and headless-subcommand help before using its flags. Resolve symlinks and distinguish vendor CLI from a same-name wrapper. In particular, `agy` and an `antigravity` API wrapper are different programs.
4. Keep six separate states: documented, binary discovered, version verified, authenticated, host adapter supported, execution verified. No step silently upgrades another.

Do not auto-install every catalog agent or enable every discovered executable. Follow the user's chosen account/provider restrictions. A blocked metered Google API does not prohibit an independently authorized Google subscription CLI, but it never authorizes switching routes.

## 2. Verify subscription authentication

- **Codex:** `codex login status` must report ChatGPT sign-in for subscription work. `codex login` is the user-facing sign-in flow when absent. Do not print `auth.json`, tokens or model-cache account details.
- **Claude Code:** inspect only login/method fields from `claude auth status`. The vendor's `claude auth login` supports Claude subscription authentication; Console/API authentication is a separate route. Missing CLI login is a real prerequisite even when an app is authenticated.
- **Antigravity/Gemini:** verify the selected vendor account route and a bounded authorized prompt. Version/help or an OAuth selection setting is insufficient proof of working entitlement. Do not declare plan use unlimited.
- **Other agents:** follow their own documented login/provider path. A ChatGPT or Claude subscription does not cover arbitrary provider clients; supported bridges require their own verified adapter.

Use the credential-clean [subscription helper](scripts/subscription-cli.mjs) for the supported local subscription lane. Read its `--help` for the exact invocation. It strips provider/API overrides, checks supported auth metadata, delegates with an argv array and stdin, and detects process/payload failures. It never performs login or changes vendor settings.

```bash
# Helper adds verified read-only/JSON defaults; prompt stays off the helper argv.
node /resolved/cli-agents/scripts/subscription-cli.mjs codex --cwd /path/to/repo -- --ephemeral - < /path/to/task.txt
node /resolved/cli-agents/scripts/subscription-cli.mjs claude --cwd /path/to/repo -- < /path/to/task.txt
```

Use `--sandbox workspace-write` or `--permission-mode acceptEdits` after the helper separator only for authorized edits. Verify an actual final result; an empty stdout is a failed probe, even with exit zero. Its optional unknown-auth consent is not proof of an authenticated or unmetered account.

Do not resolve and inject provider keys into subscription children. For an explicitly requested API workflow, use the encrypted secret store and the provider's separate adapter. Never expose credentials through args, stdout, keychain dumps, logs, compiled instructions or prompts.

## 3. Headless command contracts

These examples describe vendor syntax. Use the helper's credential-clean environment for subscription execution. Resolve permission flags against installed help; preserve the account's supported configured model unless a verified override was explicitly selected.

```bash
# Codex: analysis in the requested repository; JSONL output; prompt from stdin.
codex exec --sandbox read-only --json --cd /path/to/repo -

# Claude: headless, scoped to reading; final JSON result; prompt from stdin.
claude --output-format json --permission-mode plan --tools Read,Glob,Grep -p

# Antigravity: plan mode, final JSON; inspect installed permission policy.
agy --mode plan --output-format json -p "Read the requested source and report evidence"

# Gemini: separately enabled Google CLI, plan mode and sandbox.
gemini --approval-mode plan --sandbox --output-format json -p "Read the requested source and report evidence"
```

For authorized edits, select the CLI's scoped edit mode: Codex workspace-write, Claude acceptEdits, or the documented equivalent. Use isolated checkout/worktree only where requested or required by repository rules. Assign disjoint files when sharing a working tree; preserve concurrent changes. `--tools ""` disables tools and must not be described as a capable coding agent.

Never default to `bypassPermissions`, `--dangerously-skip-permissions`, `--dangerously-bypass-approvals-and-sandbox`, `--yolo`, `--allow-all` or disabled sandboxing. Some agents are permissive by default: inspect and constrain those policies before dispatch. An agent denied a required tool has not completed the task.

## 4. Coordinate a bounded fan-out

Decompose the request into independent, self-contained assignments. Each prompt states goal, repo/cwd, owned files, read-only or edit authority, expected evidence and test location. Read [delegated contract review](subagents/review-agent-contract.md) when delegating an audit.

Discover the host's available slots and account limits. Native in-app subagent limits and separately spawned terminal processes are different capacities; neither provides unlimited concurrency. Start with a small bounded batch, probe each selected account once, then increase only while permitted by memory/CPU/quota and file ownership. Keep a process inventory and join every result. Never launch an unbounded council or overlapping autonomous writers.

Use asynchronous subprocesses with `shell:false`, an argv array and a specific cwd. Prompt files/stdin avoid shell interpretation and command-line prompt exposure. Keep stdout and stderr separate, cap output, enforce a timeout with process-tree cleanup, and await completion before the parent exits. Synchronous launch is acceptable only for short metadata probes, not parallel task execution. Remote prompts travel via stdin or a reviewed transport; JSON.stringify is not shell escaping.

Run repository tests/gates on its sanctioned host and in background as required by its instructions. A coding child must obey those same rules. Do not add a provider key or a universal safety bypass to make a failing dispatch appear successful.

## 5. Interpret actual results

- Codex `--json` is JSONL. Collect `item.completed` agent_message text, skip control frames and fail on `turn.failed` or `error`. Require a completed turn, not merely a started thread.
- Claude JSON contains `result`; reject `is_error:true` or an error subtype even when exit is zero.
- Antigravity JSON/stream-json may include agent-specific success/error fields. Tool denial can be a soft failure even with exit zero; verify the requested action and artifacts.
- Other agents have their own contracts: JSON may mean one final object or an event stream. Plain-text tools need an actual final artifact and correct exit semantics; do not invent JSON support.

A successful exit is necessary but insufficient. Verify expected changed files/state, persisted records and actual test evidence. Missing auth, unsupported model, permission denial or exhausted quota is not a successful answer. Do not keep retrying nontransient auth/config failures or switch to an unauthorized billing route. Aggregate each agent's result with its own status and limits.

## 6. Total Recall registry boundary

The legacy runtime registry can resolve, in order, the active brain's `modules/agents/agents.yml`, nested `skills/cli-agents/agents.yml`, then `.agent/skills/cli-agents/agents.yml`. Confirm the actual first existing path and enabled profiles before editing configuration. `callLocalRuntime(prompt, system, config)` requires all three arguments.

The skill's [agents.yml](agents.yml) is a compatible conservative profile reference, not proof every catalog CLI is integrated. Current host implementations may have independent flag builders, credential injection or parsing; inspect them before using `harness dispatch`, `agent spawn` or a council. When a host cannot preserve subscription auth/permissions/output semantics, use the verified direct helper and record the host defect rather than falsely certifying it. Additional agents require a real argv/auth/parser adapter and tests before registry support is claimed.

## 7. Propagate this complete package

Use [registry and propagation procedure](references/PROPAGATION.md). Update the registered canonical source, not an arbitrary installed copy. Propagate only `cli-agents`; preserve repository-owned unrelated skills and IDE aliases. Copy the complete scripts/references/evals/subagents package, never only SKILL.md. Runtime data, secrets, monitors and backup files are excluded from reusable distribution.

When the user requests all local repositories, inventory actual available repository roots in the authorized workspace as well as the registry; include unregistered roots with explicit targeted deployment. Do not install an entire brain merely to deliver this skill.

Verify all available authorized repo roots and active IDE surfaces by source-managed file hashes and physical symlink targets. Report missing paths separately; do not create phantom projects or claim absent destinations succeeded. Future newly registered repos require explicit deployment/discovery through the same registry method. Run [evaluations](evals/evals.json) and helper tests on the sanctioned test host before marking the update complete.
