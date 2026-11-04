---
type: root-index
title: "OpenWiki — SSSS"
description: "Root index for the SSSS reference-implementation OpenWiki: distinguishes the SSSS spec/registry/kernel/bundle/runtime/semantic layer from the Total Recall brain/IDE operational layer and routes into the concept, workflow, operations, and integrations pages."
tags: [ssss, openwiki, index, reference-implementation, total-recall]
verified:
  - by: openwiki/0.7.3
    at: 2026-11-03T07:15:54.702Z
---

# OpenWiki — SSSS

This repository (`@gregiteen/ssss-cli`) is the **reference implementation of the
Structured Semantic Syntax System** — a database-free, Markdown-first schema and
mutation contract for portable AI-agent state. Its OpenWiki documents the two
distinct layers that coexist in the repo.

## The two layers

| Layer | What it is | Owned by |
|-------|------------|----------|
| **SSSS reference implementation** | The normative spec, registry, JSON Schemas, the shared mutation kernel, the Operation Contract engine, the workflow runtime, the multilingual semantic index, and the `.ucw` bundle/provisioning tooling. | This codebase. |
| **Total Recall brain / IDE** | The operational surface that runs the repo as a Total Recall brain: IDE instruction injection (`AGENTS.md`, `CLAUDE.md`, `.cursor/rules`, `GEMINI.md`), durable memory, skills, and credentials. | The Total Recall CLI + plugins. |

The SSSS layer is the subject of this OpenWiki. The brain/IDE layer is documented
under [Total Recall brain, IDE & secrets](integrations/total-recall-and-ide.md).

> **Secrets rule.** Never put API keys, tokens, or credential values in OpenWiki
> pages or compiled IDE instruction files. Credentials go through the Total
> Recall auth plugin (`total-recall auth secret …`) following `TR_SECRETS_BRAIN`.
> See [Total Recall brain, IDE & secrets](integrations/total-recall-and-ide.md).

## What SSSS defines

SSSS is a vendor-neutral standard plus a dependency-free reference engine. It
defines, at a high level:

- **Document primitives** — typed Markdown files with YAML frontmatter, validated
  against a registry rather than hand-written code.
- **The Operation Contract (spec §6)** — four envelope types
  (`operation` / `patch` / `event` / `delete`) for mutating a vault, with
  idempotency replay and audit.
- **The workflow runtime (spec §11.8)** — workflows and standalone triggers
  derive deterministic event/task/run envelopes from the vault.
- **Multilingual semantic runtime (spec §11.9)** — deterministic lexical
  evidence, injected embeddings, and runtime rendering with symbolic controls
  fixed.
- **Portability classification (spec §5.5)** — every primitive is
  `structural`, `tenant_private`, or `resource_bound`, so a vault can be sold or
  shared without leaking private data.
- **The `.ucw` bundle (spec §16) and provisioning contract (spec §17)** —
  package a vault, then `export → provision → import → upgrade` it into a fresh
  environment, deterministically and idempotently.

The package is **dependency-free**: a host needs neither Zod nor a YAML library to
be conformant. The reference engine *is* the validator.

## How the layers fit together

```mermaid
flowchart TD
  vault["Markdown vault (typed frontmatter)"]
  registry["Registry + JSON Schemas"]
  kernel["Kernel (shared mutation authority)"]
  engine["Operation Contract engine"]
  runtime["Workflow runtime planner"]
  semantic["Semantic index + rendering"]
  bundle[".ucw bundle / provisioning"]
  cli["ssss CLI + HTTP/bridge transports"]
  brain["Total Recall brain / IDE"]

  vault --> registry
  registry --> engine
  engine --> kernel
  runtime --> engine
  semantic --> vault
  bundle --> vault
  cli --> engine
  cli --> bundle
  cli --> semantic
  brain --> cli
```

The registry resolves types and portability; the engine is a thin façade over
the kernel, which owns all mutation semantics. See
[SSSS system architecture](architecture.md).

## Where to start

- **New to the codebase?** Start at the
  [Quickstart](quickstart.md) for a task-to-page routing map and the one-command
  entrypoints.
- **Need the mental model?** Read
  [SSSS system architecture](architecture.md), then the concept pages below.

## Pages by area

### Concepts

- [Registry, portability & schemas](concepts/registry-and-portability.md) —
  core registry primitives, extension composition, the three portability classes,
  the zero-dependency frontmatter parser, and Draft 2020-12 JSON Schemas.
- [Operation Contract & mutation kernel](concepts/operation-contract.md) — the
  four envelope types, the `kernel.execute` stages, idempotency replay,
  authorization, and the symbolic `ERROR_CODES` to HTTP status mapping.
- [Bundle format & provisioning contract](concepts/bundle-and-provisioning.md)
  — the `.ucw` manifest/files/provenance shape, parameters and link integrity,
  the `export → provision → import → upgrade` verbs, determinism, and
  idempotency.

### Workflows

- [Mutation & commit workflow](workflows/mutation-commit.md) — end-to-end
  control/data flow for a single Operation Contract request through the kernel.
- [Vault → bundle → tenant lifecycle](workflows/vault-lifecycle.md) — the
  export → validate → inspect → provision → import → upgrade lifecycle and the
  `ssss new` scaffold.
- [Workflow runtime planning](workflows/workflow-runtime.md) — how triggers
  become event/task/run envelopes; a planning layer, not a daemon.
- [Semantic projection & search](workflows/semantic-index.md) — the
  deterministic, privacy-safe semantic index and `ssss semantic`.

### Operations

- [CLI & transports](operations/cli-and-transports.md) — the `ssss` CLI
  dispatcher, the reference HTTP server, the stdin/stdout JSON bridge, and the
  package `exports` subpaths.
- [Conformance & test suites](operations/conformance-and-testing.md) —
  `ssss conformance`, `npm test`, the durability suites, and the reference
  bundle round-trip.

### Integrations

- [Host adapter contracts](integrations/host-adapters.md) — the
  host-injectable VFS, event store, lease, idempotency, intent, and projection
  adapters and their file-based reference implementations.
- [Total Recall brain, IDE & secrets](integrations/total-recall-and-ide.md) —
  the operational layer: IDE connectors, memory, skills, and credential
  handling.

## Repository entry points

```bash
ssss new <dir> --install            # scaffold a starter vault + conformance test
ssss conformance --engine           # replay fixtures + round-trip the reference bundle
npm test                            # conformance --engine + event/frontmatter/durability suites
ssss serve                          # reference HTTP server for operations
ssss bridge                         # stdin/stdout JSON transport for non-JS hosts
```

See the [commands table](quickstart.md) for the full `ssss` command surface and
the authoritative repository layout in the project root `README.md`.