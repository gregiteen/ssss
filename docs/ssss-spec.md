# SSSS — Structured Semantic Syntax System

**Specification v0.4 — Draft**

> This is the canonical, vendor-neutral specification for SSSS. It is the ground
> truth on which all SSSS implementations are built. It is intended to be vendored
> byte-for-byte into any repository that implements SSSS (e.g. the UltraChat
> Sovereign AI OS, the Total Recall reference kernel).
>
> Status: **Draft**. The format, type registry, and conformance contract are under
> active development. Expect breaking changes until v1.0.
>
> Implementation-specific detail (routes, services, storage backends, deployment)
> does **not** belong in this document — it belongs in each implementation's own
> `SKILL.md`. This file describes *what SSSS is*, never *how one product wires it up*.

---

## 1. Abstract

SSSS — the Structured Semantic Syntax System — is a **database-free, Markdown-first
schema and mutation contract for AI agent state**.

Every unit of agent-relevant state — a memory, a skill, a conversation, a workflow
run, an assistant definition — is a plain Markdown file with YAML frontmatter. There
is no relational database of record, no binary format, and no proprietary container.
A relational store MAY exist, but only as a *disposable projection* rebuildable from
the Markdown.

SSSS additionally defines the **Operation Contract**: a single, validated, idempotent
envelope through which all agent-generated mutations must flow. This makes
AI-generated state changes deterministic, replayable, conflict-safe, and auditable.

Any tool, IDE, agent framework, or CLI that can read Markdown can interoperate with
an SSSS vault. The only thing that distinguishes a memory engine, a chat runtime, and
a workflow orchestrator is *which primitive types they read and write* — the
underlying file format and mutation contract are identical.

---

## 2. Conformance Terminology

The key words **MUST**, **MUST NOT**, **REQUIRED**, **SHALL**, **SHALL NOT**,
**SHOULD**, **SHOULD NOT**, **RECOMMENDED**, **MAY**, and **OPTIONAL** in this
document are to be interpreted as described in RFC 2119.

Defined terms used throughout:

| Term | Meaning |
|------|---------|
| **Host** | A system that implements SSSS — stores SSSS files and/or processes the Operation Contract. |
| **Vault** | The version-controlled directory tree of SSSS files. The source of truth. |
| **VFS** | Virtual File System — the addressable namespace of paths within a vault. |
| **Primitive** | A defined `type` of SSSS file or contract structure (see §5). |
| **Document primitive** | A primitive that exists as an addressable Markdown file. |
| **Contract primitive** | A primitive that exists only as a protocol structure (envelope, lease, event). |
| **Projection** | A derived, disposable representation of vault state (e.g. an SQL table, a search index). Never source-of-truth. |
| **Agent** | Any human or AI actor issuing operations. |

A host is **conformant** if it satisfies every MUST in this document and passes the
conformance fixtures of §12.

---

## 3. Design Principles

| Principle | Rule |
|-----------|------|
| **No database of record** | Product-meaningful state MUST live in Markdown files, not in a relational database. A database MAY hold projections only. |
| **Markdown is law** | Every state primitive exists as a `.md` file (document primitives) or as a JSON envelope over the contract (contract primitives). |
| **Semantic frontmatter** | Every SSSS file MUST carry YAML frontmatter with a `type` field that identifies how engines interpret it. |
| **One mutation contract** | All agent-generated mutations MUST flow through the Operation Contract (§6). Direct, unvalidated writes by agents are forbidden. |
| **Deterministic validation** | Every mutation MUST be validated against the primitive's schema before commit. Validation MUST be deterministic — same input, same verdict. |
| **Idempotent by key** | Every operation carries an idempotency key. Replays MUST NOT double-apply. |
| **Append-only history** | The event log is immutable. Events are never updated or deleted. |
| **Disposable indexes** | Derived indexes and projections are ephemeral caches, fully rebuildable from the vault. They may be deleted at any time. |
| **Git-versioned** | The vault is version-controlled. History is provenance. |
| **Portable** | A vault is interpretable by any Markdown-capable tool. No host is privileged. |

---

## 4. The SSSS File

### 4.1 Anatomy

A document primitive is a UTF-8 Markdown file with two regions:

```markdown
---
type: <primitive-type>
<frontmatter fields...>
---

<Markdown body>
```

1. **Frontmatter** — a YAML block delimited by a leading `---` line and a closing
   `---` line. It MUST be the first content in the file. It is machine-readable
   structured data.
2. **Body** — everything after the closing `---`. It is human-readable Markdown
   prose, and for append-type primitives (§5.3) it carries the ordered records.

A Markdown file with no frontmatter, or with frontmatter that omits `type`, is **not
an SSSS file** — it is an ordinary Markdown file (e.g. a `README`) and is out of SSSS
scope. Where a context *requires* an SSSS file — a write through the Operation
Contract (§6) to an SSSS path — a missing or unrecognized `type` MUST be rejected.

### 4.2 Universal Frontmatter Fields

Every SSSS document primitive MUST include:

| Field | Type | Description |
|-------|------|-------------|
| `type` | string | The primitive type. MUST match an entry in the Type Registry (§5). |
| `tags` | array | Array of string tags for categorization and routing. REQUIRED for OKF compatibility. |

To ensure full compatibility with the **Google Open Knowledge Format (OKF)**, SSSS strongly RECOMMENDS the following universal metadata fields on all document primitives:

| Field | Type | Description |
|-------|------|-------------|
| `title` | string | Human-readable title of the document. |
| `description` | string | Brief summary of the document's purpose. |
| `aliases` | array | Array of alternative names for this concept, used for wiki autolinking. |
| `timestamp` | string | ISO 8601 timestamp of last modification. |

