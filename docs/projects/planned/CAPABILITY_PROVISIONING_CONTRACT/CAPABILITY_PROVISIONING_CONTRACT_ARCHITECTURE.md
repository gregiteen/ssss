---
type: project_document
title: CAPABILITY_PROVISIONING_CONTRACT — Architecture
tags: ["project-management", "CAPABILITY_PROVISIONING_CONTRACT"]
timestamp: 2026-09-26T00:00:00Z
---

# CAPABILITY_PROVISIONING_CONTRACT — Architecture

> **Project Prefix**: `CAPABILITY_PROVISIONING_CONTRACT`
> **Kanban State**: 📋 Planned
> **Author**: Claude (Opus 5.5) with Greg Iteen
> **Date**: 2026-09-25

---

These are proposals. Each spec decision below needs review before code lands.

## Provision pipeline

```mermaid
flowchart LR
  B[bundle + parameters + target] --> V[validateBundle]
  V --> D[resolve dependencies §17.4]
  D --> P[bind parameters §16.5]
  P --> R[build deterministic id map §17.3]
  R --> W[rewrite ids + links]
  W --> L[link integrity vs remapped target]
  L --> X[resource bindings §17.1]
  X --> E[ordered envelope plan]
```

`provisionBundle` keeps its signature. It adds `bindings` and `dependencies` to its result, and each planned envelope carries the rewritten content.

## Parameter binding (G1 → D2) — proposal

Values bind through **frontmatter only**, never through free-text substitution in the Markdown body. A bundle file declares `x_bind: { <frontmatter-key>: <parameter-key> }`. At provision time each named key is set to the parameter value (or `defaultValue`), and `x_bind` is removed from the output. A value of the wrong declared `type` fails provisioning.

Why frontmatter only: the kernel validates it, it cannot inject Markdown or links, and it is deterministic. Body text that needs a value should reference a frontmatter field.

## Deterministic id map (G2 → D3) — proposal

`newId = "<prefix>-" + sha256(targetWorkspaceId + ":" + sourceId).slice(0, 12)` for every source `slug` and `id`. The source workspace id maps to the target workspace id. The map covers frontmatter id fields, `[[slug]]` links, and relative `*.md` paths, using the same rewrite code as autolink (§11). Link integrity is then checked against the remapped slug set. Any reference that does not resolve fails the provision.

## Resource bindings (D4)

For each `resource_bound` file, the result gets `{ path, type, relation, parameter_key, value | null, mode }`. `relation` comes from the registry's `resource.binds`, and `mode` from the matching provisioning step. An unbound `required` resource fails the provision unless it is a `dry_run`.

## Dependencies (D5)

`provisionBundle(bundle, { dependencies: { <id>: bundle } })`. `required` dependencies are provisioned first, in topological order, and a cycle is an error. `optional` and `recommended` dependencies are returned in `result.dependencies.suggested`.

## Upgrade (D6)

`upgradeBundle(installed, next, { migration })` produces only `patch` envelopes, and only for structural paths. The engine refuses any envelope whose target classifies as `tenant_private` (§5.5), whatever the patch content. A `migration` primitive records `from_version`, `to_version`, and the patch list. CLI: `ssss upgrade <bundle> --from <lock> --vault <dir> [--dry-run]`.

## `ssss new` (D7)

`--with-total-recall --install` runs `total-recall init --project` inside the new directory. A scaffold test checks that `.agent/skills/total-recall/` exists in the new directory.

## Wire contract and reference server (G3)

- Add a spec section defining `POST /v1/operations`, whose body is an operation envelope (§6) and whose response is the kernel response.
- The HTTP status mapping is the one already in `ERROR_STATUS`.
- Authentication is out of band: the host maps a token to a verified principal.
- `ssss serve --vault <dir> --token-file <f> [--port]` is a small reference server built on `createCommandHandler` with Node's `http`, keeping the package dependency-free.
- `ssss conformance --endpoint` already exists and becomes the cross-language check.
- Also standardize the **stdin-JSON bridge** Dabber CRM already uses: `ssss bridge --vault <dir> --extension <file>` reads one JSON request (envelope + principal) or a batch on stdin and writes one JSON response per envelope. Hosts stop copying `ssss-store.mjs`. The same envelope and response shapes as HTTP; a conformance mode drives it through a subprocess.

## Projection conformance (G4)

Add `projection_memory` to `ssss adapter conformance`. The suite covers:
- rebuild from the fixture vault plus event log gives the expected rows;
- incremental apply equals a full rebuild;
- a tampered row is reported as drift;
- replay is idempotent.

A host's SQL adapter passes by exposing the same small interface (`rebuild`, `apply(event)`, `snapshot`).

## Grants (G5) — decision needed

- **Option A:** add an optional `paths` array to principal capabilities (`<type>:<action>@<glob>`), enforced after `resolveContainedPath`.
- **Option B:** keep type-only grants and require each plugin to own a namespaced extension, so `messaging:*` cannot touch `email:*`.

B already works today. A adds defense in depth for plugins that write core types such as `memory` or `page`. Recommendation: A, limited to core types.
