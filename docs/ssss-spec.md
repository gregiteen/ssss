# SSSS — Structured Semantic Syntax System

**Specification v0.9**

> This is the canonical, vendor-neutral specification for SSSS. It is the ground
> truth on which all SSSS implementations are built. It is intended to be vendored
> byte-for-byte into any repository that implements SSSS.
>
> Status: **Stable for 0.9**. The format, type registry, and conformance contract
> are settled for this version; until v1.0 a later version MAY still introduce
> breaking changes.
>
> Revision: 2026-09-24. Editorial alignment with the 0.9 reference kernel
> (`@gregiteen/ssss-cli`). This revision documents behavior that already ships:
> the verified-principal model, the real stage order, the canonical event
> record, and symbolic error codes. It changes no wire format. Every example
> document in this file is validated by the conformance suite (§12).
>
> Implementation-specific detail (routes, services, storage backends, deployment)
> does **not** belong in this document — it belongs in each implementation's own
> `SKILL.md`. This file describes *what SSSS is*, never *how one product wires it up*.

---

## 1. Abstract

SSSS — the Structured Semantic Syntax System — is a **database-free, Markdown-first
schema and mutation contract for AI agent state**.

Every unit of agent-relevant state — a memory, a skill, a conversation, a workflow
run, an assistant definition, a runtime task — is a plain Markdown file with YAML
frontmatter. There is no relational database of record, no binary format, and no
proprietary container. A relational store MAY exist, but only as a *disposable
projection* rebuildable from the Markdown.

SSSS additionally defines the **Operation Contract**: a single, validated, idempotent
envelope through which all agent-generated mutations must flow. This makes
AI-generated state changes deterministic, replayable, conflict-safe, and auditable.

Its semantic runtime turns the same canonical files into a deterministic searchable
graph, while multilingual embedding and render adapters localize presentation without
mutating symbolic control fields or private operational data.

Any tool, IDE, agent framework, daemon, or CLI that can read Markdown can
interoperate with an SSSS vault. The only thing that distinguishes a memory engine,
a chat runtime, and a workflow orchestrator is *which primitive types they read and
write* — the underlying file format and mutation contract are identical.

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
| **Envelope** | A JSON command submitted to the Operation Contract: `operation`, `patch`, `event`, or `delete` (§6). |
| **Kernel** | The component that runs the §6.3 pipeline. It owns stage order and semantics; storage is delegated to adapters. |
| **Adapter** | A host-supplied implementation of one storage or policy contract: VFS, event store, idempotency store, lease store, authorizer, projections, or resource coordinator (§6.7). |
| **Verified principal** | The authenticated identity a host attaches to an envelope *outside* the envelope body (§6.6). Never taken from client-supplied fields. |
| **Capability** | A permission string of the form `<scope>:<action>` held by a principal and required by a primitive (§6.6). |
| **Qualified type** | A primitive identity prefixed by its registry namespace: `ssss:assistant` for core, `<ext>:<type>` for an extension (§5.6). |
| **Portability class** | `structural`, `tenant_private`, or `resource_bound`: whether a document may leave the workspace (§5.5). |
| **Bundle** | A `.ucw` package of vault files plus a manifest (§16). |
| **Commit point** | The moment a mutation becomes durable: the canonical event is appended to the event log (§6.3). |

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
| **Append-only history** | The event log is immutable, and so are the records in append-type documents. Neither is ever updated or deleted. |
| **Disposable indexes** | Derived indexes and projections are ephemeral caches, fully rebuildable from the vault. They may be deleted at any time. |
| **Git-versioned** | The vault is version-controlled. History is provenance. |
| **Portable** | A vault is interpretable by any Markdown-capable tool. No host is privileged. |

---

## 4. The SSSS File

### 4.1 Anatomy

A document primitive is a UTF-8 Markdown file with two regions:

