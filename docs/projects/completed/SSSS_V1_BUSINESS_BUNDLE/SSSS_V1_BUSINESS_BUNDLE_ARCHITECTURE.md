---
type: project_document
title: SSSS_V1_BUSINESS_BUNDLE — Architecture
tags: ["project-management", "SSSS_V1_BUSINESS_BUNDLE"]
timestamp: 2026-06-24T16:00:00Z
---

# SSSS_V1_BUSINESS_BUNDLE — Architecture

> **Project Prefix**: `SSSS_V1_BUSINESS_BUNDLE`
> **Kanban State**: 🏗️ In Progress
> **Author**: Google Antigravity
> **Date**: 2026-06-24

---

## 0. Method: harvest the best from three implementations, canonicalize, roll back out

SSSS is not greenfield. All three apps already ship working SSSS engines, and each one
independently invented a different layer of the standard. The job is to **lift the strongest
implementation of each layer into the canonical spec + `@gregiteen/ssss-cli`, then re-derive all three
apps from it** so they stop drifting.

| Layer | Strongest existing implementation | Canonical home |
| --- | --- | --- |
| Operation Contract (pipeline, idempotency, repair) | **total-recall** `src/core/operation-validator.mjs` | spec §6 + `@gregiteen/ssss-cli` |
| Envelope schemas (operation/patch/event/migration/release) | **total-recall** `src/core/schema.mjs` (Zod) | `registry/core.json` + `@gregiteen/ssss-cli` |
| Registry-driven validation | **festech** `apps/web/server/services/ssss/SsssValidator.ts` | `@gregiteen/ssss-cli` `SsssValidator` |
| `delete` envelope + path-traversal safety | **festech** `SsssOperationService.ts` | spec §6 reconciliation |
| `resource_bound` primitives (`domain`, `phone_number`, …) | **festech** `docs/ssss/primitive-registry.json` | `registry/core.json` + `extensions/festech.json` |
| `.ucw` bundle (manifest + files + branding) | **ultrachat** `server/services/workspace/WorkspaceVfsPackageService.ts` | spec §16 + `@gregiteen/ssss-cli` |
| Provisioning (capabilities, template vars, dep graph) | **ultrachat** `server/types/workspace.ts` | spec §16.x |
| Marketplace submission metadata | **total-recall** `metadata.schema.json` | spec §16 listing schema |

The rest of this document specifies each canonical layer and cites the source it is lifted from.

## 1. The Portability Classification (keystone — registry §5)

Add one field, `portability`, to every primitive in `registry/core.json`. This is the smallest
change with the largest payoff: a safe sale and a complete backup fall out of the same rule.

| Class | Meaning | Examples (from real registries) | backup | template | sale |
| --- | --- | --- | --- | --- | --- |
| `structural` | the business model | `workflow`, `assistant`, `page`, `skill`, `model`, `rule` | ✅ | ✅ | ✅ |
| `tenant_private` | the operator's private data | `conversation`, `run`, `event`, festech `profile`, CRM `Contact`/`Deal` (TR `schema.mjs`) | ✅ enc. | ❌ | ❌ |
| `resource_bound` | needs a real resource bound at provision | festech `domain`, `phone_number`, `integration_connection` (`primitive-registry.json`) | ✅ | ⚠️ declared | ⚠️ declared |

**This is not theoretical — ultrachat already does an ad-hoc version of it.**
`WorkspaceVfsPackageService.exportWorkspacePackage()` filters out platform-only system skills
and `admin-security` before packaging (lines ~111–124). We are generalizing that one-off
filter into a declared, registry-backed classification. An **export profile** is just a filter
over `portability`:

- `backup` → all classes (encrypted at rest).
- `template` / `sale` → `structural` verbatim; `resource_bound` reduced to a requirement
  declaration; `tenant_private` dropped.

This is the same rule that answers "why was real Workshop Collective customer data sittable in a
repo" — that data is `tenant_private` and must never be in a `template`/`sale` bundle.

## 2. The Operation Contract (lift from total-recall, reconcile festech)

`total-recall/src/core/operation-validator.mjs` is the most complete reference and should become
the canonical `@gregiteen/ssss-cli` engine. Its `processOperation(envelope, vaultRoot, options)`:

- Dispatches on a `schemaMap = { operation, patch, event }` of Zod schemas from `schema.mjs`.
- On schema failure returns a response **plus a `repair` block** (`buildRepair(zodError)`) — this
  is the spec §9 "Validation & Repair" mechanism, already implemented.
- Enforces **idempotency**: `warmIdempotencyCache()` replays the `.events` audit log and keys on
  `correlation_id`/`operation_id`, so re-applying an envelope is a safe no-op. **Import MUST be
  idempotent — this is the existing primitive that guarantees it.**
- Carries `agentRole` (authz) and a `leaseStore` (§7 leases).

**Reconciliation required:** festech's `SsssOperationService.ts` (line 18) defines a **fourth
envelope type** the spec and total-recall lack:

```ts
type: "operation" | "patch" | "event" | "delete";
```

Decision: **promote `delete` into the canonical Operation Contract** (spec §6.2 + add
`DeleteEnvelopeSchema` to `schema.mjs`). Export/provision never deletes, but a live workspace
and an upgrade migration do. Also lift festech's `resolveContainedPath` path-traversal guard
into the canonical engine — every host needs it and only festech has it today.

