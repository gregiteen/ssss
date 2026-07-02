# SSSS — Structured Semantic Syntax System

> A database-free, Markdown-first schema and mutation contract for AI-agent state.
> Turn a running business into a single tradeable file — *a festival in a box.*

[![conformance](https://img.shields.io/badge/conformance-fixtures%20%2B%20runtime%20%2B%20bundle-brightgreen)](conformance/)
[![spec](https://img.shields.io/badge/spec-v0.5%20draft-blue)](docs/ssss-spec.md)
[![OKF](https://img.shields.io/badge/Google%20OKF-compliant-blue)](docs/ssss-spec.md)

SSSS is the vendor-neutral standard and reference implementation shared by
[festech.live](https://festech.live), **ultrachat**, and **total-recall**. It defines:

- **Document primitives** — typed Markdown files with YAML frontmatter (`workflow`,
  `rule`, `page`, `assistant`, …), validated against a registry, not hand-written code.
- **The Operation Contract** (§6) — four envelope types (`operation` / `patch` /
  `event` / `delete`) for mutating a vault, with idempotency replay and audit.
- **The Workflow Runtime Contract** (§11.8) — workflows own triggers; daemons,
  crons, and webhooks derive idempotent event/task/run envelopes from the vault.
- **Portability classification** (§5.5) — the keystone: every primitive is
  `structural`, `tenant_private`, or `resource_bound`, so a vault can be *sold*
  without leaking the operator's private data.
- **The `.ucw` bundle format** (§16) and **provisioning contract** (§17) — package a
  vault, then `export → provision → import` it into a fresh tenant, deterministically.

This package, `@ssss/cli`, is **dependency-free**: a host needs neither Zod nor a YAML
library to be conformant. The reference engine *is* the validator.

## Install

```bash
npm install -g @ssss/cli      # the `ssss` command
# or use it as a library:
npm install @ssss/cli
```

Requires Node 18+. No runtime dependencies.

## Start a new project

```bash
ssss new my-app --install                # scaffold + install + run the conformance test
ssss new my-app --with-total-recall      # also wire the Total Recall memory OS
```

Scaffolds a starter `vault/`, a dependency-free conformance test, and a `CLAUDE.md`.
See `ssss help scaffold`.

## Quick start — the lifecycle

```
vault ──export──▶ .ucw bundle ──provision──▶ envelope plan ──import──▶ new vault
        (§16, pure)            (§17, params + links)        (§6, idempotent)
```

```bash
# 1. Package a vault as a sellable bundle (drops tenant-private data)
ssss export ./my-vault --profile sale --out festival.ucw.json

# 2. Inspect / verify it
ssss inspect  festival.ucw.json --files
ssss validate festival.ucw.json

# 3. Stand up a fresh tenant from it
ssss import festival.ucw.json --vault ./new-tenant \
  --param business_name="Acme Fest" --param domain=acme.live

# Re-running import commits nothing — it is idempotent.
```

## Commands

| Command | Purpose |
|---------|---------|
| `ssss new <dir>` | Scaffold a new SSSS project (`--with-total-recall`, `--install`). |
| `ssss export <vault>` | Package a vault into a `.ucw` bundle (§16). Pure & deterministic. |
| `ssss validate <bundle>` | Check a bundle against the schema + portability rules. |
| `ssss inspect <bundle>` | Human-readable summary (manifest, inventory, params, steps). |
| `ssss provision <bundle>` | Plan an install: params + link integrity → envelopes (§17). |
| `ssss import <bundle>` | Replay a bundle/plan into a vault via the engine (idempotent). |
| `ssss autolink [dir]` | Generate OKF wiki-links across a vault. |
| `ssss conformance` | Run the canonical conformance suite (§12). |
| `ssss help [topic]` | Local docs: `runtime`, `portability`, `bundle`, `provisioning`, … |

Run `ssss <command> --help` for flags, or `ssss help <topic>` for concepts.

## Use as a library

```js
import { createEngine } from '@ssss/cli/engine';
import { exportBundle, validateBundle, provisionBundle, importBundle } from '@ssss/cli/bundle';
import { planWorkflowTrigger } from '@ssss/cli/runtime';

const bundle = exportBundle('./my-vault', { profile: 'sale', name: 'Festival in a Box' });
const { valid, errors } = validateBundle(bundle);

const engine = createEngine();
const plan = provisionBundle(bundle, { parameters: { domain: 'acme.live' }, workspaceId: 'ws-1' });
importBundle(plan.plan, './new-tenant', engine);

const workflowContent = `---
type: workflow
name: "Daily Digest"
---

1. Gather messages.
2. Summarize.
3. Send digest.
`;
const runtimePlan = planWorkflowTrigger({
  workflowPath: 'workflows/daily-digest/WORKFLOW.md',
  workflowContent,
  workspaceId: 'ws-1',
  trigger: { type: 'cron', id: 'daily-0800', cron: '0 8 * * *' },
  scheduledFor: '2026-07-02T14:00:00.000Z',
});
```

Exports: `@ssss/cli` / `@ssss/cli/engine` (Operation Contract engine),
`@ssss/cli/bundle` (export/provision/import), `@ssss/cli/registry`,
`@ssss/cli/runtime`, `@ssss/cli/frontmatter`.

## Portability — why a vault is safe to sell

| Class | Meaning | In a `sale` export? |
|-------|---------|---------------------|
| `structural` | The sellable business model (`workflow`, `rule`, `page`, …). | ✅ shipped |
| `resource_bound` | Needs a real resource bound at provision (`domain`, `phone_number`). | ✅ shipped (as a parameter/step) |
| `tenant_private` | The operator's private data (`task`, customer records). | ❌ **dropped** |

`template` and `sale` exports MUST drop every `tenant_private` file. The reference
bundle proves it — see `ssss help portability`.

## Conformance

A host MUST NOT claim SSSS conformance without passing the suite in
[`conformance/`](conformance/):

```bash
ssss conformance            # structural + registry validation
ssss conformance --engine   # + replay all fixtures + round-trip the reference bundle
npm test                    # == ssss conformance --engine
```

## Repository layout

```
docs/ssss-spec.md          The normative specification (v0.5 draft).
docs/help/                 Topic docs surfaced by `ssss help`.
registry/core.json         14 document + 5 contract primitives; bundle & provisioning schemas.
registry/extensions/       Application extension registries (e.g. festech).
src/engine.mjs             Operation Contract engine (§6).
src/runtime.mjs            Workflow trigger → event/task/run envelope planning (§11.8).
src/bundle.mjs             export / validate / provision / import (§16–§17).
src/registry.mjs           Registry-driven type + portability resolution.
src/frontmatter.mjs        Zero-dependency YAML frontmatter.
scripts/ssss.mjs           The `ssss` CLI dispatcher.
conformance/               Canonical fixtures + reference bundle.
```

## License

ISC © Greg Iteen. See [LICENSE](LICENSE).