```text
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
| `title` | string | Human-readable title of the document. |
| `description` | string | One-sentence summary of the document's purpose. |
| `timestamp` | string | ISO 8601 timestamp of last modification. |

For OKF-compatible discovery, SSSS document primitives SHOULD also include:

| Field | Type | Description |
|-------|------|-------------|
| `resource` | string | Canonical URI for the underlying asset, when the primitive describes one. |
| `tags` | array | Array of string tags for categorization and routing. |
| `aliases` | array | Array of alternative names for this concept, used for wiki autolinking. |

For stable semantic identity and graph projection, documents SHOULD also include:

| Field | Type | Description |
|-------|------|-------------|
| `semantic_id` | string | Stable concept identity that survives file moves and localized presentation. |
| `relations` | array | Explicit semantic edges to other vault-relative document paths or semantic ids. |
| `language` | string | BCP-47 tag of the authored natural-language surface, when known (e.g. `ja`, `es-MX`). |

`resource`, `tags`, and `aliases` serve both OKF discovery and the semantic layer.
These fields are recommendations, not new universal requirements. Earlier drafts
called the last field `locale`; a host SHOULD read `locale` as a fallback when
`language` is absent, and MUST write `language`.

Every primitive type defines its own additional REQUIRED and OPTIONAL fields
(§5.4). The four universal fields above are REQUIRED **in addition to** each
type's own list. To maintain forward compatibility and allow agents scratchpad
space, hosts MUST NOT reject documents containing unknown frontmatter keys.
Unknown fields MUST be preserved.

Directory index files (`index.md`, §4.3) are the one exemption. They carry no
frontmatter and are not validated as primitives.

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
| `ROLE.md` | `security_role` (canonically `roles/<role>/ROLE.md`) |

Free-standing primitives (e.g. `memory`, `task`) instead use a `kebab-case` slug
filename matching their `slug` field. Governed `primitive` definitions live at
`primitives/<namespace>/<id>.md`. The frontmatter `type` is always
authoritative; the filename is a convention, not a substitute for validation.

### 4.5 The Frontmatter Subset

Frontmatter is YAML, but a conformant host is only required to accept the subset
below. A document that stays inside it round-trips identically through every
conformant parser. The reference parser is dependency-free and implements
exactly this subset.

- **Scalars**: strings (bare, `"double"`, or `'single'` quoted), integers,
  decimals, `true`/`false`, and `null`/`~`. ISO 8601 timestamps are read as
  **strings**, not native dates, so they round-trip byte-for-byte.
- **Inline arrays**: `[a, b, "c d"]`.
- **Block arrays**: `- item` lines.
- **Nested maps**: indented `key: value` blocks.
- **Arrays of maps**: `- key: value` entries whose further keys are indented
  under the first. A map entry may itself hold an inline array.
- **Folded strings**: `>` and `>-` block scalars.

Anchors, aliases, tags, multi-document streams, and flow maps (`{a: 1}`) are
outside the subset. A host MAY accept them but MUST NOT require them, and
authors SHOULD NOT use them in documents that leave the host.

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
| `security_role` | governance | structural | A security role definition for role-based access control (RBAC). |
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
| `primitive` | meta | structural | A governed, versioned definition for a namespaced SSSS primitive. |

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
  entirely (`memory`, `skill`, `rule`, `security_role`, `task`, `assistant`,
  `workflow`, `model`, `conflict`, `page`, `migration`, `release`, `primitive`).
- **Append-type** — the file is an ordered, append-only log; writes add records to
  the body and MUST NOT rewrite prior records (`conversation`, `run`).

Append-type documents MUST be mutated only by appending. A host MUST reject an
operation that would rewrite or remove existing records of an append-type document.

### 5.4 Per-Type Schemas

Each schema lists the type's REQUIRED fields. These are in addition to the
universal fields of §4.2 (`type`, `title`, `description`, `timestamp`), which
every example carries. All other fields are OPTIONAL. Examples are minimal, and
each one passes the reference validator (§12).

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
description: "Write to a temporary file, then rename it over the target."
timestamp: 2026-05-16T14:00:00Z
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
title: "Deploy"
description: >-
  Deploy services with zero downtime. Use when the user mentions deploy,
  release, ship, or production push.
timestamp: 2026-05-16T14:00:00Z
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

Runtime-created tasks SHOULD additionally carry `workflow_path`, `trigger_id`,
`trigger_type`, `trigger_event_id`, `scheduled_for`, and `dedupe_key`. These fields
make the task reconstructible from the workflow definition plus the trigger event
and prevent duplicate daemon ticks from creating duplicate work (§11.8).

```markdown
---
type: task
title: "Research the payments API"
description: "Research the payments API and write a reference skill."
timestamp: 2026-05-16T08:00:00Z
priority: 85
category: skill-engineering
status: pending
workflow_id: "research-skill"
trigger_id: "manual"
scheduled_for: 2026-05-16T08:00:00Z
dedupe_key: "runtime:abc123"
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
title: "Support Bot"
description: "Front-line customer support assistant."
timestamp: 2026-05-16T14:00:00Z
model: "example/large-model"
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

When present, `triggers[]` is the canonical schedule source. OS cron, hosted
schedulers, queues, and daemon timers are wake-up mechanisms only; they MUST NOT
become the record of what the workflow schedule means. A trigger entry SHOULD
include:

| Field | Description |
|-------|-------------|
| `type` | `manual`, `cron`, `interval`, `event`, `webhook`, `file_change`, or `condition`. |
| `id` / `trigger_id` | Stable trigger identity within the workflow. |
| `cron` / `interval` / `event_type` | Type-specific selector. |
| `timezone` | Required for wall-clock schedules; UTC is implied if omitted. |
| `misfire_policy` | `skip`, `run_once`, or `catch_up`; default `run_once`. |
| `concurrency` | `allow_parallel`, `skip_if_running`, `enqueue`, or `replace`; default `skip_if_running`. |

```markdown
---
type: workflow
name: "Daily Digest"
title: "Daily Digest"
description: "Sends a daily summary email."
timestamp: 2026-05-16T14:00:00Z
triggers:
  - type: cron
    id: daily-0800
    cron: "0 8 * * *"
    timezone: "America/Denver"
    misfire_policy: run_once
    concurrency: skip_if_running
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
title: "No external links in replies"
description: "Customer-facing replies must not contain outbound URLs."
timestamp: 2026-05-16T14:00:00Z
scope: support
---

Outbound links are stripped from any assistant reply on a support thread.
```

#### `security_role`

A named set of capabilities used for role-based access control (RBAC). It maps
a role name to the capabilities an agent or user holding that role is granted
within the workspace.

REQUIRED: `type`, `name`, `permissions` (array). OPTIONAL: `description`.

```markdown
---
type: security_role
name: "support-agent"
title: "Support agent"
description: "Can write assistants and events, nothing else."
timestamp: 2026-05-16T14:00:00Z
permissions:
  - "ssss:assistant:*"
  - "write:event"
---

Maintains support assistants and records support events.
```

`permissions` holds capability strings (§6.6). A capability names a scope and an
action; `*` in the action position grants every action on that scope, and `*:*`
grants everything. A `security_role` is one way for a host to derive a
principal's capabilities. The kernel only ever sees the resulting capability
list, never the role name.

#### `model`

The definition of an inference model.

REQUIRED: `type`, `model_id`, `provider`.

