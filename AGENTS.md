<!-- BEGIN INJECTED ACTIVE DIRECTIVES: do not edit by hand; rebuilt by total-recall surface -->
## TOTAL RECALL CLI — USE IT FOR EVERYTHING (run `total-recall <command> --help` before guessing)
- Built-in commands: `app` · `init` · `setup` · `start` · `startup` · `deploy` · `doctor` · `backup` · `dream` · `lint` · `daemon` · `restore` · `upgrade` · `update` · `friction` · `chat` · `status` · `remember` · `forget` · `edit` · `recall` · `context` · `rules` · `search` · `research` · `proposals` · `proposal` · `task` · `share` · `generate-pat` · `key` · `keys` · `pat` · `hash-password` · `reset-password` · `compile` · `rebuild` · `snapshot` · `migrate` · `backfill` · `ingest` · `import` · `connect` · `sync` · `relay` · `uninstall` · `map` · `brain` · `config` · `skill` · `project-id` · `api` · `brief` · `group` · `groups` · `help` · `collab` · `command` · `export` · `harness` · `watch` · `agent` · `agents` · `new` · `plugin` · `plugins` · `scaffold` · `scaffold-plugin`
- Memory: `context "<task>" --action <a>` · `recall "<q>" --local` · `remember <category> "<text>" --global|--project` · `edit <slug>` · `compile` · `brief` · `status` / `doctor`
- CREDENTIALS GO THROUGH THE AUTH PLUGIN ONLY (Total Recall has no native secrets store; never hand-roll curl/sed/ssh for keys): `auth secret list|get <K>|set <K> --stdin|rotate <K> --stdin|--from-clipboard [--remote <t>]|rotate-auto <K>|rotation-due|shared|meta|catalog|audit|diff-env|export-env`; remote targets: `auth secret remote add|list|deploy <t> [--keys a,b] [--dry-run]`. The store follows `TR_SECRETS_BRAIN`.
- Auth: `auth status|audit|key list|issue|revoke|password set --stdin|passkey|google status`
- Mesh nodes: `mesh nodes|status|ping|exec <node> <cmd>|ssh <node> [cmd]|access <node>|leader` — never ssh a machine into itself.
- Agents and work: `agent spawn|list|logs|kill` · `harness dispatch|council` · `task <cmd>` · `plugin list|install|info|library` · `skill <cmd>` · `brain <cmd>` · `daemon <cmd>` · `update --all-brains --apply`
- Every installed plugin namespace and its operations is listed next; run `total-recall <namespace> --help` for flags.

## Installed Plugins & Capabilities

Use Total Recall and plugins first. Discover operations with `total-recall plugin library --json`, inspect the owner CLI help, then use its CLI.

Namespaces below run as `total-recall <namespace> [command]`; declarations do not prove provider readiness.

Composed commands: `total-recall composable-cli library --json`.