Every primitive type defines its own additional REQUIRED and OPTIONAL fields
(§5.4). To maintain forward compatibility and allow agents scratchpad space, hosts MUST NOT reject documents containing unknown frontmatter keys. Unknown fields MUST be preserved.

### 4.3 Linking & Progressive Disclosure

SSSS adopts the OKF standards for hyperlinking and directory indices:

1. **Absolute Bundle-Relative Links**: Links to other primitives SHOULD be absolute paths starting from the vault root (e.g., `[Customer Assistant](/assistants/support.md)`).
2. **The `# Citations` Section**: If a primitive's body makes claims sourced from other primitives or external data, it SHOULD include a `# Citations` heading at the bottom with numbered reference links.
3. **Index Files (`index.md`)**: A host MAY generate `index.md` files in directories to provide progressive disclosure of the vault's contents. These files contain no frontmatter and exist solely to serve as a table of contents for agents traversing the VFS.

### 4.4 Canonical Filenames

Document primitives that have a fixed role in a directory use an **uppercase
canonical filename** that signals the primitive at a glance:

| Filename | Primitive |
|----------|-----------|
| `SKILL.md` | `skill` |
| `ASSISTANT.md` | `assistant` |
| `WORKFLOW.md` | `workflow` |
| `MODEL.md` | `model` |
| `CONVERSATION.md` | `conversation` |
| `RUN.md` | `run` |

Free-standing primitives (e.g. `memory`, `task`) instead use a `kebab-case` slug
filename matching their `slug` field. The frontmatter `type` is always
authoritative; the filename is a convention, not a substitute for validation.

---

## 5. Primitive Type Registry

SSSS defines two families of primitive: **document primitives** (addressable files)
and **contract primitives** (protocol structures). A host need not implement every
primitive — it implements the subset its product requires — but any primitive it
*does* implement MUST conform to the schema below.

### 5.1 Document Primitives

| `type` | Family | Portability | Purpose |
|--------|--------|-------------|---------|
| `memory` | knowledge | structural | A single unit of agent knowledge (rule, pattern, fact, preference). |
| `skill` | capability | structural | A skill package manifest. |
| `rule` | governance | structural | A workspace-scoped behavior rule applied to assistants/agents. |
| `task` | work | tenant_private | A unit of submitted work — one step or many. The universal work primitive. |
| `assistant` | actor | structural | The definition of an AI assistant/persona. |
| `workflow` | work | structural | A reusable **task template**: a defined procedure plus triggers. Firing a workflow submits a `task`. |
| `model` | catalog | structural | The definition of an inference model. |
| `conversation` | transcript | tenant_private | An append-only chat transcript. |
| `run` | transcript | tenant_private | An append-only workflow execution record. |
| `conflict` | meta | tenant_private | A record of two contradicting primitives, blocking promotion. |
| `page` | capability | structural | A VFS-native sandboxed custom workspace page. |
| `migration` | meta | structural | An SSSS schema migration state record. |
| `release` | meta | structural | An SSSS system schema version release record. |

The **Portability** column is the primitive's default portability class (§5.5); a host
resolves it from `registry/core.json`. Extension registries assign their own primitives a
class — notably `resource_bound` for things like domains and phone numbers.

### 5.2 Contract Primitives

| `type` | Purpose |
|--------|---------|
| `operation` | A full atomic file write (create or full replace) — see §6. |
| `patch` | A partial merge into an existing file — see §6. |
| `event` | An append-only immutable log entry — see §6, §8. |
| `delete` | A tombstoning removal of a replace-type file — see §6. |
| `lease` | A file-level write lock — see §7. |

### 5.3 Append-Type vs. Replace-Type Documents

Document primitives are either:

- **Replace-type** — the whole file represents current state; a write replaces it
  entirely (`memory`, `skill`, `assistant`, `workflow`, `model`, `task`,
  `conflict`).
- **Append-type** — the file is an ordered, append-only log; writes add records to
  the body and MUST NOT rewrite prior records (`conversation`, `run`).

Append-type documents MUST be mutated only by appending. A host MUST reject an
operation that would rewrite or remove existing records of an append-type document.

### 5.4 Per-Type Schemas

Each schema lists REQUIRED fields. All other fields are OPTIONAL. Examples are
minimal and illustrative.

#### `memory`

The knowledge primitive. Categories: `invariants`, `patterns`, `anti-patterns`,
`preferences`, `decisions`, `concepts`, `facts`, `lore`.

REQUIRED: `type`, `slug`, `category`, `title`, `status`, `schema_version`.

Knowledge-graph fields, REQUIRED when `schema_version: 2`: `confidence` (0..1),
`importance` (1..5), `modality` (`must|must_not|should|should_not|descriptive|preference`),
`subject`, `predicate`, `object`, `sentiment_polarity`
(`directive_must|directive_must_not|descriptive|preference`).

The `subject`/`predicate`/`object` triple SHOULD use stable, language-neutral
concept identifiers (not localized prose), so the triple is a semantic anchor
independent of the document's authoring language — see §11.

```markdown
---
type: memory
slug: prefer-atomic-writes
category: patterns
title: "Always write files atomically (write-then-rename)"
status: active
schema_version: 2
confidence: 0.92
importance: 4
modality: must
subject: agent
predicate: use_atomic_write
object: file_system
sentiment_polarity: directive_must
---

Write to a temporary file, then `rename()` to the target. `rename()` is atomic on
POSIX filesystems; direct writes risk partial-file corruption on crash.
```

Memory nodes in the `invariants` category additionally carry `priority: absolute`
and `immutable: true`. The full `priority` enum is `absolute|high|normal|low`;
`priority` is OPTIONAL on non-invariant categories (defaults to `normal`).

#### `skill`