```markdown
---
type: model
title: "Example Large Model"
description: "A general-purpose long-context model."
timestamp: 2026-05-16T14:00:00Z
model_id: "example/large-model"
provider: example
display_name: "Example Large Model"
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
title: "Greeting"
description: "A two-turn support conversation."
timestamp: 2026-05-16T14:00:05Z
thread_id: "7f3a2b1c-5d6e-4f70-8a91-b2c3d4e5f607"
workspace_id: "ws-acme"
user_id: "user-42"
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
`task_id`, `task_path`, `step_count`, `started_at`.

`status` SHOULD be one of: `queued`, `claimed`, `running`, `waiting_for_human`,
`succeeded`, `failed`, `canceled`, `retrying`, `dead_letter`.

```markdown
---
type: run
title: "Daily Digest run 2026-05-16"
description: "Execution record for the 08:00 daily digest."
timestamp: 2026-05-16T08:00:01Z
run_id: "run-001"
workflow_id: "daily-digest"
task_path: "tasks/daily-digest/daily-0800-20260516T080000Z.md"
status: queued
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
title: "HTML vs plaintext email"
description: "A new memory contradicts an existing one about email format."
timestamp: 2026-05-16T18:30:00Z
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
title: "Leads Dashboard"
description: "A sandboxed dashboard of inbound leads."
timestamp: 2026-05-16T14:00:00Z
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
title: "Add vector_embedding field"
timestamp: 2026-05-16T14:00:00Z
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
title: "Release 3.1.0"
description: "Adds proposal and migration file types."
timestamp: 2026-05-16T12:00:00Z
release_id: "rel-3.1.0"
version: "3.1.0"
schema_version: 3
summary: "Added proposal and migration file types"
released_at: 2026-05-16T12:00:00Z
---
```

#### `primitive`

A governed definition for a namespaced primitive that can be authored in any human
language without changing the core registry. REQUIRED: `type`, `primitive_id`,
`namespace`, `version`, `name`, `mutation`, `portability`, `scopes`, and `fields`.
Stable primitive, field, enum, capability, and action identifiers are symbolic and
language-independent. Labels and descriptions are multilingual presentation data.

The definition is validated against a meta-schema on write:

| Field | Rule |
|-------|------|
| `primitive_id` | Qualified (`<namespace>:<id>`), prefix equal to `namespace`. A host MAY derive it from `namespace` + `name` so an author never types one. |
| `namespace` | Lowercase, `[a-z][a-z0-9_-]{0,63}`. |
| `version` | Positive integer. `revision`, if present, is a positive integer. |
| `mutation` | `replace` or `append` (§5.3). |
| `portability` | A §5.5 class. |
| `scopes` | Non-empty unique subset of `system`, `account`, `workspace`, `user`. |
| `fields[]` | Each has a unique symbolic `id`, a non-empty `name` in any language, and a `kind`: `string`, `text`, `number`, `integer`, `boolean`, `datetime`, `date`, `enum` (with unique `values`), `object`, `array`, `reference`, `secret_reference`, or `resource_reference`. |
| `capabilities` | Optional map of action → list of capability strings. |
| `aliases` | Optional list of unique safe identifiers that resolve to this primitive. |

```markdown
---
type: primitive
title: "Booking"
description: "A customer booking, authored in Japanese."
timestamp: 2026-05-16T14:00:00Z
primitive_id: "acme:booking"
namespace: acme
version: 1
name: "顧客予約"
language: ja
mutation: replace
portability: tenant_private
scopes: [workspace]
fields:
  - id: reservation_date
    name: "予約日"
    kind: datetime
    required: true
  - id: status
    name: "状態"
    kind: enum
    values: [pending, confirmed]
capabilities:
  create: ["acme.booking:create"]
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
MUST honor the **most restrictive** of (type default, instance override), ordered
`structural` < `resource_bound` < `tenant_private`. A file may make itself more private
than its type, never less. An unrecognized override value is ignored.

An **export profile** is simply a filter over portability classes:

- **`backup`** — all three classes. `tenant_private` MUST be encrypted at rest.
- **`template`** / **`sale`** — `structural` verbatim; `resource_bound` reduced to a
  requirement declaration; `tenant_private` **dropped entirely**.

A requirement declaration is produced mechanically. The type's registry entry MUST
declare `resource.binds`, the list of fields that hold the bound value. Each of
those fields is replaced with the literal string `REQUIREMENT`, and the file is
marked `x_portability: resource_bound`. An exporter MUST fail rather than emit a
`resource_bound` file whose type declares no `resource.binds`, because it cannot
know which fields to strip.

A host MUST reject a `template`/`sale` export that would emit a `tenant_private` primitive.
This single rule is what lets an operator sell a proven business model without ever
shipping a customer's data — the data is `tenant_private` by classification, so it
physically cannot enter a sale bundle.

### 5.6 Registries, Qualified Identities & Extensions

The type registry is data: `registry/core.json` defines the core primitives, and an
**extension registry** adds a namespace of its own. Every primitive has a
**qualified identity**: `ssss:<type>` for core types and `<registry>:<type>` for an
extension's. A document MAY declare either the bare or the qualified name in
`type`. Hosts resolve both, and canonical events always record the qualified one
(§8.2).

A registry entry declares the rules that validation (§9) enforces:

| Key | Effect |
|-----|--------|
| `required_fields` | Fields that MUST be present and non-empty. |
| `required_when` | `{ "<field>==<value>": [fields] }`: fields required only when the condition holds. |
| `enums` | Allowed values per field. Array values are checked element by element. |
| `patterns` | A Unicode regular expression each value of the field MUST match. |
| `immutable_fields` | Fields a `patch` MUST NOT change. |
| `references` | Fields holding vault paths, with `allowed_types`, `disallowed_types`, `allowed_portability`, `must_exist`, and an optional `hash_field` pinning the target's content hash. |
| `append_only` | `true` makes the type append-type (§5.3). |
| `portability` | The default class (§5.5). |
| `capabilities` | Per-action capability requirements (§6.6). |
| `lease_required` | `true` makes every write to the type require a lease (§7). |
| `resource.binds` | Fields stripped to a requirement declaration on sale export (§5.5). |

Composition rules:

- An extension MUST NOT redefine or shadow a core type, a sibling extension's type,
  or an existing alias. A collision is a load-time error, not a runtime preference.
- An extension MAY declare `requires: { "<extension>": "<semver range>" }`. A host
  MUST refuse to load an extension whose dependencies are missing or out of range.
- A host MAY pin a composed registry set with an **integrity lock**: a SHA-256 over
  the canonical composition. A lock that no longer matches is drift, and a host
  SHOULD refuse to start on it.
- Extension registry files MUST be regular files. A host MUST refuse symlinked
  registry files.

---

## 6. The Operation Contract

All agent-generated mutations to a vault MUST flow through the Operation Contract.
An agent MUST NOT write vault files directly.

### 6.1 The Envelope

An envelope is a JSON object:

```jsonc
{
  "type": "operation",             // "operation" | "patch" | "event" | "delete" (§6.2)
  "workspace_id": "ws-acme",       // the vault/workspace scope
  "idempotency_key": "b3c1…",      // §6.4
  "path": "assistants/bot/ASSISTANT.md", // vault-relative, no leading "/", no "." or ".." segments
  "content": "---\ntype: …",       // operation: full document; event: JSON payload string
  "patches": { },                  // patch only
  "primitive_type": "assistant",   // OPTIONAL — asserts the target's type
  "operation_id": "uuid",          // OPTIONAL — client-chosen; generated if absent
  "lease_id": "uuid",              // OPTIONAL — §7
  "dry_run": false,                // OPTIONAL — validate and authorize without committing
  "intent": "human description"    // OPTIONAL — audit annotation, not interpreted
}
```