## 3. The `.ucw` Bundle Format (canonicalize ultrachat — new spec §16)

ultrachat's `VfsPackage` (in `WorkspaceVfsPackageService.ts`) is already the bundle. We promote
its shape to the spec and tighten the loose ends. Current real interfaces:

```ts
interface VfsPackage { manifest: VfsPackageManifest; branding?: VfsPackageBranding; files: VfsPackageFile[]; }
interface VfsPackageManifest {
  name; description; version; exported_at; source_workspace_id?;
  file_count;
  categories: { assistants; workflows; rules; crm; cms; other };      // → generalize
  capabilities?: { needs_email; needs_phone; needs_asterisk; needs_elevenlabs };  // → generalize
}
```

Canonical §16 bundle = the same envelope with three deltas:

1. **`categories` → `primitive_inventory`**: a `{ <type>: count }` map keyed by registry type
   instead of a hardcoded six-bucket struct, so extension primitives are counted too.
2. **`capabilities` → `provisioning`**: ultrachat's `needs_email/needs_phone/needs_asterisk/
   needs_elevenlabs` booleans become a list of typed `resource_bound` requirements (so a third
   host without Asterisk can still satisfy "phone" via Telnyx). This is derived from the
   `resource_bound` primitives in the bundle, not hand-maintained booleans.
3. **`manifest` gains** `ssss_core_version`, `required_extensions[]`, `export_profile`, and a
   `provenance { content_hash, exporter, signature? }` block (lift the integrity idea; ultrachat
   already imports `crypto`). On-disk transport stays `package.ucw.json` (already the marketplace
   path in `server/routes/marketplace/listings.ts`).

`parameters[]` (buyer-filled template variables) are **already typed** in ultrachat
`server/types/workspace.ts` as `WorkspaceTemplateVariableDefinition` — note its `type` union
already includes `domain | phone | email | account_ref` and it has `dependsOn[]`. We adopt that
verbatim as the bundle `parameters` schema.

## 4. The Provisioning Contract (lift ultrachat's graph — spec §16.x)

export → provision → import already exists end-to-end: `accountAssistant.ts:257`
(`/workspaces/:id/duplicate`) calls `exportWorkspacePackage` → orchestrator provision →
`importWorkspacePackage`. We formalize it as three deterministic operations:

1. **`export(workspace, profile) → bundle`** — walk the VFS subtree, apply the §1 portability
   filter, stamp provenance + `content_hash`.
2. **`provision(bundle, params, resources) → plan`** (pure, no writes):
   - **Validate** `ssss_core_version` + `required_extensions` against the host registry (festech's
     registry-driven `SsssValidator` is the model).
   - **Id-remap** every primitive to fresh ids and rewrite bundle-relative links (Track 0
     autolinker is exactly this rewrite engine).
   - **Bind** each `provisioning` requirement to a buyer resource. ultrachat's
     `WorkspaceProvisioningStep.mode` (`existing | provision | install | generate | configure`)
     and `WorkspaceGraphEdge.relation` (`owns_domain`, `routes_calls_to`, …) are the canonical
     vocabulary for this binding.
   - **Interpolate** `parameters` into parameterized fields.
   - Emits a list of Operation envelopes — nothing written yet, so the plan is fully testable.
3. **`import(plan) → workspace`** — apply envelopes through the §2 contract. Idempotent by
   construction (the total-recall idempotency cache). ultrachat's `importWorkspacePackage`
   returns a `CapabilityChecklist` and fires background telephony/email provisioning — that becomes
   the reference `import` post-step.

## 5. Composition & Upgrade (reuse `migration` / `release` / `patch`)

- **Compose**: a bundle declares dependence on others (festival-in-a-box = ticketing +
  sponsor-CRM + email-marketing). ultrachat's `WorkspaceMarketplaceRecommendation.installMode`
  (`optional | recommended | required`) is the dependency-strength vocabulary.
- **Upgrade a live instance**: ship "business v2" onto a running v1 via a `migration` primitive
  (Zod `MigrationSchema` already in TR `schema.mjs`) whose body is `patch` envelopes touching only
  `structural` files. Because `tenant_private` is never in a `template`/`sale` bundle, a
  structural-only patch preserves the buyer's customers by construction. A `release` primitive
  records the delivered version.

## 6. Roll-out (re-derive the three apps from the canon)

After the canon lands, each app sheds its bespoke copy:

- **total-recall** — already closest to canon; export its `operation-validator`/`schema` as the
  `@gregiteen/ssss-cli` core, then consume `@gregiteen/ssss-cli` instead of local copies.
- **festech** — replace `SsssValidator.ts` + `primitive-registry.json` with `@gregiteen/ssss-cli` +
  `registry/core.json` + `extensions/festech.json`; keep the `delete` envelope (now canonical).
- **ultrachat** — replace `VfsPackage*` types with the canonical §16 bundle types from
  `@gregiteen/ssss-cli`; keep its provisioning orchestrator, now typed against the standard.

## 7. Validation Strategy

`conformance/fixtures.json` + `scripts/conformance.mjs` gain fixtures for: per-profile portability
filtering; a full export→provision→import round-trip; id-remap link integrity; a structural-only
v2 upgrade preserving tenant data; and `delete`-envelope semantics. **Cross-host proof:** the same
reference `.ucw` runs through ultrachat's and festech's engines and must yield identical resulting
state — that equality is what makes the marketplace multi-vendor instead of single-app.