A capability package manifest. SSSS skill manifests are compatible with the open
Agent Skills standard: the minimal REQUIRED frontmatter is `name` and `description`.
The `type: skill` discriminator is REQUIRED for SSSS-managed manifests so the
registry can route them.

REQUIRED: `type`, `name`, `description`.

```markdown
---
type: skill
name: deploy
description: >-
  Deploy services with zero downtime. Use when the user mentions deploy,
  release, ship, or production push.
---

# Deploy
...
```

#### `task`

A unit of submitted work — the universal work primitive. A `task` MAY be ad-hoc or
instantiated from a `workflow` template; either way it executes as a `run`.

REQUIRED: `type`, `priority` (integer), `category`, `status`
(`pending|in_progress|done|failed`). A task instantiated from a template carries an
OPTIONAL `workflow_id` referencing it.

```markdown
---
type: task
priority: 85
category: skill-engineering
status: pending
---

## Objective
Research the payments API and write a reference skill.
```

#### `assistant`

The definition of an AI assistant.

REQUIRED: `type`, `name`.

```markdown
---
type: assistant
name: "Support Bot"
description: "Front-line customer support assistant."
model: "anthropic/claude-opus-4-5"
---

## Instructions
You are a helpful support assistant.
```

#### `workflow`

A reusable **task template** — a defined multi-step procedure plus triggers. A
workflow is not executed directly: when a trigger fires (or it is invoked), the host
**submits a `task`** from the template, and that task executes as a `run`. Workflow
and task are one work model — the workflow is the reusable definition, the task is
the submitted instance.

REQUIRED: `type`, `name`. `triggers` (array) is OPTIONAL — a workflow with no
triggers is valid and may be invoked manually or by another workflow.

```markdown
---
type: workflow
name: "Daily Digest"
description: "Sends a daily summary email."
triggers:
  - type: cron
    cron: "0 8 * * *"
isActive: true
---

## Steps
1. Gather unread messages.
2. Summarize.
3. Send digest.
```

#### `rule`

A workspace-scoped behavior rule that constrains how assistants/agents act.
Distinct from `memory` (which is agent-private knowledge): a `rule` is workspace
governance, authored deliberately.

REQUIRED: `type`, `name`. OPTIONAL: `description`, `scope`.

```markdown
---
type: rule
name: "No external links in replies"
description: "Customer-facing replies must not contain outbound URLs."
scope: support
---

Outbound links are stripped from any assistant reply on a support thread.
```

#### `model`

The definition of an inference model.

REQUIRED: `type`, `model_id`, `provider`.

```markdown
---
type: model
model_id: "anthropic/claude-opus-4-5"
provider: anthropic
display_name: "Claude Opus 4.5"
---

## Capabilities
Long-context reasoning, tool use, vision.
```

#### `conversation`

An append-only chat transcript. Append-type.

REQUIRED: `type`, `thread_id`. Typical fields: `workspace_id`, `user_id`, `status`,
`turn_count`, `created_at`.

```markdown
---
type: conversation
thread_id: "7f3a2b1c-..."
workspace_id: "..."
user_id: "..."
status: active
created_at: 2026-05-16T14:00:00Z
---

### turn 1 — user — 2026-05-16T14:00:00Z
Hello.

### turn 2 — assistant — 2026-05-16T14:00:05Z
Hi — how can I help?
```

#### `run`

An append-only workflow execution record. Append-type.

REQUIRED: `type`, `run_id`, `workflow_id`. Typical fields: `workspace_id`, `status`,
`step_count`, `started_at`.

```markdown
---
type: run
run_id: "run-001"
workflow_id: "daily-digest"
status: running
started_at: 2026-05-16T08:00:00Z
---

### step 1 — gather — 2026-05-16T08:00:01Z — ok
Collected 12 messages.
```

#### `conflict`

A record of two contradicting primitives. Blocks promotion until resolved.

REQUIRED: `type`, `conflict_id`, `status` (`pending|resolved`), `new_slug`,
`existing_slug`, `detected_at`.

```markdown
---
type: conflict
conflict_id: conflict-2026-05-16-001
status: pending
new_slug: use-html-email
existing_slug: use-plaintext-email
detected_at: 2026-05-16T18:30:00Z
---
```

#### `page`

A VFS-native sandboxed custom workspace page.

REQUIRED: `type`, `slug`, `name`, `sandbox_entry`.

```markdown
---
type: page
slug: "leads-portal"
name: "Leads Dashboard"
icon: "users"
layout: "split-chat"
sandbox_entry: "index.html"
---
```

#### `migration`

An SSSS schema migration record.

REQUIRED: `type`, `migration_id`, `from_version`, `to_version`, `status`, `description`.

```markdown
---
type: migration
migration_id: "mig-v2-to-v3"
from_version: 2
to_version: 3
status: pending
description: "Add vector_embedding field"
---
```

#### `release`

An SSSS system schema version release.

REQUIRED: `type`, `release_id`, `version`, `schema_version`, `summary`, `released_at`.

```markdown
---
type: release
release_id: "rel-3.1.0"
version: "3.1.0"
schema_version: 3
summary: "Added proposal and migration file types"
released_at: 2026-05-16T12:00:00Z
---
```

### 5.5 Portability Classification

A workspace is not one undifferentiated blob. Some of it is the **reusable business
model** (the workflows, assistants, pages, and rules that make the business run); some is
the operator's **private operational data** (customer transcripts, runtime work); and some
is **bound to a real external resource** (a domain, a phone number, a mailbox). Selling,
templating, and backing up a workspace each need a different slice. SSSS makes that slice
declarable instead of ad-hoc.