The envelope carries **no identity**. Who is acting is supplied by the host as a
verified principal, next to the envelope and never inside it (§6.6). A kernel
MUST ignore any identity-bearing field a client places in the envelope, including
the pre-0.9 `actor` object.

A `path` MUST be rejected with `invalid_request` if it is empty, absolute, contains
a backslash or NUL, or has an empty, `.`, or `..` segment. A host MUST also refuse
to follow a symbolic link out of the vault.

### 6.2 Envelope Types

| `type` | Semantics | Required fields beyond `type`, `workspace_id`, `idempotency_key`, `path` |
|--------|-----------|------------|
| `operation` | Create a document, or fully replace an existing one. | `content` (string) |
| `patch` | Merge into an existing document's frontmatter and/or body. | `patches` (object) |
| `event` | Append an immutable entry to the event log (§8). Never touches a document. | none; `content`, if present, MUST be a JSON string |
| `delete` | Remove a replace-type document. | none |

**`operation`** — `content` is the complete document. An `operation` MUST NOT
change the `type` of an existing document; changing type is a migration
(§5.4 `migration`). Writing a directory `index.md` (§4.3) is permitted and is
not validated as a primitive.

**`patch`** — keys of `patches` are merged shallowly into the frontmatter: a
supplied key replaces that key's whole value, and absent keys are untouched. The
reserved key `__body__` replaces the Markdown body of a replace-type document, or
is appended to the body of an append-type document (§5.3). A `patch` MUST NOT
change `type` or any of the type's `immutable_fields`. The merged document is
validated as a whole before commit.

**`event`** — the parsed `content` becomes the event's `payload` (§8.2). The target
`path` is recorded as the event's `subject` and need not exist.

**`delete`** — the host removes the document and records the deletion as an event,
so history is never lost. A `delete` targeting an append-type document MUST be
rejected with `validation_failed`. A `delete` of a path that does not exist MUST be
rejected with `not_found`, unless it is an idempotent replay of an earlier delete
with the same key, in which case the original result is returned (§6.4). `delete`
is the only envelope that removes vault state. Export and provision (§16, §17)
never delete.

### 6.3 The Processing Pipeline

A host MUST process every envelope through these stages, in this order. A failure
at any stage before the commit point aborts the envelope with nothing committed.
Kernels MUST NOT reorder or skip stages. Adapters (§6.7) implement mechanics only.

| # | Stage | On failure |
|---|-------|------------|
| 1 | **Envelope & identity** — known `type`, required fields present and well-typed (§6.2); a principal with an `id` and `kind` is attached. Nothing is read before this passes, so an anonymous caller learns nothing about the vault. | `invalid_request`, `unauthorized` |
| 2 | **Idempotency** — look up (`workspace_id`, `idempotency_key`). Same request hash: return the stored response with `replay: true` and stop. Different hash: stop (§6.4). | `idempotency_conflict` |
| 3 | **Read current state** — load the target, if any, and its version. An unsafe path fails here. | `invalid_request`, or `internal_error` for unreadable stored state |
| 4 | **Content validation** — resolve the primitive and validate the resulting document (§9). Enforce type immutability, `immutable_fields`, patch/delete target existence, and append-only rules. | `not_found`, `validation_failed` |
| 5 | **Authorization** — the verified principal must be complete (§6.6), scoped to `workspace_id`, and hold every capability the primitive and action require. | `unauthorized`, `forbidden` |
| 6 | **Lease** — if the primitive is `lease_required` or the host requires a lease for this path, verify it (§7). | `lease_conflict` |
| 7 | **Resource prepare** — if the host coordinates an external resource (a domain, a phone number), reserve it. | `internal_error` |
| 8 | **Dry-run exit** — if `dry_run`, release anything prepared in stage 7 and return success with `committed_at: null`. | — |
| 9 | **Commit** — write the document with a compare-and-swap on the version read in stage 3 (create-if-absent for a new document), or remove it for `delete`. `event` envelopes write nothing here. | `version_conflict`, `internal_error` |
| 10 | **Event append — the commit point.** Append the canonical event (§8.2). If the append fails, undo stage 9 and release stage 7. | `internal_error` |
| 11 | **Resource finalize** — complete the external effect. A failure here MUST NOT undo the commit. The host reconciles and the response carries a warning. | warning only |
| 12 | **Projections** — dispatch the event to projections (§10). A failure is a warning, never a rollback. | warning only |
| 13 | **Record idempotency** — store the response under the key (§6.4). | warning only |

**The commit point.** A mutation is committed exactly when its canonical event is
durably appended. Before that, every failure leaves no trace in the vault. After
it, nothing may undo the mutation, because the append-only log (§8) already says it
happened. Work after the commit point is compensated forward, never rolled back.

**Resource lifecycle.** If a host coordinates external resources, every successful
`prepare` MUST be followed by exactly one `finalize` or `reconcile`. `reconcile`
receives the phase it runs in (`dry_run`, `commit`, or `finalize`), so the host
can tell a released reservation from a compensation after a committed intent.

**Concurrency.** Two envelopes racing on one path are serialized by the stage-9
compare-and-swap. The loser either finds a winner with the same key and returns
that winner's result as a replay, or fails with `version_conflict`. Two `event`
envelopes with the same key are serialized by the event store's uniqueness on
`event_id` (§8.1).

### 6.4 Idempotency

Every envelope carries an `idempotency_key`, scoped to its `workspace_id`.

- The **request hash** is SHA-256 over the canonical JSON (keys sorted
  recursively, no insignificant whitespace) of `type`, `workspace_id`,
  `idempotency_key`, `path`, `primitive_type`, `content`, `patches`, and the
  verified principal's `id`. `dry_run`, `lease_id`, `operation_id`, and `intent`
  are excluded, so retrying with a fresh lease is still the same request.
- Only **successful commits** are recorded. A failed or dry-run envelope records
  nothing, so it may be retried under the same key after the cause is fixed.
- A recorded key replays: the same request hash returns the original response with
  `replay: true` and changes nothing. A different request hash under the same key
  fails with `idempotency_conflict`.
- Because the principal is part of the hash, a key replayed by a *different*
  principal is a conflict, never a disclosure of another principal's result.
- A host MUST retain records for at least 24 hours and MAY retain them
  indefinitely. The reference stores never expire.

