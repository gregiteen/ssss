# SSSS — overview

The **Structured Semantic Syntax System** is a database-free, Markdown-first schema
and mutation contract for AI-agent state. A vault is a directory of Markdown files
with YAML frontmatter; every file declares a `type` defined in the registry.

`@gregiteen/ssss-cli` is the reference implementation: a dependency-free Operation Contract
engine, a registry-driven validator, and the `.ucw` bundle/provisioning tooling.

## The pieces

| Piece | Where | What it is |
|-------|-------|------------|
| Spec | `docs/ssss-spec.md` | The normative standard. |
| Core registry | `registry/core.json` | The 14 document primitives + 5 contract primitives, plus the bundle (§16) and provisioning (§17) schemas. |
| Engine | `src/engine.mjs` | The §6 Operation Contract pipeline (operation/patch/event/delete). |
| Runtime | `src/runtime.mjs` | The §11.8 workflow trigger → event/task/run envelope planner. |
| Bundle | `src/bundle.mjs` | export / validate / provision / import (§16–§17). |
| Conformance | `conformance/` | Fixtures every host must pass. |

## The lifecycle

```
vault ──export──▶ .ucw bundle ──provision──▶ envelope plan ──import──▶ new vault
        (§16, pure)            (§17, params + links)        (§6, idempotent)
```

## Commands

Run `ssss help <topic>` for any of:
`runtime`, `portability`, `bundle`, `provisioning`, `export`, `provision`, `import`, `conformance`, `autolink`.

Run `ssss <command> --help` for: `export`, `validate`, `inspect`, `provision`, `import`, `autolink`, `conformance`.
