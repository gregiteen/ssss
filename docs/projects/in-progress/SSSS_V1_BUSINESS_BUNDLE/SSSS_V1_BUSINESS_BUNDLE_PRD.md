---
type: project_document
title: SSSS_V1_BUSINESS_BUNDLE — PRD
tags: ["project-management", "SSSS_V1_BUSINESS_BUNDLE"]
timestamp: 2026-06-24T16:00:00Z
---

# SSSS_V1_BUSINESS_BUNDLE — PRD

> **Project Prefix**: `SSSS_V1_BUSINESS_BUNDLE`
> **Kanban State**: 🏗️ In Progress
> **Author**: Google Antigravity
> **Date**: 2026-06-24

---

## 0. Consolidation Notice

This project is the **single canonical road to SSSS v1.0**. It absorbs the prior
`SSSS_V1_STANDARDIZATION` project (validator, multilingual VFS, autolinking, ecosystem
rollout) as its **Foundations track (Track 0)** so the standard does not fork. The
`SSSS_V1_STANDARDIZATION` folder has been retired; its tasks live here in the Dev Plan
and Tracker.

## 1. Vision

**Commoditize a running business into a single tradeable file.**

Today a business is people, logins, scattered SaaS, and tribal knowledge. In SSSS, a whole
business is already a **value**: a VFS subtree of Markdown primitives (assistants,
workflows, CRM, products, pages, email templates) behind one Operation Contract endpoint.
The moment a business is a value, it becomes **forkable, tradeable, instantiable,
composable, and portable**.

The `.ucw` (workspace) file is that value serialized. A buyer acquires a `.ucw` in a
marketplace, provisions it, and owns a **proven business model running on day one** — a
"festival in a box," a "consultancy in a box," a "newsletter in a box." This is a new asset
class, and SSSS is the standard that makes it portable across hosts instead of locked to one app.

## 2. Prior Art — the standard already exists, scattered across three repos

Crucially, this is **not** greenfield. Each app independently built a different layer of the
exact standard we need; nobody has unified them:

- **total-recall** — the rigorous Operation Contract: `src/core/operation-validator.mjs`
  (`processOperation` with idempotency replay + `buildRepair`), `src/core/schema.mjs` (Zod
  envelopes incl. `MigrationSchema`/`ReleaseSchema`), and `metadata.schema.json` (marketplace
  submission metadata).
- **festech** — registry-driven validation (`SsssValidator.ts` reading
  `docs/ssss/primitive-registry.json`), the real `resource_bound` primitives (`domain`,
  `phone_number`, `integration_connection`), a `delete` envelope, and path-traversal safety.
- **ultrachat** — the `.ucw` bundle itself: `WorkspaceVfsPackageService.ts`
  (`exportWorkspacePackage`/`importWorkspacePackage`, `VfsPackageManifest` with `capabilities`),
  typed template variables and a provisioning dependency graph in `server/types/workspace.ts`,
  and a live export→provision→import path at `accountAssistant.ts:257`.

The work is to **canonicalize the best of each into the spec + `@gregiteen/ssss-cli`, then re-derive all
three apps from it.** See the Architecture doc for the layer-by-layer harvest map.

## 3. Problem Statement

The vision is blocked by five gaps — in the *standard*, not the implementations:

1. **No portability classification.** The registry does not distinguish the *business model*
   (sellable) from the *operator's customer data* (never sellable). ultrachat hard-codes a
   one-off version of this (it filters `admin-security`/platform skills on export); it must
   become a declared, registry-backed field. This is the same gap that let real customer PII
   sit in an app repo. One classification solves both.
2. **No canonical bundle format.** `.ucw` is real but lives only as ultrachat TypeScript
   interfaces, so no other host can read or produce one.
3. **No unified provisioning contract.** export→provision→import exists in ultrachat alone,
   informally. `resource_bound` primitives have no portable way to say "bind the *buyer's*
   resources, not the seller's."
4. **Three drifting Operation Contracts.** total-recall (3 envelope types), festech (4, incl.
   `delete`), and the spec disagree. There is no single engine.
5. **No round-trip conformance.** Nothing proves a `.ucw` from ultrachat instantiates on
   festech. Without that proof, the marketplace is single-vendor.

## 3. Goals & Non-Goals

**Goals**
- Define the `.ucw` bundle format (manifest + content + parameters + provisioning) in `ssss-spec.md`.
- Add a `portability` classification to every core primitive in `registry/core.json`.
- Specify the export/provision/import contract: deterministic, idempotent, id-remapping, resource-binding.
- Ship conformance fixtures proving cross-host round-trip.
- Land the Track 0 foundations (validator, autolink, multilingual) that bundles depend on.

**Non-Goals (this phase)**
- Building the marketplace UI/payments (that lives in the apps, not the standard).
- Migrating Festech's runtime store off the ephemeral filesystem (tracked separately; this
  project only depends on the *export* boundary, not the storage backend).
- Rotating leaked secrets (operator task, tracked in `festech.live/SECRETS.md`).

## 4. Users

- **Sellers** — operators of a proven workspace who export a sanitized `.ucw` to sell.
- **Buyers** — entrepreneurs who provision a `.ucw` into a live, branded, resourced business.
- **Hosts** — Ultrachat, Festech, Total Recall, and future third parties that must produce and
  consume conformant `.ucw` files.

## 5. Success Criteria

- A reference `.ucw` exports from one host and imports into another with identical resulting state (conformance-verified).
- Exporting with the `sale` profile provably strips all `tenant_private` primitives.
- A `resource_bound` primitive (e.g. a phone number) provisions against the buyer's resources, never the seller's.
- A v2 bundle upgrades a running v1 instance via `patch`/`migration` without destroying tenant data.
- `@gregiteen/ssss-cli` validates a bundle and resolves its links after id-remap.