Keys are opaque strings. Use a random UUID for ad-hoc requests. Use a
deterministic derivation where retries must converge, as with runtime-created work
(§11.8) and bundle import (§17).

### 6.5 The Response & Error Codes

```jsonc
{
  "success": true,
  "type": "operation",
  "operation_id": "uuid",
  "path": "assistants/bot/ASSISTANT.md",
  "committed_at": "2026-05-16T14:00:00Z", // null for dry_run and failures
  "dry_run": false,
  "event_id": "uuid",                     // the canonical event (§8.2); absent unless committed
  "replay": true,                         // present only on an idempotent replay
  "validation": {
    "valid": true,
    "type": "ssss:assistant",             // resolved qualified type (§5.6)
    "errors": [],
    "warnings": []                        // e.g. a projection or finalize failure
  }
}
```

A failed response has `success: false`, `committed_at: null`, `validation.valid:
false`, the `repair` block of §9, and an `error` object:

```jsonc
{ "success": false, "error": { "code": "validation_failed", "message": "name: Missing required field 'name'." }, "…": "…" }
```

`error.code` is exactly one of the symbolic codes below. Clients MUST branch on
`error.code`, never on message text. A host MAY use any transport. If it uses HTTP,
it MUST use these statuses, `201` for a commit, and `200` for a replay or dry run:

| Code | HTTP | Meaning |
|------|------|---------|
| `invalid_request` | 400 | Malformed envelope, non-JSON event content, or an unsafe path. |
| `unauthorized` | 401 | No valid verified principal reached the kernel. |
| `forbidden` | 403 | The principal is not scoped to the workspace or lacks a required capability. |
| `not_found` | 404 | The `patch` or `delete` target does not exist. |
| `lease_conflict` | 409 | A required lease is missing, mismatched, or expired. |
| `version_conflict` | 409 | The document changed between read and commit, and no same-key winner exists. |
| `idempotency_conflict` | 409 | The key was already used for a different request. |
| `validation_failed` | 422 | The document fails §9, or the envelope would change a type, an immutable field, or an append-only document. |
| `internal_error` | 500 | Unreadable stored state, a failed resource prepare, or a failed commit. Nothing was committed. |

### 6.6 Identity & Authorization

Authorization acts on a **verified principal** that the host attaches *outside* the
envelope, after authenticating the caller:

```jsonc
{
  "id": "user-42",                      // stable, recorded on every event
  "kind": "human",                      // "human" | "agent" | "service" | "system"
  "workspaceIds": ["ws-acme"],          // workspaces this principal may act in
  "capabilities": ["ssss:assistant:*"], // §6.6 capability strings
  "authentication": { "provider": "oidc", "assurance": "verified" }
}
```

- A host that exposes the Operation Contract to untrusted callers MUST derive the
  principal from its own authentication, never from the request body. This is why
  the envelope carries no identity (§6.1).
- A missing or malformed principal MUST be denied as `unauthorized`. There is no
  default principal and no anonymous write.
- A non-`system` principal MUST list the envelope's `workspace_id` in
  `workspaceIds`.
- The required capabilities are the primitive's registry `capabilities[<action>]`,
  or `<qualified_type>:<action>` if none are declared. The action is one of
  `create`, `replace`, `patch`, `append`, `event`, or `delete`. It is derived from
  the envelope and the target's existence, never supplied by the client. `event`
  envelopes require `write:event`.
- A granted capability covers a required one if it is equal, if it is `*:*`, or if
  it ends in `:*` and the required capability starts with everything before that
  `*`. So `ssss:*` covers every core primitive and `ssss:assistant:*` covers every
  action on assistants.
- A `system` principal bypasses capability checks. It exists for trusted internal
  callers such as import (§17). A host MUST NOT grant `system` to anything a remote
  caller controls.
- A host MAY layer **policy floors** (extra capabilities per primitive and action),
  **step-up** (a minimum `authentication.assurance`), and **human confirmation**
  (a `human` principal plus an explicit confirmation) on top of this. These only
  ever add requirements.

**Pre-0.9 role compatibility.** Hosts that still accept the pre-0.9 envelope field
`actor.role` MUST convert it to a principal before stage 5. `system` becomes a
`system` principal, `admin` receives `*:*`, and any other role receives the
`permissions` of its `security_role` document at `roles/<role>/ROLE.md`, with
`write:<type>` and `*:<type>` expanded to `<qualified_type>:*`, and `write:*`
expanded to `*:*`. A missing role still MUST be denied, never promoted.

### 6.7 Adapter Contracts

A kernel owns the stages above. A host supplies the mechanics through adapters,
each with a shared contract test in the conformance suite (§12):

| Adapter | Contract |
|---------|----------|
| **VFS** | `read(path) → {bytes, version, hash} \| null`; `writeAtomic(path, bytes, {version \| ifAbsent})` and `remove(path, {version})`, both compare-and-swap, failing with a version conflict and never a partial write. Rejects unsafe paths and symlink traversal. |
| **Event store** | `append(event)` durably and in order, rejecting a duplicate `event_id` across every writer; `replay({cursor, workspaceId})` in append order. |
| **Idempotency store** | `get(workspace, key)`; `put(workspace, key, record)`, which rejects a second `put` for the same key across every writer. |
| **Lease store** | `acquire`, `verify`, `renew`, `release` per §7, with at most one live lease per target across every writer. |
| **Authorizer** | `authorize({principal, workspaceId, definition, action}) → {allowed, reason}`, per §6.6. Fails closed. |
| **Projection coordinator** | `dispatch(event)`, `replay(id, {rebuild})`, `detectDrift(id, hash)` per §10. |
| **Resource coordinator** | Optional `prepare`, `finalize`, `reconcile`, per the §6.3 resource lifecycle. |

"Across every writer" means across threads, processes, and hosts sharing the same
storage, not just within one instance.

---

## 7. Leases — Concurrency Control

A **lease** is a time-bound write claim on one `(workspace_id, target)` pair. It
lets an agent do long work (such as a workflow run, §11.8) without another agent
writing the same path underneath it.

A lease record carries `lease_id`, `workspace_id`, `target`, `principal_id`,
`operation_id`, `issued_at`, and `expires_at`.

- **acquire** — grants a lease if no live lease exists on the target; otherwise it
  fails. At most one live lease MAY exist per target, across every writer.