- **auth** v1.0.1 · active · `total-recall auth` [status | audit | rotate | passkey | google | probe | session | secret | password | key]: Hardware WebAuthn biometric FI
- **cli-agents** v0.1.1 · active · `total-recall cli-agents` [status | catalog | nodes | inspect | run-command]: Discover installed CLI agents
- **code-quality** v0.2.1 · active · `total-recall code-quality` [report | snapshot | gate | config | detect | init]: Fail-closed deterministic code
- **composable-cli** v0.2.1 · active · `total-recall composable-cli` [status | create | read | update | remove | list | show | history | rollback | test | promote | library]: Dynamic agent command composit
- **creative-search** v2.1.1 · active · `total-recall csearch` [config | query | health | engines | categories | deep | remember | stats]: SearXNG-powered creative metas
- **decision** v0.2.1 · active · `total-recall decision` [status | run | sets | log | test]: Typed decisions (choice, binar
- **deploy** v0.2.0 · active · `total-recall deploy` [status | stage | switch | release | rollback | retire | providers | probe | token | optimize | optimize-clean]: Zero-downtime multi-provider d
- **design** v0.2.1 · active · `total-recall design` [status | tokens | css | tailwind]: Design system synthesis, token
- **domains** v0.3.1 · active · `total-recall domains` [status | check | token | settings | view | set | list | info | add | update | remove | config | verification | claim | apex-projects | records | record | record-add | record-update | record-rm | search | availability | availability-bulk | price | price-bulk | buy | buy-many | renew | transfer-in | transfer-status | auth-code | auto-renew | nameservers | contact-schema | contact-status | order | tlds | tld | tld-price | project-list | project-get | project-add | project-update | project-remove | project-verify | project-move | certs | cert | cert-issue | cert-upload | cert-rm]: Unified Vercel DNS management,
- **dsh** v1.1.1 · active · `total-recall dsh` [status | sessions | tools | models | model | plugins]: DeepSeek Harness (DSH) integra
- **embeddings** v0.1.0 · active · `total-recall embeddings` [status | models | pull | benchmark | coverage]: Local embedding model manageme
- **git-sentinel** v1.2.1 · active · `total-recall git-sentinel` [audit | diff]: Worktree hygiene, branch inspe
- **hermes** v0.1.0 · active · `total-recall hermes` [status | dispatch | gateway | skills | plugins | auth]: Hermes Agent runtime: monitor
- **image-generator** v0.2.1 · active · `total-recall image-generator` [generate | models]: Visual asset studio for brandi
- **maps** v0.1.1 · active · `total-recall maps` [status | geocode | reverse | places | route | probe | token]: Location and mapping tools for
- **mesh** v0.2.1 · active · `total-recall mesh` [status | view | nodes | doctor | ssh | exec | access | ping | leader | enroll | preauthkey | policy | probe | token | presence | dispatch | server | grants]: Control-server mesh administra
- **okf** v0.1.1 · active · `total-recall okf` [status | validate | schemas | probe]: Open Knowledge Framework schem
- **openwiki** v0.1.1 · active · `total-recall openwiki` [status | hubs | ingest | probe]: Multi-repo knowledge graph and
- **operator-alerts** v1.1.1 · active · `total-recall alerts` [send | test | config | log]: Operator alert dispatcher acro
- **phone** v0.1.1 · active · `total-recall phone` [session | numbers | status | jobs | health | run | call | message | contact | voicemail | agent | settings | compliance]: Telephony, direct line invento
- **phone-companion** v0.3.1 · active · `total-recall phone-companion` [status | download | start | notify]: Gro CRM mobile companion (http
- **security** v0.3.1 · active · `total-recall security` [platforms | device | android | machine | network | fleet | status | audit | scan | harden | plugins | secure-all | encrypt | decrypt | probe | token | challenge | bot-mitigate | site-audit | site-shield]: Machine and device security as
- **signing** v0.3.1 · active · `total-recall signing` [status | admin-api | account | token]: Digital agreement signing engi
- **skill-manager** v1.1.0 · active · `total-recall skill-manager` [configure | status | audit | optimize | route]: Conservative skill optimizatio
- **sticker-generator** v1.0.1 · active · `total-recall sticker-generator` [status | catalog | generate | upscale | quote | submit | orders]: High-quality sticker generator
- **stripe** v0.1.2 · active · `total-recall stripe` [status | checkout | payment-intent | webhook | refund | probe | token]: Payment processing, checkout s
- **system-monitor** v1.2.1 · active · `total-recall system-monitor` [status | sample]: Host load and memory telemetry
- **text** v0.1.1 · active · `total-recall text` [threads | get | cancel | numbers | ingest | status | send | history | verify]: Direct SMS/MMS messaging, numb
- **tickets** v0.1.1 · active · `total-recall tickets` [status | tiers | list | issue | hold | scan | verify | summary | pass]: Tiered ticket types, holds, re
- **tr-transcribe** v0.2.1 · active · `total-recall tr-transcribe` [status | transcribe]: Speech-to-text audio file tran
- **translator** v0.1.1 · active · `total-recall translator` [status | locales | scan | translate | probe | token]: Automated multilingual transla
- **user-automations** v1.0.1 · active · `total-recall user-automations` [list]: Shows installed scheduled plug



## Composable Commands

Verbs built on this CLI with `command create`. Use them instead of re-doing their steps by hand; run `npx total-recall <name> --help` first. Add a new one when you repeat a sequence (`command create <name> "<js>" --description "…" [--global]`); this list is rebuilt from the command files on every compile.

- `npx total-recall code-quality-check` (global) — Run this repo's gates once and write reports/latest.json (--tier fast|full|remote, --only <id>).
- `npx total-recall code-quality-report` (global) — Read the latest gate report and whether it is still current.
- `npx total-recall m4-image-prune` (global) — Prune or clear all generated M4 ComfyUI images (--status, --weekly, --all, --dry-run)
- `npx total-recall tr-first` (global) — MANDATORY FIRST STEP for every task: recall before deciding, then emit the context capsule.
# 🔴 MANDATORY FIRST STEP: TOTAL RECALL CLI & TASK ROUTING

1. RUN TOTAL RECALL CLI HELP FIRST:
`total-recall --help`
(or in a source checkout: `node bin/total-recall.mjs --help`)
Inspect all core capabilities, installed plugins, and commands.

2. RUN TOTAL RECALL CONTEXT BEFORE ACTING:
`total-recall context "task description" --action <actions>`
Read the complete returned capsule and require ready:true. Unknown rule applicability is conservatively required. If it exits 2, stop: the required set exceeds its budget; inspect overflow and explicitly raise the budget or curate applicability before action.

Total Recall is the agent's working memory, toolset, and single source of truth across all decisions. Refresh at every changed task, action or project, and after a memory/skill edit. Do not infer applicability from semantic similarity. CLI retrieval is local and works without the server. Skills have compact entrypoints; load only relevant references. Canonical vault writes use the validated CLI.

DO NOT SKIP THIS. Run Total Recall CLI help and context first before doing anything else.

---

### Always push everything [always-push-everything]

Always push everything, in every repository, without being asked and without filtering. 'Push' means the entire working tree, not only the commits I authored: stage all changes including generated files, config, lockfiles, agent surfaces and files created by other tools, commit them, and push to the remote. Never leave unpushed commits or a dirty working tree. Never ask whether to push something, and never leave pre-existing modifications behind on the reasoning that they were not mine.

---

### Email only ARRIVES if BOTH directions exist: OUTBOUND = a SMTP2GO-VERIFIED sender domain (SPF... [email-needs-both-outbound-sender-and-inbound-mx-mailbox]

Email only ARRIVES if BOTH directions exist: OUTBOUND = a SMTP2GO-VERIFIED sender domain (SPF 'v=spf1 include:spf.smtp2go.com ~all', DKIM CNAME '<selector>._domainkey.<domain> -> dkim.smtp2go.net', return-path CNAME '<rpath>.<domain> -> return.smtp2go.net'); INBOUND = MX '<domain> -> mail.ultrachat.app' AND the domain+mailbox created in Mailcow. A verified sender alone bounces. Always 'dig MX <domain>' and check the Mailcow mailbox before declaring mail fixed. SMTP2GO free plan caps at 5 senders.

---

### NEVER ask the user for a credential before searching EVERY Total Recall secrets store. [never-ask-for-a-secret-before-searching-all-tr-stores]

NEVER ask the user for a credential before searching EVERY Total Recall secrets store. The store is chosen by brain/cwd and DIFFERS per repo: global = ~/.agent/skills/total-recall/config/secrets.enc (list it with: TR_SECRETS_BRAIN=/Users/gregoryiteen/.agent/skills/total-recall total-recall auth secret list), workspace = /Users/gregoryiteen/github/.agent/skills/total-recall/config/secrets.enc, and per-repo <repo>/.agent/skills/total-recall/config/secrets.enc. Known provider keys: VERCEL_API_TOKEN, VERCEL_TEAM_ID, SMTP2GO_API_KEY, DEVELOPER_SMTP2GO_API_KEY, MAILCOW_API_KEY, DEVELOPER_MAILCOW_API_KEY, MAILCOW_URL. Keys carry a repos= binding. A key missing from one store is NOT missing everywhere - search them ALL (auth secret list + auth secret catalog) before telling the user it is gone.

---

### Never use GitHub Actions [never-use-github-actions]

Never use GitHub Actions, in any repository, for any purpose: no workflow files, no CI pipelines, no automated triggers on push or pull request. Gates and deploys stay manual — the Mac mini runs scripts/remote-gates.sh directly, and releases go through scripts/gro-ops.py stage/verify/activate over ssh. Verified 2026-10-17: removed 25 workflow files and dependabot.yml from dsh-private, including the 12 that fired automatically on push, pull_request, schedule, issues or workflow_run and sent notification email.

---

### Report breakage immediately and fix it at the source, never work around it [report-breakage-then-fix-at-the-source]

When something is broken, say so immediately and fix it at the source in the same pass. Do not work around a failure, do not silently skip it, do not quietly narrow scope to avoid it, do not defer it to the user or leave it because it is outside the current task: found broken means fixed now. Never idle or poll waiting on checkers, daemons or reports - read the raw status once and act.

---

### Use Total Recall for everything, always [rule-total-recall-for-everything-always]

Use Total Recall for everything, always: recall before every decision, and use its CLI (mesh, auth secret, plugin, agent, task, research, skill, remember) to do the work instead of hand-rolled grep/find/sed or ad-hoc scripts. If a TR plugin or subcommand owns a capability, that is the required path - a shell equivalent is a protocol violation. Run 'total-recall recall "<topic>" --local' before each decision and refresh 'total-recall context' when the task changes.

---

### CRM system email (Gro/deepseek-crm, Field CRM/crm) is sent with system_mail=True and ONLY works... [verify-crm-email-at-the-provider-never-trust-the-ui]

CRM system email (Gro/deepseek-crm, Field CRM/crm) is sent with system_mail=True and ONLY works via the SMTP2GO relay. send_email raises 'Platform mail requires the configured SMTP2GO relay' when no relay key/sender is configured, and /api/auth/forgot-password SWALLOWS that error yet still returns success ('...a reset link has been sent'). NEVER trust that UI text. Prove delivery at the provider: SMTP2GO POST /v3/activity/search (look for a 'processed' then 'delivered' event from the configured sender) plus the recipient mailbox message count. If nothing appears there, the mail did not send.

---

### The total-recall domains (Holy MX) plugin resolves VERCEL_API_TOKEN via 'total-recall auth... [domains-plugin-token-brain-and-align-stub]

The total-recall domains (Holy MX) plugin resolves VERCEL_API_TOKEN via 'total-recall auth secret get VERCEL_API_TOKEN', which follows TR_SECRETS_BRAIN. It defaults to the workspace store and wrongly reports the token missing; export TR_SECRETS_BRAIN=<the store that holds it, e.g. /Users/gregoryiteen/.agent/skills/total-recall> and set the team via 'domains settings set --team-id <VERCEL_TEAM_ID>' (a team-scoped token returns an empty domain list without it). Its 'mail align' subcommand is a STUB that fabricates DKIM keys and a fake MX - NEVER run it; use set/record-add with the real provider records.

---

### Development now runs on the Mac mini. [invariants-0c4d4899]

Development now runs on the Mac mini. Verify host identity and run test gates directly in its isolated checkout; never route the mini through cloud or SSH back to itself.

---

### Mailcow (mail.ultrachat.app) API auth comes ONLY from its own DB api table. [mailcow-api-key-lives-in-its-own-db-table]

Mailcow (mail.ultrachat.app) API auth comes ONLY from its own DB api table. If that table is empty, EVERY MAILCOW_API_KEY/DEVELOPER_MAILCOW_API_KEY in Total Recall is rejected with 'authentication failed'. Mint a key by inserting into the mailcow api table (api_key, allow_from='', skip_ip_check=1, access='rw', active=1) on the droplet, then store it in Total Recall. Manage domains/mailboxes with POST /api/v1/add/domain and /api/v1/add/mailbox using the X-API-Key header.

---

### DSH default model must never be hardcoded to deepseek-chat [dsh-default-model-must-not-be-hardcoded-to-deepseek-chat]

Never hardcode a model id in ~/.dsh/refresh-openrouter-models.mjs. The DSH default model is a persisted preference read from ~/.dsh/default-model.txt; hardcoding deepseek/deepseek-chat let the daily refresh revert Greg's model to V3. His model is deepseek/deepseek-v4.1-flash.

---

### DSH full access is the DSH_PERMISSION_MODE env var, not a profile setting [dsh-full-access-is-the-permission-mode-env-var]

DSH full access is the DSH_PERMISSION_MODE env var: danger-full-access gives sandbox danger-full-access + approval 'never'; unset falls back to workspace-write + 'ask'. Profiles cannot override it. Greg wants full access by default; it is exported in ~/.zshrc.

---

### Every release propagates everywhere [every-release-propagates-everywhere]

Every Total Recall release must be propagated everywhere before it counts as done: publish to npm, then run 'total-recall update --all-brains --apply' to pin total-recall-brain AND @gregiteen/ssss-cli across every registered consumer (project-registry.json plus TR_SYNC_REPOS), then update the cloud droplet's global install and each cloud repo install, then verify every resolved version independently rather than trusting the command's own report. A release that is only on npm is not released.

---

### Hermes must only be used through Total Recall: invoke and orchestrate Hermes through Total... [invariants-27427531]

Hermes must only be used through Total Recall: invoke and orchestrate Hermes through Total Recall's harness layer (total-recall harness dispatch hermes) or cli-agents, never as an unmanaged standalone entrypoint.

---

### No hand-rolled credential ops; Total Recall CLI only [no-hand-rolled-credential-ops-total-recall-only]

Never hand-roll curl, sed or raw ssh for credentials, rotation or deploys. Read SKILL.md and operations.md first, then use total-recall auth secret (rotate --stdin --remote, remote deploy, diff-env) and mesh.
<!-- END INJECTED ACTIVE DIRECTIVES -->

Read and follow .agent/skills/total-recall/SKILL.md on every turn.
