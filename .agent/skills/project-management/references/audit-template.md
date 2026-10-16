# <PROJECT_PREFIX> — Audit

> **Project Prefix**: `<PROJECT_PREFIX>`
> **Kanban State**: 🏗️ In Progress
> **Author**: <author>
> **Date**: YYYY-MM-DD
> **Audit Status**: In progress
> **Audited commit**: <hash>

---

## Process note
<Anything done before this audit that should not have been (docs written, code edited), and how it will be reconciled. "None" if clean.>

## 1. Scope and method
- Request being audited for:
- Repositories / paths in scope:
- Out of scope (and why):
- How this audit was done (files read whole, searched, commands run):

## 2. Inventory
| Area | Path | Size | Authored / generated | Tracked in git |
|---|---|---|---|---|
- Entry points:
- Largest files:
- Tracked but should not be (binaries, backups, env files, PII):

## 3. Runtime surface
### Routes / commands
| Route or command | Method | Who can call it | File:line | Notes |
|---|---|---|---|---|
### Scheduled jobs and background processes
### Environment variables
| Variable | Read at | Purpose | Source of value |
|---|---|---|---|

## 4. Data and state
| State | Location | Format | Writer | Personal data? | Deployed / synced? |
|---|---|---|---|---|---|

## 5. Integrations
| Service | Account / credential | Where the credential comes from | Used at |
|---|---|---|---|

## 6. Security and privacy
- Authentication and authorization paths:
- Cookie and token handling:
- Injection / traversal / SSRF risks on touched paths:
- Secrets or PII in git or in deploys:

## 7. Standing-rule conflicts
| Rule (source) | Conflict found | Evidence | Finding |
|---|---|---|---|

## 8. Quality baseline
- Host and command:
- Snapshot: clean commit or current working tree; identify prior uncommitted work and limits:
- Evidence provenance: actor, timestamp, environment, log path, exit status; supplied versus directly inspected:
- Result (pass / fail counts):
- Every failure and its cause:
- Lint / type status:
- Coverage gaps around touched files:

## 9. Debt and dead code
## 10. Deploy and operations
- How it ships, to where, with which excludes:
- What a deploy can destroy:
- Rollback:

## 11. Content and product fit
## 12. Findings register
| ID | Severity | Finding | Evidence | Impact | Recommendation | Disposition |
|---|---|---|---|---|---|---|
| A-001 | P1-high | | path:line | | | fix in this project / defer / won't fix |

## 13. Impact on the requested change
| Requested change | Blocked / shaped / affected by | Findings |
|---|---|---|

## 14. Decisions
| Question (owner only) | Recommended default | Answer |
|---|---|---|

## Completion checklist
- [ ] Sections 1–14 filled (N/A with a reason where not applicable)
- [ ] Baseline tests run before any change, results recorded in section 8
- [ ] Every finding has a severity and a disposition
- [ ] `Audit Status` set to Complete and the audited commit recorded

## Action recording handoff
When the tracker is created after this complete audit, record all meaningful audit reads, inventories, decisions, commands, failed attempts and planning writes in its final append-only `## Action Log`. Include UTC timestamps, agent, paths/commands, results and evidence. Do not rewrite historical rows or include secrets. The coordinator reconciles delegated actions before completion; ordinary project-document edits do not bypass vault mutation contracts.