- **verify** — succeeds only if a live lease exists and its `lease_id`,
  `principal_id`, and `operation_id` all match the caller. A lease is bound to the
  principal and the unit of work that took it. Presenting someone else's
  `lease_id` is not enough. An envelope that writes under a lease therefore
  carries both `lease_id` and the `operation_id` the lease was acquired with.
- **renew** — extends `expires_at` for the verified holder.
- **release** — deletes the lease for the verified holder.
- An expired lease is treated as absent. A host SHOULD reclaim expired leases.

Whether a write *requires* a lease is decided by the primitive's `lease_required`
flag or by host policy. Unleased writes are otherwise protected by the stage-9
compare-and-swap (§6.3). Leases are coordination, not security. Authorization
(§6.6) is the security boundary.

---

## 8. The Event Log

The event log is an **append-only, immutable** record. It is two things at once: a
flat physical *log*, and a relational *event graph* layered on top of it.

### 8.1 The Log

- Every committed envelope appends exactly one canonical event (§6.3 stage 10). The
  event *is* the audit record. There is no separate audit write.
- An entry, once written, MUST NOT be updated or deleted.
- `event_id` is unique within the log, across every writer. For `event` envelopes,
  a kernel SHOULD derive `event_id` deterministically from (`workspace_id`,
  `idempotency_key`). The reference uses UUIDv5 over their JSON array. That way,
  concurrent duplicates of one event collide on the uniqueness check instead of
  both landing.
- Order is append order within a log.
- The event log is the canonical history of *what happened*; the vault is the
  canonical state of *what is true now*. Both are source-of-truth; projections are
  not.

### 8.2 The Event Record

An event is a typed record, **not** a document primitive. There is no `EVENT.md`;
events exist only in the log.

| Field | Description |
|-------|-------------|
| `event_id` | Unique identity (§8.1). |
| `event_type` | The kind of event. Kernel mutations use `ssss.mutation`. |
| `schema_version` | Version of this record shape; currently `1`. |
| `timestamp` | ISO 8601 commit time. |
| `workspace_id` | The workspace. |
| `primitive_id`, `primitive_version` | The qualified type (§5.6) and its version. `ssss:event` for `event` envelopes. |
| `action` | `create`, `replace`, `patch`, `append`, `event`, or `delete`. |
| `subject` | The vault path the event is about. |
| `principal` | The verified principal (§6.6) that caused it. |
| `operation_id`, `idempotency_key`, `request_hash` | Ties the event to its envelope (§6.4). |
| `correlation_id` | Groups every event of one logical flow ("saga"). Defaults to `operation_id`. |
| `causation_id` | The `event_id` that directly caused this one, or `null`. |
| `before_hash`, `after_hash` | Content hashes of the target before and after, so the log alone can detect vault drift. |
| `changed_fields` | For `patch`, the sorted keys that were patched. |
| `resource_status` | `prepared` if a resource coordinator took part (§6.3), else `null`. |
| `payload` | The event-type-specific body (for `event` envelopes, the parsed `content`). |

### 8.3 The Event Graph

Events relate to **non-adjacent** events: a feedback event refers to the completion
it rated, an investigation to the feedback that triggered it, a fix to the
investigation. These references form a causal **graph** over the flat log.

The graph is preserved without violating append-only because **edges point backward
only**: a new event records its `causation_id` parent; an existing event is never
mutated to record a child. The forward view (an event's children, a full saga tree)
is reconstructed by scanning — so the **event graph is a derived artifact** (§10),
disposable and rebuildable. Relationships are canonical (backward `event_id`
references stored in the log); the graph index is only a cache.

A **session** is not a separate primitive — it is a named, `correlation_id`-scoped
slice of the event graph: the saga tree of one coherent unit of work.

---

## 9. Validation & Repair

Validation is **deterministic**: identical input always yields an identical verdict.
It is a pure function of the document and the composed registry (§5.6).

A document is valid if and only if:

1. Its frontmatter parses (§4.5) to an object.
2. `type` resolves, bare or qualified, to a primitive in the registry.
3. Every universal field (§4.2) and every `required_fields` entry is present and
   non-empty. `null`, `""`, and `[]` count as empty.
4. Every `required_when` condition that holds has its fields present and non-empty.
5. Every present field with an `enums` entry takes allowed values only.
6. Every present field with a `patterns` entry matches it.
7. Every `references` field names a safe vault path to an existing document (unless
   `must_exist: false`) of an allowed type and portability. If a `hash_field` is
   declared, it equals the target's current content hash.
8. A `primitive` document also satisfies the §5.4 `primitive` meta-schema.

On top of the document rules, stage 4 (§6.3) rejects an envelope that would change
a document's `type`, change an `immutable_fields` value, rewrite an append-type
document, or delete one.

Hosts MUST NOT reject a document because of unknown frontmatter keys. Unknown keys
MUST be preserved to support agent scratchpads and forward compatibility with OKF
extensions.

On failure, the host MUST return structured **repair feedback** so an agent can
self-correct without guesswork:

```jsonc
{
  "repair": {
    "field_errors": [
      { "field": "name", "issue": "Missing required field 'name'." }
    ]
  }
}
```

A host MAY also emit non-blocking `warnings` (deprecated fields, low-confidence
content, a failed projection). Warnings MUST NOT block a commit.

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
  "rebuild_command": "<host-defined rebuild command>"
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
type) records a workspace's presentation conventions: its default
language/locale, formality, date and currency formatting, and terminology preferences.

It is `structural` and therefore travels in `template`/`sale` bundles (§5.5): a sold
business carries its voice and locale conventions, but never the operator's private
content. A host applies a `language_convention` as a **presentation overlay** at the
semantic/rendering layer; it MUST NOT alter the deterministic layer's symbolic keys or
enumerated values.

### 11.8 Workflow Runtime & Daemon Contract

SSSS defines the source of truth for workflow runtime behavior, but it does not
mandate one resident process manager. A host MAY use OS cron, systemd timers,
serverless schedules, webhooks, message queues, browser alarms, or an always-on
daemon to wake the runtime. Those systems are **wake-up mechanisms** only. They MUST
NOT become the canonical schedule, queue, or task history.

The canonical runtime sources are:

