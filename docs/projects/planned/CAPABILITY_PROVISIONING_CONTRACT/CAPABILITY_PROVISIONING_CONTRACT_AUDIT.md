---
type: project_document
title: CAPABILITY_PROVISIONING_CONTRACT — Audit
tags: ["project-management", "CAPABILITY_PROVISIONING_CONTRACT"]
timestamp: 2026-09-26T00:00:00Z
---

# CAPABILITY_PROVISIONING_CONTRACT — Audit

> **Project Prefix**: `CAPABILITY_PROVISIONING_CONTRACT`
> **Kanban State**: 📋 Planned
> **Author**: Claude (Opus 5.5) with Greg Iteen
> **Date**: 2026-09-25

---

## Why this project exists

Total Recall is building a composer that deploys **capability plugins** (messaging, email, domains, ticketing, and the rest of Festech's features) into SSSS apps. A plugin can build a new standalone app or add itself to an existing one. That work is tracked in `gregiteen/total-recall` → `docs/projects/in-progress/CAPABILITY_DEPLOYMENT_PLUGINS/`. The first host app is `gregiteen/festech-modular` (`CAPABILITY_APP_EXTRACTION`).

The composer relies on SSSS for registry composition, bundle provisioning, upgrades, scoped access, and portable adapters. This audit records which of those work today and which do not. Everything below was checked against `main` at `67c4e43` (v0.9.6) and the installed `ssss` CLI 0.9.6.

## Verified defects

| # | Evidence | Impact |
| --- | --- | --- |
| D1 | `ssss registry compose` exits with `ssss: undefined is not iterable`. `scripts/cmd-registry.mjs` `serializable()` reads `set.primitives`, but `composeRegistryLayers` in `src/registry.mjs` returns `types`. `registry lock` works. | Plugin extension registries cannot be composed and inspected from the CLI. |
| D2 | `provisionBundle` in `src/bundle.mjs` checks that required parameters exist, then copies every file's content unchanged. It never inserts parameter values. | A template bundle cannot become "*this* business". |
| D3 | The only "id-remap" in `provisionBundle` is a path prefix. Slugs, workspace ids, and `[[links]]` are not rewritten, contrary to §17.3. The dangling-link check runs against source slugs, not the remapped target. | Two installs of the same bundle alias each other's ids. |
| D4 | `provisionBundle` returns `plan` and `steps` but no resource bindings, although §17.1 says provision "binds the bundle's `resource_bound` requirements". | The installer cannot see or record the phone number, domain, or mailbox it bound. |
| D5 | `validateBundle` accepts `manifest.dependencies`, but `provisionBundle` ignores them. §17.4 requires `required` dependencies to install first. | Plugins that depend on other plugins cannot be provisioned in order. |
| D6 | No upgrade verb exists (no `upgrade` in `src/bundle.mjs` or the CLI). §17.4 says upgrades use a `migration` primitive plus structural-only `patch` envelopes that never touch `tenant_private` data. | Installed capabilities cannot receive versioned updates safely. |
| D7 | With `--with-total-recall --install`, `scripts/cmd-new.mjs:124` runs `npx -p total-recall-brain total-recall init` without `--project`. Total Recall's `init` defaults to the global brain (`total-recall/src/cli/init.mjs`). | `ssss new` apps do not get their own project brain. |

## Spec gaps (not just code)

| # | Gap |
| --- | --- |
| G1 | §16.5 lists parameter fields and says `key` is "referenced by provisioning steps and link rewriting", but never says **how** a value enters a file (no placeholder syntax or frontmatter binding rule). D2 cannot be fixed without deciding this. |
| G2 | §17.3 says identifiers are remapped with "a bundle-relative id map" but does not define the map's shape or its determinism rule (for example, deriving new ids from the target workspace id and source id). |
| G3 | There is no normative wire protocol for non-JavaScript hosts. `src/http.mjs` is a JavaScript façade (`createCommandHandler`) that each host must mount. A Python app needs either a documented HTTP/JSON contract with conformance, or a runnable reference server. A de facto second protocol already runs in production: Dabber CRM (`moogie_crm`, Python/Flask) sends every write as JSON on stdin to its own `scripts/ssss-store.mjs`, which composes its extension registry and calls `createKernel` with filesystem VFS, idempotency, and a JSONL event store. Each host re-implements that bridge. |
| G4 | Adapter conformance (`ssss adapter conformance`) covers only VFS, lease, and idempotency stores, each in memory and filesystem variants. Nothing tests that a SQL projection (SQLite or Postgres) rebuilds from canonical Markdown and events and detects drift. |
| G5 | Grants are type-and-action capabilities scoped to a workspace (`createCapabilityAuthorizer`: `<type>:<action>`, `*` prefixes). There is no path scope. A plugin can be limited to its own types but not to a subtree such as `capabilities/messaging/`. |

## What already works and can be reused

- `ssss new` scaffolds a Node project with a vault, conformance test, and bundle round-trip.
- `export`, `validate`, `inspect`, `provision` (path prefix only), and idempotent `import` run end to end.
- The kernel enforces verified principals, workspace scope, capabilities, idempotency, leases, and audit (`src/kernel.mjs`, `src/authorization.mjs`).
- Registry layers, aliases, `primitive migrate`, and `registry lock/verify` exist.
- Every adapter suite currently passes (6 suites).

## Out of scope

- The Total Recall app composer, plugin manifest, and the plugins themselves (their own repos).
- Replacing Markdown and events as the canonical store. A physical alternate canonical store would be a separate SSSS project.
