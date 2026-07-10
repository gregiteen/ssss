# SSSS — overview

The **Structured Semantic Syntax System** is a database-free, Markdown-first schema
and mutation contract for AI-agent state. A vault is a directory of Markdown files
with YAML frontmatter; every file declares a `type` defined in the registry.

`@gregiteen/ssss-cli` is the reference implementation: a dependency-free Operation Contract
kernel, a registry-driven validator, multilingual semantic adapters, and the
`.ucw` bundle/provisioning tooling.

## The pieces

| Piece | Where | What it is |
|-------|-------|------------|
| Spec | `docs/ssss-spec.md` | The normative standard. |
| Core registry | `registry/core.json` | Document primitives + contracts for semantic (§11.9), bundle (§16), and provisioning (§17). |
| Kernel | `src/kernel.mjs` | Shared 0.9 mutation authority (`kernel.execute`) used by hosts and the reference engine. |
| Engine | `src/engine.mjs` | Compatibility façade over the kernel for the §6 Operation Contract. |
| Runtime | `src/runtime.mjs` | The §11.8 workflow trigger → event/task/run envelope planner. |
| Semantic | `src/semantic.mjs` | Lexical evidence, multilingual embeddings, privacy filters, and runtime rendering (§11.9). |
| Adapters | `src/vfs.mjs`, `leases.mjs`, `events.mjs`, … | Host-injectable storage/security/projection contracts. |
| Bundle | `src/bundle.mjs` | export / validate / provision / import (§16–§17). |
| Conformance | `conformance/` | Fixtures every host must pass. |

## The lifecycle

```
vault ──export──▶ .ucw bundle ──provision──▶ envelope plan ──import──▶ new vault
        (§16, pure)            (§17, params + links)        (§6, idempotent)
```

## Commands

Run `ssss help <topic>` for any of:
`runtime`, `semantic`, `portability`, `bundle`, `provisioning`,
`export`, `provision`, `import`, `conformance`, `autolink`.

Run `ssss <command> --help` for: `export`, `validate`, `inspect`, `provision`,
`import`, `semantic`, `primitive`, `registry`, `adapter`, `migrate`,
`autolink`, `conformance`.