| Concern | Source of truth |
|---------|-----------------|
| Schedule and trigger meaning | `workflow` frontmatter `triggers[]`. |
| Submitted work | `task` documents. |
| Execution transcript | append-only `run` documents. |
| What happened | append-only event log (§8). |
| Claim/concurrency safety | leases (§7) plus deterministic idempotency keys (§6.4). |
| Dashboards, task queues, cursors | projections (§10), rebuildable from the vault and event log. |

A conformant daemon loop is:

1. **Scan** active `workflow` primitives whose `triggers[]` might fire.
2. **Evaluate** the trigger against wall-clock time, incoming event, webhook, file
   change, condition, or explicit manual invocation.
3. **Append** a `workflow_triggered` event via an `event` envelope.
4. **Instantiate** one `task` via an `operation` envelope.
5. **Claim** the task using a time-bound lease before execution.
6. **Create or append** a `run` record for execution steps.
7. **Patch** task status to `done` or `failed`, or to `pending` with retry metadata.
8. **Rebuild** derived task queues, run timelines, graph indexes, or UI projections
   as needed.

Every step that mutates vault state MUST use the Operation Contract (§6). A daemon
MUST NOT write task, run, cursor, or workflow files directly.

#### Trigger Types

Core trigger types are:

| Type | Fires when |
|------|------------|
| `manual` | A human, agent, or another workflow invokes it. |
| `cron` | A wall-clock cron expression reaches a scheduled instant. |
| `interval` | A fixed duration elapses after the previous scheduled instant. |
| `event` | A matching event-log entry appears. |
| `webhook` | A verified external request arrives. |
| `file_change` | A matching vault path is created, patched, or deleted. |
| `condition` | A host-defined predicate over vault/projection state becomes true. |

Trigger entries SHOULD use the fields documented in §5.4 `workflow`. Hosts MAY add
type-specific `x_` fields, but MUST preserve unknown fields when rewriting the
workflow document (§4.2).

#### Idempotency & Duplicate Daemons

The idempotency basis for runtime-created work is:

```text
workspace_id + workflow_id + trigger_id + scheduled_for
```

Two daemon ticks evaluating the same trigger for the same scheduled instant MUST
produce the same task idempotency key. Replaying the same envelope MUST NOT create a
second task. This rule is what lets an SSSS host run multiple scheduler processes
without a scheduler database becoming the source of truth.

For `event`, `webhook`, and `file_change` triggers, `scheduled_for` SHOULD be the
canonical event timestamp or the host's normalized receipt timestamp, and the task
SHOULD also record `trigger_event_id` when one exists.

#### Concurrency, Misfires & Retries

`misfire_policy` determines what happens when a daemon wakes after one or more missed
schedule instants:

| Policy | Meaning |
|--------|---------|
| `skip` | Do not create work for missed instants. |
| `run_once` | Create one task for the most recent missed instant. |
| `catch_up` | Create one task per missed instant, each with its own idempotency key. |

`concurrency` determines what happens when a trigger fires while earlier work from
the same workflow/trigger is still active:

| Policy | Meaning |
|--------|---------|
| `allow_parallel` | Create the new task regardless of active runs. |
| `skip_if_running` | Do not create a new task while a prior run is active. |
| `enqueue` | Create a pending task, but allow a worker to claim it only after prior work finishes. |
| `replace` | Cancel or fail the previous task/run before creating the replacement. |

Retries MUST be represented on the `task` and/or `run` (`attempts`,
`next_attempt_at`, `status: retrying`) and by events. A dead-letter outcome SHOULD be
represented as `status: failed` on the task and `status: dead_letter` on the final
run, plus an event explaining the terminal failure.

#### Runtime Helpers

The reference package exposes `@gregiteen/ssss-cli/runtime`, including deterministic helpers
for planning a workflow trigger into a `workflow_triggered` event envelope and a
task `operation` envelope. Hosts MAY implement their own daemon, but SHOULD pass the
runtime conformance checks to prove the same source-of-truth and idempotency rules.

### 11.9 Multilingual Semantic Runtime Contract

The semantic layer is a **derived projection** over validated vault documents. It
MUST be deterministic for the same vault bytes, registry set, adapter identity, and projection
options. It MUST NOT become a second source of truth.

Each projected record SHOULD expose a stable identity, source path and content hash,
primitive type, portability class, surface text, normalized search tokens, and graph
edges. Identity is resolved from `semantic_id`, then `resource`, then the source path.
Edges are derived from explicit `relations`, wiki links, and Markdown links. Hosts MAY
add embeddings or richer ranking, but the exact lexical/graph projection MUST remain
available as a dependency-free interoperability baseline.

The safe default projection contains only `structural` documents. It MUST exclude
`tenant_private` and `resource_bound` documents unless the caller explicitly enables
private indexing in an authorized context. Language selection MUST NOT widen scope or
implicitly disclose conversations, runs, tasks, credentials, customer data, or bound
resource values.

A host MAY inject a multilingual embedding adapter. Every enriched record MUST carry
the embedding model identity and vector dimension. Search SHOULD report lexical and
semantic evidence separately before computing a hybrid score.

A host MAY inject an LLM render adapter at presentation time. The render request MUST
carry an invariant-control block. Rendering MAY change natural-language title,
description, body, formatting, dates, and units, but MUST NOT change primitive IDs,
field IDs, enum codes, actions, permissions, paths, versions, hashes, or relations.
Canonical documents are authored once in any language; SSSS 0.9 neither requires nor
materializes translation documents or localized vault trees.

---

## 12. Conformance

Conformance is defined by a shared set of **fixtures** — canonical
request/response pairs for the Operation Contract. A host is conformant if, for
every fixture, it produces the expected response and status code.

Fixtures are distributed as a JSON document carrying:

- `operation_types` — the envelope-type schemas.
- `idempotency` — TTL and replay behavior.
- `validation_rules` — envelope and content rules.
- `runtime_contract` — trigger vocabulary and daemon idempotency rules (§11.8).
- registry-extension checks — schema shape, regex validity, symlink rejection, and
  core/sibling collision rejection.
- multilingual semantic checks — deterministic indexing, privacy defaults, graph
  edges, embedding provenance, cross-language retrieval, and invariant rendering
  (§11.9).
- `fixtures[]` — each with a `request`, an `expected_response`, and an
  OPTIONAL `expected_http_status`.
- `error_codes` — the canonical code table.