Every **document** primitive declares one **portability class** in its registry entry.
(Contract primitives — `operation`/`patch`/`event`/`lease` — are protocol envelopes, not
stored documents, and have no portability class.)

| Class | Meaning | May appear in template/sale? |
|-------|---------|------------------------------|
| `structural` | The reusable business model — carries no operator- or customer-specific data. | ✅ verbatim |
| `tenant_private` | The operator's private operational data (customers, transcripts, runtime work). | ❌ never — backup only, encrypted at rest |
| `resource_bound` | Requires a real external resource bound at provision time. | ⚠️ as a **requirement declaration** only — the seller's resource value is stripped |

A file MAY override its type's default with an `x_portability` frontmatter field. A host
MUST honor the **most restrictive** of (type default, instance override) — a file may make
itself more private than its type, never less.

An **export profile** is simply a filter over portability classes:

- **`backup`** — all three classes. `tenant_private` MUST be encrypted at rest.
- **`template`** / **`sale`** — `structural` verbatim; `resource_bound` reduced to a
  requirement declaration (seller's bound value stripped); `tenant_private` **dropped
  entirely**.

A host MUST reject a `template`/`sale` export that would emit a `tenant_private` primitive.
This single rule is what lets an operator sell a proven business model without ever
shipping a customer's data — the data is `tenant_private` by classification, so it
physically cannot enter a sale bundle.

---

## 6. The Operation Contract

All agent-generated mutations to a vault MUST flow through the Operation Contract.
An agent MUST NOT write vault files directly.

### 6.1 The Operation Envelope

An operation is a JSON envelope:

```jsonc
{
  "type": "operation",          // "operation" | "patch" | "event" | "delete"
  "idempotency_key": "uuid-v4", // see §6.4
  "path": "assistants/bot/ASSISTANT.md", // relative VFS path, no leading "/"
  "workspace_id": "uuid",       // the vault/workspace scope
  "content": "---\ntype: ...",  // full file content (operation, event)
  "patches": { },               // partial merge (patch only)
  "lease_id": "uuid",           // OPTIONAL — see §7
  "intent": "human description", // OPTIONAL — audit annotation
  "dry_run": false               // OPTIONAL — validate without committing
}
```

### 6.2 Envelope Types

| `type` | Semantics | Body field | Required envelope fields |
|--------|-----------|------------|--------------------------|
| `operation` | Full atomic write — creates or fully replaces a file. | `content` | `type`, `idempotency_key`, `path`, `workspace_id`, `content` |
| `patch` | Partial merge into an existing file's frontmatter and/or body. | `patches` | `type`, `idempotency_key`, `path`, `workspace_id`, `patches` |
| `event` | Append-only immutable log entry. Never overwrites. | `content` | `type`, `idempotency_key`, `path`, `workspace_id`, `content` |
| `delete` | Removes a replace-type file from the vault. | — | `type`, `idempotency_key`, `path`, `workspace_id` |

For `patch`, the `patches` object merges into frontmatter keys; the reserved key
`__body__` replaces or (for append-type documents) appends the Markdown body. For
`event`, `content` MUST be a valid JSON string carrying the event payload.

For `delete`, the host removes the file at `path` and appends a deletion event to the log
(§8) — the removal is itself an auditable, append-only record, so history is never lost. A
host MUST reject a `delete` targeting an **append-type** document (`conversation`, `run`)
or a non-existent path. A `delete` of an already-deleted path is an idempotent no-op that
returns the original result (§6.4). `delete` is the only contract type that removes vault
state; export and provision (§16) never delete — only a live workspace edit or a migration
(§5.4 `migration`) does.

### 6.3 The Processing Pipeline

A host MUST process every operation through these ordered stages. Any stage's
failure aborts the operation with no commit.

1. **Envelope validation** — `type` is one of the four envelope types
   (`operation`/`patch`/`event`/`delete`); required envelope fields present and
   well-formed.
2. **Idempotency check** — if this `idempotency_key` + `workspace_id` was already
   committed within the TTL, return the original result as a replay (§6.4). Stop.
3. **Authorization** — the agent has write access to `workspace_id`.
4. **Lease check** — if the target path is leased, the operation MUST carry a
   matching, unexpired `lease_id` (§7).
5. **Content validation** — for `operation`/`patch`, the resulting file is validated
   against its primitive schema (§9). Append-type rewrite attempts are rejected. For
   `delete`, the host verifies the target exists and is a replace-type document (append-type
   deletes are rejected).
6. **Commit** — the mutation is applied to the vault atomically. For `delete`, the file is
   removed.
7. **Audit** — an audit entry is appended to the event log (§8).

A `dry_run` operation runs stages 1–5 and then stops: it MUST return the validation
verdict with `success` reflecting validity, and MUST NOT commit (`committed_at` is
`null`).

### 6.4 The Operation Response

```jsonc
{
  "success": true,
  "type": "operation",
  "operation_id": "uuid",
  "path": "assistants/bot/ASSISTANT.md",
  "committed_at": "2026-05-16T14:00:00Z", // null for dry_run / failure
  "dry_run": false,
  "validation": {
    "valid": true,
    "type": "assistant",        // resolved primitive type
    "errors": [],
    "warnings": []
  },
  "replay": { },                 // present only on an idempotent replay
  "repair": { }                  // present only on validation failure — see §9
}
```

### 6.5 Error Codes

| Code | Meaning |
|------|---------|
| `401` | Authentication required. |
| `403` | Agent lacks write access to the workspace. |
| `409` | Lease conflict — path is locked, or the supplied lease is invalid/expired. |
| `422` | Validation failure — see `validation.errors` and `repair`. |
| `500` | Internal error — the operation was not committed. |

A host need not use HTTP; if it does, these are the canonical status codes.

---

## 7. Leases — Concurrency Control

A **lease** is a file-level write lock that prevents two agents from racing on the
same path.

- A lease is identified by a `lease_id` and scoped to a `(workspace_id, path)` pair.
- At most one active lease MAY exist per `(workspace_id, path)`.
- While a path is leased, an operation targeting it MUST present the matching,
  unexpired `lease_id` or be rejected with `409`.
- A lease MUST carry an expiry. An expired lease is treated as absent.
- An agent that acquires a lease MUST release it after its operation completes. A
  host SHOULD reclaim expired leases automatically.

Leases are advisory coordination, not security. Authorization (§6.3 stage 3) is the
security boundary.

---

## 8. The Event Log

The event log is an **append-only, immutable** record. It is two things at once: a
flat physical *log*, and a relational *event graph* layered on top of it.

### 8.1 The Log

- Events are written via `type: event` operations (§6.2).
- An entry, once written, MUST NOT be updated or deleted. There is no UPDATE and no
  DELETE. Ordering is arrival order; adjacency in the log is purely temporal.
- Audit entries (pipeline stage 7) are themselves events.
- The event log is the canonical history of *what happened*; the vault is the
  canonical state of *what is true now*. Both are source-of-truth; projections are
  not.

### 8.2 The Event Record

An event is a typed record — **not** a document primitive. There is no `EVENT.md`;
events exist only in the log. Each event carries:

| Field | Description |
|-------|-------------|
| `event_id` | Stable unique identity — makes the event addressable. |
| `event_type` | The kind of event (e.g. `feedback`, `audit`, `spawn`). |
| `correlation_id` | Groups every event of one logical flow ("saga"), however far apart in the log. |
| `caused_by` | Zero or more `event_id`s of the event(s) that directly caused this one (causation). |
| `subject` | The vault path / record the event is about. |
| `payload` | The event-type-specific body. |
| `ts` | ISO 8601 timestamp. |

### 8.3 The Event Graph

Events relate to **non-adjacent** events: a feedback event refers to the completion
it rated, an investigation to the feedback that triggered it, a fix to the
investigation. These references form a causal **graph** over the flat log.

The graph is preserved without violating append-only because **edges point backward
only**: a new event records its `caused_by` parents; an existing event is never
mutated to record a child. The forward view (an event's children, a full saga tree)
is reconstructed by scanning — so the **event graph is a derived artifact** (§10),
disposable and rebuildable. Relationships are canonical (backward `event_id`
references stored in the log); the graph index is only a cache.

A **session** is not a separate primitive — it is a named, `correlation_id`-scoped
slice of the event graph: the saga tree of one coherent unit of work.

---

## 9. Validation & Repair

Validation is **deterministic**: identical input always yields an identical verdict.

A file is valid if and only if:

1. It has well-formed YAML frontmatter.
2. The frontmatter `type` matches a primitive in the registry (§5).
3. Every REQUIRED field for that primitive is present and non-empty.
4. For append-type documents, the operation does not rewrite existing records.

Hosts MUST NOT reject a file due to the presence of unknown or unrecognized frontmatter keys. Unrecognized keys MUST be silently preserved to support agent scratchpads and forward compatibility with OKF extensions.

On failure, the host MUST return structured **repair feedback** so an agent can
self-correct without guesswork:

```jsonc
{
  "repair": {
    "field_errors": [
      { "field": "name", "issue": "Missing required field 'name' for type 'assistant'." }
    ]
  }
}
```

A host MAY additionally emit non-blocking `warnings` (e.g. deprecated fields,
low-confidence content). Warnings MUST NOT block a commit.

---

## 10. Derived Artifacts

Hosts MAY maintain derived artifacts for performance: search indexes, embedding
indexes, graph indexes, the **event-graph index** (the forward/causal view of the
event log — see §8.3), routing logs, and relational **projections** of vault data.

All derived artifacts are **disposable**:

- They MUST be fully rebuildable from the vault alone.
- They MUST NOT be treated as source-of-truth for product meaning.
- Deleting them MUST NOT lose information — only force a rebuild.

A host that maintains projections MUST provide a means to (a) rebuild a projection
from a vault scan, and (b) detect and repair drift between a projection and the
vault.

### 10.1 Projection Manifest

A host SHOULD maintain a `MANIFEST.json` (or equivalent) in the derived-artifacts
directory declaring each projection as disposable and recording provenance:

```jsonc
{
  "type": "projection-manifest",
  "generated_at": "2026-05-30T06:35:00Z",
  "vault_hash": "sha256:abc123...",       // content hash of the vault at build time
  "projections": [
    { "file": "graph-index.jsonl",    "disposable": true },
    { "file": "memory-layers.jsonl",  "disposable": true },
    { "file": "embeddings.json",      "disposable": true }
  ],
  "rebuild_command": "npx total-recall compile"
}
```

The `vault_hash` field enables **staleness detection**: if the current vault hash
differs from the manifest's hash, the projections are stale and SHOULD be rebuilt.
This supports **incremental compilation** — a host MAY skip recompilation when the
hash matches, avoiding redundant I/O on unchanged vaults.

---

## 11. The Semantic Layer

SSSS operates as two layers with deliberately opposite requirements. A conformant
host MUST keep them separate.

### 11.1 The Two Layers

**The deterministic layer** — the file format (§4), type registry (§5), Operation
Contract (§6), leases (§7), event log (§8), and validation (§9). It is exact and
reproducible: identical input yields an identical verdict. It is language-independent
*by construction*: its control vocabulary — every frontmatter **key** and every
enumerated **value** (`type`, `modality`, `status`, the primitive type names, …) —
consists of **stable symbolic identifiers**, never localized words. They are never
translated, exactly as a JSON key or an HTTP method is never translated. Only
natural-language *content* (§11.2) carries language. A host MUST NOT make this layer
fuzzy.

**The semantic layer** — retrieval, routing, deduplication, conflict detection, and
memory surfacing. It operates on **meaning**, not on shared surface tokens. This is
where natural-language content lives, and where SSSS becomes genuinely
language-independent. A host MUST NOT make this layer depend on lexical token overlap
alone.

### 11.2 Language Independence

Natural-language fields — `title`, `description`, document bodies, feedback comments —
MAY be authored in ANY language. The semantic layer MUST treat documents by meaning,
so a node authored in one language remains retrievable, routable, and
conflict-checkable against a query or node in any other. Implementations SHOULD use a
multilingual embedding model so that all languages share a single vector space.

### 11.3 The Embedding Index

The semantic layer is backed by an **embedding index** — a derived artifact (§10):
disposable, never source-of-truth, fully rebuildable from the vault.

- It MUST record the `embedding_model` and vector `dim` that produced it. Embeddings
  are not comparable across models; a model change REQUIRES a full reindex.
- A host MUST maintain exactly **one canonical embedding implementation**. Parallel
  or duplicate embedding systems (e.g. one in JSON format and another in JSONL)
  create consistency risks where a node is indexed in one but not the other.
- Retrieval SHOULD be **hybrid**: an exact/lexical pass (strong for slugs,
  identifiers, and code) fused with a dense semantic pass (strong for meaning and
  cross-lingual matches).

### 11.4 Provenance

So that outcomes can be attributed to their causes, append-type records (conversation
turns, run steps) SHOULD capture **provenance**: the set of primitives that produced
the record — e.g. the assistant, model, skills, and memory nodes in play. Provenance
is what lets a quality signal on an outcome propagate back to the primitives
responsible for it.

### 11.5 The `feedback` Block

Any document primitive MAY carry an OPTIONAL `feedback` frontmatter block — a
derived, language-neutral rollup of feedback signal:

```yaml
feedback:
  score: 0.82                      # 0..1, normalized
  positive: 14
  negative: 3
  samples: 17
  last_feedback: 2026-05-16T09:00:00Z
```

- Raw feedback MUST be recorded as `type: event` entries in the append-only event
  log (§8) — never written as raw events directly into a document's frontmatter.
- The `feedback` block is a **rollup** of those events, recomputed periodically — the
  same derived-cache pattern as `confidence`. It lives in the canonical file but is a
  deliberately-lagged projection of the log.
- The block MUST be language-neutral structured signal (scores, counts, polarity),
  never prose. Free-text feedback lives in the event payload and the embedding index.

### 11.6 Feedback as an Enhancement Layer

A host MAY use feedback to adjust `confidence`, routing weight, and to trigger
investigation of low-scored outcomes. Feedback is strictly an **enhancement** layer:
a host MUST remain fully functional with feedback collection disabled, and the
semantic layer MUST degrade gracefully to its other signals (access frequency, decay,
embedding similarity).

### 11.7 The `language_convention` Primitive

Because the control vocabulary is symbolic and never translated (§11.1), a workspace
that wishes to *present* itself in a given human language does so with data, not by
translating keys. The `language_convention` primitive (a `structural`, extension-owned
type — festech ships it) records a workspace's presentation conventions: its default
language/locale, formality, date and currency formatting, and terminology preferences.

It is `structural` and therefore travels in `template`/`sale` bundles (§5.5): a sold
business carries its voice and locale conventions, but never the operator's private
content. A host applies a `language_convention` as a **presentation overlay** at the
semantic/rendering layer; it MUST NOT alter the deterministic layer's symbolic keys or
enumerated values.

---

## 12. Conformance

Conformance is defined by a shared set of **fixtures** — canonical
request/response pairs for the Operation Contract. A host is conformant if, for
every fixture, it produces the expected response and status code.

Fixtures are distributed as a JSON document carrying:

- `operation_types` — the envelope-type schemas.
- `idempotency` — TTL and replay behavior.
- `validation_rules` — envelope and content rules.
- `fixtures[]` — each with a `request`, an `expected_response`, and an
  OPTIONAL `expected_http_status`.
- `error_codes` — the canonical code table.

The conformance fixture set is the shared test contract between all SSSS
implementations. A host MUST NOT claim SSSS conformance without passing the current
fixture set.

---

## 13. Naming Conventions

| Thing | Convention | Example |
|-------|-----------|---------|
| Memory / task slug | `kebab-case`, unique, matches filename | `prefer-atomic-writes` |
| Memory category | lowercase, matches directory | `patterns` |
| Skill name | `kebab-case`, matches directory | `deploy` |
| Canonical filename | `UPPERCASE.md` | `ASSISTANT.md` |
| VFS path | relative, no leading `/`, `/`-separated | `assistants/bot/ASSISTANT.md` |
| Conflict ID | `conflict-YYYY-MM-DD-NNN` | `conflict-2026-05-16-001` |
| Idempotency key | UUID v4, min 8 chars | `11111111-1111-...` |
| Timestamp | ISO 8601, `Z` suffix (UTC) | `2026-05-16T14:03:00Z` |

Slugs and names MAY contain non-ASCII Unicode letters so that non-Latin scripts are
first-class; they remain lowercase and hyphen-separated. A host MAY instead use an
opaque ID as the slug and keep the human-readable label in `title` / `name`.

---

## 14. Spec Versioning

This document is versioned independently of any host and of the conformance
fixture set.

- The spec version is stated in the document header (currently **v0.4 — Draft**).
- Breaking changes to the file format, the type registry, or the Operation
  Contract increment the spec version.
- Until **v1.0**, any version MAY introduce breaking changes.
- A host SHOULD declare which spec version it targets.

---

## 15. Schema Evolution

SSSS is **self-describing and self-mutable**. The type registry (§5), the field
schemas, and the contract rules are themselves SSSS-governed data — not a frozen
external artifact. The protocol can evolve. But evolution is **governed**, never
ad-hoc, so the deterministic layer (§11.1) stays exact at every moment.

### 15.1 Plain-Language Proposals

A change to SSSS is proposed in **plain natural language**, in any language — e.g.
*"add an optional `priority` field to the task primitive."* A proposal is an ordinary
SSSS work item (a `task`); authoring one does NOT require writing formal schema
syntax by hand.

The host interprets the proposal **semantically** (§11), so a proposal written in any
language is understood identically. The plain-language text is the *authoring
interface* — it is not itself the schema.

### 15.2 The Governed Path

A proposal becomes part of SSSS only through a fixed pipeline:

1. **Interpret** — the plain-language proposal is resolved into a formal schema delta.
2. **Validate** — the delta is checked against the current spec for consistency
   (no contradiction; no existing REQUIRED field removed without a migration).
3. **Review** — acceptance is gated by human/admin approval and/or eval gates.
4. **Version** — on acceptance the spec version (§14) is incremented.
5. **Migrate** — a migration is recorded so existing vault data conforms to the new
   version.

### 15.3 Mutability Without Fuzziness

At any instant the *active* schema is a single, fixed, exact, versioned artifact —
validation never becomes fuzzy. Mutability happens **between** versions, through the
gate of §15.2. SSSS is therefore a *sequence of exact schemas*, not a fluid one. The
plain-language interface lowers the authoring barrier; the governed path preserves
the determinism the contract layer depends on.

---

## 16. The `.ucw` Bundle Format

A **bundle** is a single transportable file that packages a portion of a vault — its
files plus a manifest describing what they are and what they need to run. A bundle is
how an SSSS business or template is **backed up, shared, sold, and re-provisioned**. The
canonical container is `package.ucw.json` (a "universal containerized workspace"); a host
MAY additionally wrap it in a `.ucw` archive (the JSON plus any binary branding assets),
but the JSON document is the normative artifact and is self-contained.

A bundle is produced by an **export** (§17) under one of the export profiles of §5.5
(`backup | template | sale`). The profile a bundle was built under is recorded in its
manifest and governs which portability classes (§5.5) its files may contain. A conformant
exporter MUST NOT emit a `tenant_private` file into a `template` or `sale` bundle.

### 16.1 Structure

A bundle is a JSON object with three top-level members:

```jsonc
{
  "manifest": { /* §16.2 — what this bundle is and needs */ },
  "branding": { /* OPTIONAL — binary assets, base64 (logo, favicon, colors, fonts) */ },
  "files":    [ /* §16.4 — the SSSS files, in deterministic path order */ ]
}
```

`files` MUST be sorted by `path` (byte order) so that two exports of the same vault state
are identical and content-hashable (§16.3, `provenance.content_hash`).

### 16.2 The Manifest

The manifest is the bundle's contract. It declares the bundle's identity, the SSSS version
and extensions a host needs to consume it, the export profile, an inventory of what is
inside, the resources it must bind at provision time, and provenance.

| Field | Required | Meaning |
|-------|----------|---------|
| `name` | yes | Human name of the bundle. |
| `description` | yes | One-line summary. |
| `version` | yes | The bundle's own semver, independent of the spec. |
| `exported_at` | yes | ISO-8601 timestamp of export. |
| `ssss_core_version` | yes | The `registry/core.json` `spec_version` the bundle targets (e.g. `"0.3"`). A host MUST refuse a bundle whose core version it does not support. |
| `required_extensions` | yes | Array of extension registry ids the files rely on (e.g. `["festech"]`). Empty array if the bundle uses only core primitives. A host MUST refuse a bundle naming an extension it has not loaded. |
| `export_profile` | yes | `backup` \| `template` \| `sale` — the §5.5 profile this bundle was built under. Determines the allowed portability classes. |
| `primitive_inventory` | yes | Map of primitive `type` → count, over every file in the bundle (replaces ultrachat's hard-coded `categories`; it is registry-driven, so extension types appear automatically). |
| `provisioning` | yes | Array of provisioning steps (§17.2) — the ordered, declarative plan for binding this bundle into a live workspace. Empty for a pure `backup` that is restored in place. |
| `parameters` | no | Array of parameter definitions (§16.5) the importer must resolve (e.g. business name, domain). |
| `source_workspace_id` | no | Origin workspace; OMITTED or nulled in `template`/`sale` profiles (it is operator-identifying). |
| `file_count` | yes | Length of `files`; a cheap integrity check. |
| `provenance` | yes | `{ content_hash, exporter, signature? }` (§16.3). |

`primitive_inventory` supersedes ultrachat's fixed `categories` object and `provisioning`
supersedes its `capabilities` booleans: both are now open and registry-driven rather than a
closed enum, so a bundle full of `festech` extension primitives inventories and provisions
them without a spec change.

### 16.3 Provenance & Integrity

`provenance` makes a bundle verifiable and attributable:

- `content_hash` — a hash (SHA-256, hex, prefixed `sha256:`) over the canonical
  serialization of `files` (path-sorted, §16.1). An importer MUST recompute it and reject
  a bundle whose files do not match. This is what makes a bundle tamper-evident and what a
  marketplace lists against.
- `exporter` — an identifier for the tool/host that produced the bundle (`"@ssss/cli@0.3.0"`).
- `signature` — OPTIONAL detached signature over `content_hash` for a sold bundle, so a
  buyer can verify authorship. Unsigned bundles are valid; signing is a marketplace concern.

### 16.4 Files

Each entry of `files` is `{ path, content }`, where `content` is the full SSSS file text
(frontmatter + body, §4). A host MAY also carry a parsed `frontmatter` object for
convenience, but `content` is normative — on import the host re-parses `content`, so a
divergent cached `frontmatter` is ignored. Every file's resolved portability class (§5.5,
honoring `x_portability`) MUST be permitted by `export_profile`.

### 16.5 Parameters

`parameters` are the values an importer must supply to turn a template into a running
instance — the difference between "a festival in a box" and "*this* festival." The schema is
adopted verbatim from ultrachat's `WorkspaceTemplateVariableDefinition`:

| Field | Meaning |
|-------|---------|
| `key` | Stable identifier, referenced by provisioning steps and link rewriting. |
| `label` | Human prompt. |
| `type` | Value type (`string`, `boolean`, `surfaces`, …). |
| `scope` | Where the value applies (`workspace`, `automation`, `data`, …). |
| `source` | Who supplies it: `user` \| `llm` \| `graph` \| `system`. |
| `required` | Whether provisioning may proceed without it. |
| `defaultValue`, `options`, `dependsOn` | Optional default, enumerated choices, and dependency keys. |

A `sale`/`template` bundle declares its `resource_bound` requirements (§5.5) as `parameters`
of `source: user` or `source: system` — e.g. the phone number, domain, and mailbox a buyer
must bind. This is how the standard guarantees a sold business says exactly what real-world
resources it needs without shipping the seller's own.

---

## 17. The Provisioning Contract

Export, provision, and import are the three verbs that move a bundle (§16) between vaults.
They are specified to be **deterministic** and **idempotent** so that selling, cloning, and
restoring an SSSS business are reliable operations rather than bespoke migrations.

### 17.1 The Three Verbs

- **export(vault, profile) → bundle** — Walk the vault, filter by the §5.5 portability rules
  for `profile`, sort files by path, compute `provenance.content_hash`, and emit a §16
  bundle. Export is **pure**: the same vault state and profile yield a byte-identical bundle.
- **provision(bundle, parameters, target) → plan** — Resolve `parameters` (§16.5), bind the
  bundle's `resource_bound` requirements to real resources in `target`, and produce an
  ordered, replayable plan of Operation Contract envelopes (§6) plus resource bindings. A
  `dry_run` provision (mirroring §6 `dry_run`) validates and plans without committing.
- **import(plan, target)** — Replay the plan's envelopes through the target's engine (§6.3).
  Because each envelope carries an `idempotency_key`, a re-run is a safe no-op: import is
  idempotent.

### 17.2 Provisioning Steps & Binding Vocabulary

A manifest's `provisioning` array is an ordered list of steps. The step schema and its
controlled vocabularies are adopted from ultrachat's `WorkspaceProvisioningStep` and
`WorkspaceGraphEdge`:

A **step** is `{ id, label, system, mode, required, notes? }`:

- `system` — the subsystem the step acts on: `workspace | branding | email | phone |
  domains | accounts | deployments | marketplace | tabs | automation`.
- `mode` — the canonical **binding verb**: `existing` (bind to a resource the target
  already has), `provision` (allocate a new real resource — a domain, a phone number),
  `install` (add a dependency bundle), `generate` (synthesize content), `configure` (set
  values). `mode` is how a bundle distinguishes "needs a *new* phone number" from "route to
  the operator's existing line."

Dependency and resource relationships between primitives are expressed with the canonical
**edge relations**: `uses_brand | owns_domain | routes_calls_to | deploys_to | has_surface
| contains_page | installs_pack | authenticates_account | runs_workflow`. The
`resource_bound` primitives of §5.5 each declare which relation binds them (festech's
`domain` → `owns_domain`, `phone_number` → `routes_calls_to`, `integration_connection` →
`connects_to`), so an importer knows exactly what real-world binding each requires.

### 17.3 Determinism, Id-Remap & Link Integrity

When a bundle is provisioned into a target vault, identifiers (slugs, workspace ids,
cross-file links) are **remapped** so the imported business is a fresh, self-consistent
instance rather than a clone aliasing the seller's ids. Remapping MUST preserve link
integrity: every internal `[[link]]` / relative reference that resolved in the source bundle
MUST resolve to the remapped target after import. This is the same rewrite engine the
semantic layer's autolink (§11) uses, run with a bundle-relative id map. An importer that
cannot resolve a link MUST fail the provision rather than emit a dangling reference.

### 17.4 Composition & Upgrade

- **Composition** — a bundle MAY depend on other bundles. A dependency carries an
  `installMode` of `optional | recommended | required` (adopted from ultrachat's
  `WorkspaceMarketplaceRecommendation`). `provision` installs `required` dependencies before
  the bundle itself; `optional`/`recommended` are surfaced to the operator.
- **Upgrade** — moving an installed bundle from `v2` to a `v1`-conformant shape (or any
  version step) is performed through a `migration` primitive (§5) plus **structural-only**
  `patch` envelopes (§6.2). An upgrade MUST NOT touch `tenant_private` data: it rewrites the
  structural model, never the operator's private records. This is what lets a sold business
  receive standard updates without the vendor reaching into customer data.

---

## Appendix A — Reserved Frontmatter Keys

The following frontmatter keys are reserved by this spec across all primitives and
MUST NOT be repurposed by hosts: `type`, `slug`, `schema_version`, `status`,
`feedback`, `confidence`.

Hosts adding their own frontmatter fields SHOULD prefix them `x_` to remain
forward-compatible with future spec revisions.

---

*SSSS is a portable standard. This specification is the ground truth; every SSSS
implementation is a conformant consumer of it. To learn how a specific product
implements SSSS, read that product's `SKILL.md`, not this file.*