The conformance fixture set is the shared test contract between all SSSS
implementations. A host MUST NOT claim SSSS conformance without passing the current
fixture set, including each fixture's `expected_http_status` if it speaks HTTP
(§6.5). Beyond the fixtures:

- Hosts implementing workflow daemons SHOULD run the runtime checks exposed by
  `@gregiteen/ssss-cli/runtime` (§11.8).
- Hosts exposing semantic search or runtime rendering MUST pass the §11.9 checks.
- Hosts supplying their own adapters (§6.7) MUST pass the shared adapter
  contracts: VFS, event store, idempotency store, and lease store, including
  their multi-process races.
- Kernel implementations MUST pass the resource-lifecycle, error-code,
  append-only, capability, and frontmatter-subset checks.

The reference suite also checks **this document**: every example document in it
must validate, §5.1 must list every core primitive with its registry portability,
and the §6.5 table must match the reference error codes. A spec edit that breaks
an example fails the build, just like a code change would.

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
| Idempotency key | Opaque string; random UUID for ad-hoc requests, deterministic derivation for runtime work (§6.4, §11.8) | `runtime-run-3f9a…` |
| Timestamp | ISO 8601, `Z` suffix (UTC) | `2026-05-16T14:03:00Z` |

Slugs and names MAY contain non-ASCII Unicode letters so that non-Latin scripts are
first-class; they remain lowercase and hyphen-separated. A host MAY instead use an
opaque ID as the slug and keep the human-readable label in `title` / `name`.

---

## 14. Spec Versioning

This document is versioned independently of any host and of the conformance
fixture set.

- The spec version is stated in the document header (currently **v0.9**).
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

`files` MUST be sorted by `path` (§16.3 order) so that two exports of the same vault state
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
| `ssss_core_version` | yes | The `registry/core.json` `spec_version` the bundle targets (e.g. `"0.9"`). A host MUST refuse a bundle whose core version it does not support. |
| `required_extensions` | yes | Array of extension registry ids the files rely on (e.g. `["acme"]`). Empty array if the bundle uses only core primitives. A host MUST refuse a bundle naming an extension it has not loaded. |
| `export_profile` | yes | `backup` \| `template` \| `sale` — the §5.5 profile this bundle was built under. Determines the allowed portability classes. |
| `primitive_inventory` | yes | Map of primitive `type` → count, over every file in the bundle (replaces the legacy hard-coded `categories`; it is registry-driven, so extension types appear automatically). |
| `provisioning` | yes | Array of provisioning steps (§17.2) — the ordered, declarative plan for binding this bundle into a live workspace. Empty for a pure `backup` that is restored in place. |
| `parameters` | no | Array of parameter definitions (§16.5) the importer must resolve (e.g. business name, domain). |
| `source_workspace_id` | no | Origin workspace; OMITTED or nulled in `template`/`sale` profiles (it is operator-identifying). |
| `dependencies` | no | `{ primitives, extensions, migrations, integrity }`: the sorted primitive types and extension ids the files use, the `migration` ids they carry, and `integrity: { content_hash, ssss_core_version }`. If present, `integrity.content_hash` MUST equal `provenance.content_hash`. |
| `file_count` | yes | Length of `files`; a cheap integrity check. |
| `provenance` | yes | `{ content_hash, exporter, signature? }` (§16.3). |

`primitive_inventory` supersedes the legacy fixed `categories` object and `provisioning`
supersedes its `capabilities` booleans: both are now open and registry-driven rather than a
closed enum, so a bundle full of extension primitives inventories and provisions them
without a spec change.

### 16.3 Provenance & Integrity

`provenance` makes a bundle verifiable and attributable:

- `content_hash` — `sha256:` followed by the lowercase hex SHA-256 of the UTF-8 bytes of
  the **canonical file serialization**, defined as:
  1. Take each file as `{ "path": …, "content": … }`, in that key order, dropping any
     other member (such as a cached `frontmatter`).
  2. Sort by `path`, comparing strings by UTF-16 code units. This equals byte order
     for ASCII paths.
  3. Serialize the array as JSON with no insignificant whitespace, escaping strings
     exactly as ECMAScript `JSON.stringify` does: `"`, `\`, and control characters
     are escaped, and all other characters, including non-ASCII, are emitted
     literally.

  An importer MUST recompute it and reject a bundle whose files do not match. This is
  what makes a bundle tamper-evident and what a marketplace lists against.
- `exporter` — an identifier for the tool/host that produced the bundle (`"@gregiteen/ssss-cli@0.9.3"`).
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
adopted verbatim from the legacy `WorkspaceTemplateVariableDefinition`:

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
controlled vocabularies are adopted from the legacy `WorkspaceProvisioningStep` and
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
`resource_bound` primitives of §5.5 each declare which relation binds them (for example,
an extension's `domain` → `owns_domain`, `phone_number` → `routes_calls_to`, and
`integration_connection` → `connects_to`), so an importer knows exactly what real-world
binding each requires.

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
  `installMode` of `optional | recommended | required` (adopted from the legacy
  `WorkspaceMarketplaceRecommendation`). `provision` installs `required` dependencies before
  the bundle itself; `optional`/`recommended` are surfaced to the operator.
- **Upgrade** — moving an installed bundle from one version to the next is performed
  through a `migration` primitive (§5.4) plus **structural-only** `patch` envelopes (§6.2). An upgrade MUST NOT touch `tenant_private` data: it rewrites the
  structural model, never the operator's private records. This is what lets a sold business
  receive standard updates without the vendor reaching into customer data.

---

## Appendix A — Reserved Frontmatter Keys

The following frontmatter keys are reserved by this spec across all primitives and
MUST NOT be repurposed by hosts:

- Universal (§4.2): `type`, `title`, `description`, `timestamp`.
- Semantic (§4.2, §11): `semantic_id`, `relations`, `language`, `resource`, `tags`,
  `aliases`, `feedback`, `confidence`.
- Lifecycle: `slug`, `schema_version`, `status`.
- Portability (§5.5): `x_portability`.

The patch key `__body__` (§6.2) is reserved and can never be a frontmatter key.

Hosts adding their own frontmatter fields SHOULD prefix them `x_` to remain
forward-compatible with future spec revisions.

---

*SSSS is a portable standard. This specification is the ground truth; every SSSS
implementation is a conformant consumer of it. To learn how a specific product
implements SSSS, read that product's `SKILL.md`, not this file.*
