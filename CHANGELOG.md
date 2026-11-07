# Changelog

All notable changes to the SSSS (Structured Semantic Syntax System) spec will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.14.5] - 2026-11-07
### Fixed
- **A dry run no longer changes anything on disk.** Previewing an operation used to create the vault and event directories, take intent locks, run commit recovery and store an idempotency record. A preview now opens storage without creating it, reads a missing event directory as empty, and writes none of those.

### Behavior changes hosts should check
- A `dry_run` operation now fails with `Pending commit recovery` when an unsettled commit exists, instead of repairing it. Run a real operation or `recover` first.
- `FileSystemVfs` and `JsonlEventStore` accept `createRoot: false`. A missing root is then allowed, and a symlink on the way to it is refused.

### Changed
- Only `skills/ssss` ships in this repository. The other skills moved to private storage.
- `npm test` now runs `scripts/check-public-repo.mjs`, which fails if private names or internal files reach the public tree.

## [0.14.4] - 2026-11-04
### Fixed
- **`ssss conformance --engine` crashed in every consumer repository (`CONFORMANCE_CWD_INDEPENDENCE`)**:
  - `scripts/conformance-09.mjs`: `checkJsonSchemas()` resolved `registry/core.json`, `schemas/core-registry.schema.json`, `schemas/bundle.schema.json` and `conformance/reference-bundle.ucw.json` from `process.cwd()`. Those assets ship inside this package, so any consumer running the gate from its own project root — which is the normal case, and always the case for repositories whose registry lives at a non-default path such as `--registry vault-registry` — died with `ENOENT` before reaching the kernel checks. The paths are now resolved relative to the module via `fileURLToPath(import.meta.url)`, matching the convention already used by `check-commit-durability.mjs` and `check-docs-parity.mjs`.
  - Added `scripts/check-conformance-cwd-independence.mjs`, wired into `npm test`: runs the real gate from a temporary directory containing none of those assets, and additionally asserts that no `path.resolve()` on a package asset path is reintroduced. Verified to fail with the original code and pass with the fix.

## [0.14.3] - 2026-11-03
### Added
- **Fail-Closed JSON Schema Validation & Validator Hardening (`SCHEMA_VALIDATION_HARDENING`)**:
  - `src/schema-validator.mjs`: Upgraded to Draft 2020-12 specification with sibling `$ref` evaluation alongside keywords, cycle detection, `propertyNames`, `uniqueItems`, `minItems`, `maxItems`, `minLength`, `maxLength`, `minimum`, `maximum`, `const`, `allOf`, `anyOf`, `oneOf`, and `if`/`then`/`else` conditional branches.
  - Exported convenience schema validation utilities: `getCoreRegistrySchema()`, `getBundleSchema()`, `validateRegistryAgainstSchema()`, and `validateBundleAgainstSchema()`.
  - `schemas/core-registry.schema.json` & `schemas/bundle.schema.json`: Enforced `"additionalProperties": false` across all objects with strict `propertyNames` pattern matching, SHA-256 digest patterns, and integer minimum constraints. Conditional requirements enforce `spec_version` and `description` only for core registries.
- **CLI `ssss schema validate`**:
  - `scripts/cmd-schema.mjs`: Added `ssss schema validate <file> [--type core|bundle] [--schema <path>] [--json] [--quiet]` with automatic format detection.
- **App-Local Extension Scaffolding & Isolation**:
  - `scripts/cmd-new.mjs`: Added `--extension <name>` option to scaffold app-specific primitive extensions directly into `registry/extensions/<name>.json`, with isolated generated tests and strict name validation.
  - `src/registry.mjs`: `loadRegistries()` supports app repositories carrying only `registry/extensions/`, automatically composing with the package core registry.
  - Decoupled proprietary app extensions (app-owned JSON files) from `registry/extensions/` to maintain a 100% vendor-neutral standard.
  - Updated canonical reference bundle (`conformance/reference-bundle.ucw.json`) to use standard core `resource` primitive.
- **Documentation Parity & OpenWiki Sync in Release Pipeline**:
  - `scripts/sync-docs.mjs` and `scripts/check-docs-parity.mjs`: Automatically synchronize CLI command lists, help topics, and primitive counts into `docs/help/overview.md` and enforce 100% doc parity.
  - Initialized and ingested canonical knowledge graph hubs into `openwiki/`.
  - `skills/push/scripts/preflight-release.mjs`: Two-phase preflight release pipeline running quality gates first, followed by OpenWiki refresh and doc parity checks.

### Behavior changes hosts should check
- Custom application extensions should reside in the application repository's own `registry/extensions/` directory rather than being contributed to core SSSS.
- Running `ssss schema validate <file>` allows CI pipelines and hosts to validate registries and `.ucw` bundles against the standard fail-closed JSON Schemas.

## [0.14.2] - 2026-11-02
### Added
- **Canonical JSON Schema Draft 2020-12 Definitions (`JSON_SCHEMA_EXPORT`)**:
  - `schemas/core-registry.schema.json`: Formal JSON Schema Draft 2020-12 defining the full structure of `registry/core.json` and extension registries (document primitives, contract primitives, universal frontmatter, portability classes and export profiles, bundle manifest specifications, provisioning steps and relations, runtime contracts, and semantic search fields).
  - `schemas/bundle.schema.json`: Formal JSON Schema Draft 2020-12 defining the container format for Universal Cloud Workspace (`.ucw`) transport bundles, covering `manifest`, `files`, `dependencies`, `parameters`, `provisioning`, `provenance`, and optional `branding`.
  - `registry/core.json`: Updated `$schema` URI to point to `https://ssss.dev/schemas/core-registry.schema.json`.
- **Zero-Dependency Schema Validation**:
  - `src/schema-validator.mjs`: High-performance, recursive JSON Schema Draft 2020-12 validator in pure Node ESM supporting `type` unions, `properties`, `additionalProperties`, `required`, `items`, `enum`, `pattern`, and local `$defs`/`$ref` pointers.
  - Exported `./schema-validator` and `./schemas/*` via package exports and added `"schemas"` to npm package distribution files.
- **CLI Schema Inspection & Export**:
  - `scripts/cmd-schema.mjs`: Added `ssss schema core`, `ssss schema bundle`, and `ssss schema export [--out <dir>]` subcommands to output and export canonical JSON Schemas.
- **Automated Conformance Sweeps**:
  - `scripts/conformance-09.mjs`: Integrated automated schema validation checks into continuous test suites, verifying `registry/core.json` and `conformance/reference-bundle.ucw.json` against canonical schemas with negative mutation testing.
- **Specification and Backlog Hygiene**:
  - `docs/ssss-spec.md`: Documented canonical JSON Schema references in §5.1 and §16.1.
  - Resolved and closed all outstanding host deferral items in `docs/projects/DEFERRED_BACKLOG.md`.

### Behavior changes hosts should check
- Tools and IDEs may validate `registry/core.json` and `.ucw` bundle files directly against `schemas/core-registry.schema.json` and `schemas/bundle.schema.json`.
- The CLI command `ssss schema export` is now available to export canonical schema definitions for external consumption.

## [0.14.1] - 2026-11-02
### Added
- **Core primitive aliasing (`role` ↔ `security_role`, `thread` ↔ `conversation`)**:
  - `registry/core.json`: Reciprocal `aliases` declared on `role` (`security_role`) and `thread` (`conversation`).
  - `src/registry.mjs`: `composeRegistries()` executes two passes to register and validate core primitive aliases, enforcing mutual symmetry when aliasing existing primitives, rejecting self-aliases, and disallowing collisions with unrelated primitives.
  - `src/registry.mjs`: `resolveEquivalentDefinitions()` and `isSamePrimitiveType()` resolve equivalence across canonical and alias types.
  - `src/registry.mjs`: `validateReferenceConstraints()` resolves `allowed_types` and `disallowed_types` across primitive aliases.
  - `src/kernel.mjs`: Operation replace and patch type-mutation guards accept equivalent primitive aliases transparently without requiring an explicit migration.
  - `src/engine.mjs`: `legacyRoleCapabilities()` expands permissions across declared aliases for `role` and `security_role`.
  - `src/authorization.mjs`: `createCapabilityAuthorizer()` enforces `policyFloors` across primitive aliases and matches capability grants across aliases for primitive actions.
- **Core primitive deprecation metadata**:
  - `registry/core.json`: Declared `"deprecated": true` and `"deprecation_notice"` on inert primitives `release`, `model`, `page`, and `conflict`.
  - `src/registry.mjs`: `validatePrimitiveDefinition()` validates optional boolean `deprecated` and string `deprecation_notice`.
  - `docs/ssss-spec.md`: Documented core primitive aliases (§5.1, §5.3, §5.4) and deprecation metadata.
  - Synchronized managed portable core SSSS skill package (`skills/ssss/`, `.agent/skills/ssss/`) with `0.14.1` reference materials.

### Behavior changes hosts should check
- Replacing or patching a document from `role` to `security_role` (or `security_role` to `role`), or `thread` to `conversation`, is now accepted by kernel type-mutation guards.
- Reference constraints with `allowed_types: ["role"]` accept targets of type `security_role`, and `disallowed_types: ["role"]` reject targets of type `security_role`.
- Policy floors configured on `ssss:role` or `role` are applied when mutating documents of type `security_role`.

## [0.14.0] - 2026-11-02
### Added
- **Parameter bindings & Resource bindings (D2, D4)**: `provisionBundle` supports `x_bind` in template frontmatter and resource bindings (`bindings` array with `relation`, `field`, `mode`), with type validation and parameter substitution.
- **Deterministic ID, slug, and link remapping (D3)**: Target workspace and path isolation with automatic Markdown link and typed references rewriting.
- **Topological dependency resolution (D5)**: Bundles declare dependencies via `manifest.dependencies.bundles` (`required`, `recommended`, `optional`). Dependencies are resolved in topological order with circular dependency detection.
- **Base-version precondition & conflict protection (D8)**: `importBundle` assigns `expected_before_hash`; kernel enforces match at Stage 3, preventing regression of concurrent local edits.
- **Structural bundle upgrade (D6)**: `upgradeBundle` and `ssss upgrade` CLI produce structural patches and `migration` primitive records; engine fail-closed refusal of `tenant_private` targets for upgrade envelopes.
- **Cross-language HTTP wire protocol & reference server (G3)**: Spec §6.8 HTTP wire transport, `ssss serve` reference server with bearer token authentication (`Authorization: Bearer <token>`), health check (`GET /health`), and canonical HTTP status mapping matching `ERROR_STATUS`.
- **Subprocess stdin-JSON bridge (G3)**: `ssss bridge` command for non-JS hosts (e.g. Python), supporting single JSON object, JSON array batch, and streaming NDJSON with `--stream`.
- **Projection adapter conformance suite (G4)**: `runProjectionContract` in `@gregiteen/ssss-cli/projections` and `projection_memory` in `ssss adapter conformance`, covering log rebuild, incremental apply parity, drift detection, and replay idempotency.
- **Path-scoped capability grants (G5)**: Capability authorizer supports `<capability>@<glob>` format (e.g. `ssss:rule:*@rules/marketing/**`) enforced at Stage 5 authorization.

### Behavior changes hosts should check
- `provisionBundle` returns `{ manifest, envelopes, bindings, dependencies, unmappedLinks }`. An unbound required resource fails provisioning unless `dryRun: true`.
- Envelopes with `envelope.intent === 'upgrade'` targeting `tenant_private` documents are rejected with `forbidden`.
- `importBundle` envelopes include `expected_before_hash` when the source document existed at export time.

## [0.13.1] - 2026-11-02
### Changed
- No change to the package's code, registry, spec or bundled skill. This
  release brings the tag and npm in line with `main`, which gained the
  closed `KERNEL_COMMIT_DURABILITY` project records and regenerated agent
  instruction files; none of those ship in the package.

### Behavior changes hosts should check
- None. The bundled skill core still describes protocol 0.13.0, which is
  what this version implements.

## [0.13.0] - 2026-11-02
### Fixed
- A committed operation is no longer executed twice. Stage 2 now falls back to
  the event log when the idempotency store has no record, because every event
  already carries its `idempotency_key` and `request_hash`. Previously a retry
  re-executed after a lost or expired record, or from any new process using the
  engine façade (each process had its own memory store); an append-type patch
  landed twice with two events. Replays rebuilt from the log omit post-commit
  warnings and are otherwise identical.
- A crash between the VFS write and the event append no longer leaves the vault
  ahead of the log. The kernel records a commit intent (prior content, intended
  digest, pre-assigned `event_id`) and holds a per-path commit lock until the
  append ends. A leftover intent is resolved before the next commit on its path
  and before a kernel's first operation: committed if its event is in the log,
  rolled back otherwise, and reported as a conflict if the document was changed
  outside the kernel. A live writer's intent is never touched. Verified with
  child processes killed by `SIGKILL`.
- `FileSystemVfs` and `JsonlEventStore` now `fsync` files and directories so
  the intent, the document and the event reach disk in that order.
- Bundle import keys include the file's content digest, so re-importing a
  changed bundle commits the change instead of failing `idempotency_conflict`.
- Spec §6.4 no longer claims the reference idempotency stores never expire.

### Added
- Event stores: `findByIdempotencyKey(workspaceId, key)` (memory and JSONL,
  including rotated archives).
- `@gregiteen/ssss-cli/intents`: `MemoryIntentJournal`, `FileIntentJournal`,
  `runIntentJournalContract`. `FileSystemVfs#intentJournal()` keeps intents in
  the reserved `.ssss-intents/` directory, so hosts that already pass a
  `FileSystemVfs` get recovery without code changes.
- `kernel.recover()` and `engine.recover(vaultRoot)`.
- `ssss adapter conformance` reports intent journal suites.

### Behavior changes hosts should check
- `FileSystemVfs` reserves `.ssss-intents/` beside `.ssss-locks/`: document
  paths under it are rejected and `list` skips it.
- A kernel's first operation resolves leftover intents. If recovery itself
  fails, operations return `internal_error` ("Commit recovery failed") rather
  than writing over an unresolved commit. Intents that cannot be resolved are
  moved to `.ssss-intents/unresolved/` and reported by `recover()`.
- Commits now wait on `fsync`. The conformance suite went from about 9 s to
  13 s on the Mac mini; per-commit cost depends on the disk.
- Bundle import keys change format. Keys are opaque per §6.4; a host that
  stored them should not compare old and new keys.
- Custom event stores without `findByIdempotencyKey` keep the previous
  behavior; §6.4 then requires their idempotency stores to retain records
  indefinitely.
- Custom VFS adapters without `intentJournal()` get an in-process journal and no
  crash recovery; pass `intentJournal` to `createKernel` to add one.

### Known issue
- Delivering bundle content that this host never imported, and that is older
  than a local edit, still overwrites the edit. It needs an expected-base
  precondition on import and is tracked in `CAPABILITY_PROVISIONING_CONTRACT`.

## [0.12.1] - 2026-10-29
### Fixed
- Republish under a new version: npm rejected 0.12.0 as a previously staged
  version, so the retention change ships as 0.12.1 with no other difference.

## [0.12.0] - 2026-10-29
### Added
- `FileIdempotencyStore` now expires entries. It accepts `retentionMs` (default
  24 hours, `0` disables) and `pruneEvery` (default every 500 puts), and exposes
  `prune()`, which removes entries older than the window and returns the count.
  Retention runs opportunistically inside `put` and never rejects a committed
  operation. Previously entries were written and never removed, so a directory
  only grew: one frequently rewritten document produced 14,438 records from a
  single path, and a live vault reached 283k files / 1.2 GB, which slowed every
  traversal of it. A retry arrives within minutes, so a bounded window loses
  nothing that mattered. Lock and temp files are never treated as entries.

## [0.11.2] - 2026-10-19
### Added
- `parseFrontmatter(fm, { strict: true })` throws a `SyntaxError` on lines that
  are not `key: value`, orphaned indentation, and malformed quoted or inline
  values, so hosts such as Total Recall can report unreadable files. The default
  stays lenient. Strict mode accepts all 30,518 files in 57 Total Recall vaults.

## [0.11.1] - 2026-10-19
### Fixed
- The frontmatter parser (`@gregiteen/ssss-cli/frontmatter`) now reads the YAML
  that Total Recall and other tools actually write. It previously dropped
  hyphenated keys (`allowed-tools`), truncated wrapped values, split quoted
  commas inside inline arrays, left JSON flow maps and arrays of JSON objects
  as strings, turned tags like `context:universal` into maps, and kept
  trailing `# comments`; `patch` then wrote those mis-parsed values back to
  disk. Verified against 27,536 vault files across 55 Total Recall brains: the
  only differences from a js-yaml reading are leading-zero codes and ISO
  timestamps, which SSSS keeps as strings on purpose (spec §4.5).
- The serializer quotes strings containing commas or a leading indicator and
  writes nested objects inside inline arrays as JSON, so values round-trip.

### Added
- `scripts/check-frontmatter.mjs`, run by `npm test`.
- Documents a broken writer flattened onto one line with literal `\n` text
  (23 such vault files exist) are repaired automatically on read, and
  `repairEscapedNewlines` is exported from `@gregiteen/ssss-cli/frontmatter`.
  `scripts/autolink.mjs` now uses the shared frontmatter parser.

## [0.11.0] - 2026-10-13
### Added
- `trigger` gains `event_subject` and `event_match`, and `assistant` gains `owns`.
  `@gregiteen/ssss-cli/runtime` exports `triggerMatchesEvent`, `subjectMatches`
  and `resolveSubjectOwner`; the spec (§11.8) defines event matching and subject
  ownership, which `source: event` previously left undefined.

### Fixed
- Work caused by an event is now keyed by `event_id` (and carries it as
  `causation_id`), not by the event's timestamp. Two events in the same
  millisecond no longer collapse into one task path and key.

## [0.10.3] - 2026-10-01
### Fixed
- Read event logs in 64 KiB chunks when building duplicate-ID indexes or
  replaying events. Large histories no longer require one full-log string.
  UTF-8 decoding, replay cursors, file locks and duplicate detection retain
  their contracts. A regression check guards bounded reads and corrupt-log
  rejection.

## [0.10.2] - 2026-09-28
### Fixed
- The 0.10.0 notes promised pointer fields for large-file assets, but the
  `asset` registry entry never declared them. It now declares `storage_uri`
  and `resource_ref`. An asset with `encoding: none` is a pointer: it must set
  `storage_uri` and be marked `x_portability: resource_bound` (or
  `tenant_private`). `resource_ref` must name a `resource` document. Template
  and sale exports replace `storage_uri` with `REQUIREMENT` and keep `hash` and
  `size_bytes`, so the buyer can check the file they bind.

### Behavior changes hosts should check
- An `asset` with `encoding: none` and no `storage_uri` or no
  `x_portability: resource_bound|tenant_private` is now rejected.
- An `asset`'s `x_portability` may only be `resource_bound` or `tenant_private`.
- `resource_ref` on an `asset` must point at an existing `resource` document.
- Template/sale bundles containing pointer assets now declare a
  `asset_storage_uri` parameter and a `bind-asset` provisioning step.
- New conformance section: asset pointers (§5.4 asset, §5.5).

## [0.10.1] - 2026-09-28
### Fixed
- A required list field set to an empty list (`deferred_steps: []`) was
  rejected as "Missing required field". Required means present: only an
  absent, `null` or empty-string value is missing now. Hosts had to patch the
  package to write valid documents with empty lists.

### Behavior changes hosts should check
- Documents with a required list field set to `[]` now validate.
- New conformance checks: an empty list satisfies a required list field;
  absent, `null` and empty-string values are still missing.

## [0.10.0] - 2026-09-28
### Added
- **`asset` primitive**: Text-encoded files (Base64 for small binaries, UTF-8 for code/SVGs) and pointer metadata for large files (`resource_ref`, `storage_uri`, `hash`).
- **`resource` primitive**: First-class core support for external cloud infrastructure, databases, S3 buckets, domains, and mailboxes, completing the `resource_bound` portability class (§5.5) with automatic `resource.binds` stripping on bundle export.
- **`trigger` primitive**: Standalone schedules and event sources (`cron`, `webhook`, `event`), decoupling procedural workflows from scheduling and enabling file-level distributed leasing without workflow lock contention.
- **`role` and `thread` primitives**: Canonical, concise forms of `security_role` and `conversation` with 100% backward-compatible alias resolution.
- **`docs/design.md` scaffolding**: `ssss new` now scaffolds a starter architecture and technical design specification alongside `README.md` and `CLAUDE.md`.
- **Project Management Audit integration**: `scaffold-project.mjs` now includes `AUDIT` in canonical `DOC_TYPES` (the 5-document SWE sequence).

### Behavior changes hosts should check
- Core registry now recognizes `asset`, `resource`, `trigger`, `role`, and `thread`.
- Existing documents using `security_role` and `conversation` continue to validate without modification via alias resolution.

## [0.9.7] - 2026-09-27
### Fixed
- Frontmatter kept number-like strings as text only until the next patch. The
  serializer wrote `"07003"` unquoted and the parser read any all-digit value
  as an integer, so a zip code or license number with a leading zero lost it
  (`07003` became `7003`) once any other field of the document was patched,
  and YAML 1.1 readers such as PyYAML read the unquoted value as octal
  (`07003` → 3587).

### Behavior changes hosts should check
- Strings that would read back as a number, boolean or null (`"07003"`,
  `"00123"`, `"1.10"`, `"true"`, `"null"`) are now written double-quoted.
- An unquoted scalar with a leading zero (`zip: 07003`) now parses as the
  string `"07003"`, not an integer; plain integers (`0`, `42`, `-5`) are
  unchanged. Documents already rewritten without the zero cannot be recovered
  by the library.
- New conformance check: number-like strings survive repeated patches.

## [0.9.6] - 2026-09-25
### Changed
- The push skill describes this repo's real release path. `/push` is always a
  full release (bump, preflight, commit, push, tag, npm publish, verify),
  including for docs-only changes. The droplet and `production`-branch deploy
  section, which came from another repo, is gone, and files are staged by name
  instead of `git add .`.

### Added
- `skills/push/scripts/verify-publish.mjs` waits out npm's propagation delay,
  then confirms the published `gitHead` matches the release tag and that
  `latest` points at the new version.

## [0.9.5] - 2026-09-25
### Changed
- The packaged CHANGELOG now lists the 0.9.4 behavior changes that hosts should
  check before upgrading: append-type documents reject full replaces, registry
  references are enforced by default, anonymous requests fail before storage is
  read, double-quoted frontmatter decodes escapes, and trailing-`*` capabilities
  are prefix-scoped. No code changes.

## [0.9.4] - 2026-09-25
### Fixed
- The kernel now returns symbolic failure codes with transport status mapping,
  reconciles prepared resources on dry runs and pre-commit failures, and keeps
  logged commits intact when resource finalization or projection dispatch fails.
- The reference frontmatter parser handles the documented block-scalar subset,
  and capability and legacy-role checks match the v0.9 authorization contract.

### Behavior changes hosts should check
- An `operation` can no longer replace an existing append-type document
  (`conversation`, `run`). This now fails with `validation_failed`, per spec §5.3.
  Append with a `patch` carrying `__body__` instead.
- Registry `references` are enforced on every kernel write. Targets are read
  through the kernel's VFS unless the host passes its own `resolveReference`.
  Before this release, a write skipped the check when no resolver was given.
- A request with no principal fails as `unauthorized` before the kernel reads
  storage. It no longer receives `not_found` or validation details.
- Double-quoted frontmatter strings now decode their escapes (`"a\"b"` becomes
  `a"b`), matching YAML. Values that relied on literal backslashes inside double
  quotes will change when parsed. An invalid escape such as `"C:\path"` is still
  read literally.
- Trailing-`*` capabilities are prefix-scoped: `ssss:assistant:*` now grants
  every action on assistants, where before it granted nothing.

### Changed
- Aligned the v0.9 specification, conformance fixture statuses, and reference
  implementation. The in-process runner checks expected HTTP statuses, and
  `npm test` validates the spec's example documents and contract tables.
- Exposed every repository skill to Codex through relative links in
  `.agents/skills`, while keeping the project Total Recall brain private.
- The release SBOM now hashes only the files included in the npm package.

### Added
- Completed the `SPEC_CODE_ALIGNMENT` project documentation and audit.
- Expanded the SSSS project-management skill with workflow references,
  document checks, and review guidance.

## [0.9.3] - 2026-09-24
### Fixed
- Two processes sending an `event` envelope with the same idempotency key at the
  same moment could both append an event, because the kernel records the result
  only after committing and `event` envelopes have no VFS compare-and-swap. The
  kernel now derives an `event` envelope's `event_id` from `(workspace_id,
  idempotency_key)` (`idempotentEventId`, UUIDv5), so the event store rejects
  the second append. Any request that loses at commit re-reads the idempotency
  store and returns the winner's result as a replay, or an idempotency conflict
  when its request differs. If a process dies after appending an event but
  before recording its result, retries of that key now fail instead of
  appending a second event.

### Added
- `idempotentEventId(workspaceId, idempotencyKey)` in `@gregiteen/ssss-cli/events`.
- Conformance checks racing six kernel processes on one `event` idempotency key,
  with identical and with differing content.

## [0.9.2] - 2026-09-24
### Fixed
- The file adapters are now safe to share between processes. Each one checked
  state and then wrote it as two steps, so concurrent processes could both pass
  the check: `FileSystemVfs` could lose an update behind a passed
  compare-and-swap, `FileLeaseStore` could grant the same lease twice (spec §7),
  `FileIdempotencyStore.put` could replace an existing entry, and
  `JsonlEventStore` could append one `event_id` twice. Each check-then-write now
  runs under an exclusive lock file (`O_EXCL`). A lock whose holder process has
  exited is broken immediately; any lock older than 30 s is treated as stale;
  a waiter gives up after 40 s with `SSSS_LOCK_TIMEOUT`. Adapters accept
  `{ lock: { timeoutMs, staleMs } }`. `FileSystemVfs` keeps its locks in a
  reserved `.ssss-locks/` directory that VFS paths cannot address and `list()`
  skips. Locking costs about 0.5 ms per write on APFS.
- `scripts/release.sh` bumps `package.json` and `package-lock.json` and moves the
  `[Unreleased]` entries into the new version's section instead of inserting a
  stub above `[Unreleased]`.

### Added
- `ssss help concurrency`.
- Conformance checks that race six processes against each file adapter, plus
  lock checks for dead holders, stale locks, timeouts, symlinked locks, and the
  reserved VFS lock directory.
- Git tags `v0.8.0` and `v0.9.0` on commits whose package files match the
  published npm tarballs byte-for-byte. Both versions were published from
  uncommitted trees, so no existing commit matched. The push skill now publishes
  from a clean clone of the release tag.

## [0.9.1] - 2026-09-24
### Fixed
- `JsonlEventStore.append` no longer re-reads and re-parses the whole
  `<workspace>.jsonl` log on every append to reject a duplicate `event_id`.
  Each store instance reads a log once on its first append, keeps a set of the
  event ids it has seen, and re-reads only when the log's stat (size, mtime,
  ctime, inode) shows another instance or process has changed it. A batch of N
  appends is now one log read instead of N. Replaying 3,250 appends in fresh
  instances of 400 against a 7,915-event, 9.6 MB log dropped from ~280 s to
  ~1.7 s. Duplicate rejection, symlink refusal (now also enforced with
  `O_NOFOLLOW` where the platform has it), 0600 log mode, and replay order are
  unchanged.
- `MemoryEventStore.append` checks for duplicates against a set of ids instead
  of scanning every stored event.
- The SBOM generator derives the package tarball URL from `package.json`
  instead of a hardcoded 0.9.0 URL.

### Added
- 0.9 conformance checks for the JSONL event store: duplicates rejected from
  the same instance, another instance, and another process; one log read for
  200 appends; rebuild after a foreign append; replay order and cursor resume;
  0600 mode; symlink refusal.

## [0.9.0] - 2026-07-10
### Added
- Shared application kernel (`kernel.execute`) with verified-principal injection,
  canonical request hashing, idempotent replay/conflict, resource prepare/finalize/
  reconcile hooks, and TypeScript command contracts under `@gregiteen/ssss-cli/kernel`.
- Host adapter contracts and dual reference implementations for VFS, identity/
  capability authorization, leases, idempotency, events, projections, semantic
  retrieval/rendering, and generative UI manifests.
- Runtime primitive authoring (`ssss:primitive` meta-schema), layered registry
  composition, aliases, dependency ranges, policy floors, and registry integrity locks.
- CLI surfaces: `ssss primitive`, `ssss registry`, `ssss adapter conformance`, and
  `ssss migrate 0.8-to-0.9` dry-run diagnostics with backup manifests.
- Bundle `manifest.dependencies` for primitives, extensions, migrations, and
  integrity digests aligned with provenance.
- Dedicated 0.9 conformance suite covering adapters, kernel leases, projection
  rebuild/drift isolation, UI adversarial cases, and CLI smoke paths.

### Changed
- Core registry/spec version is now `0.9`. Canonical documents are authored once;
  multilingual presentation uses embedding/render adapters instead of stored
  translation trees.
- The reference engine is a compatibility façade over the shared kernel; hosts must
  inject adapters rather than re-implement mutation stages.

### Removed
- The `translation` document primitive and required localized-vault materialization
  workflow from the 0.9 core surface.

## [0.8.0] - 2026-07-10
### Changed
- Core registry/spec version is now `0.7`. Registry `patterns`,
  `immutable_fields`, and `references` are enforced by the reference engine and
  covered by the parity auditor.
- Bundle import now preflights the complete envelope plan before committing, so a
  late invalid document cannot leave a partial installation.
- Bundle validation now applies all registry field constraints and returns
  structured errors for malformed file entries instead of throwing.

### Fixed
- Bundle provenance now uses the real published package identity,
  `@gregiteen/ssss-cli`, instead of an unavailable package alias. The
  reference bundle derives its exporter name and version from `package.json`.

### Added
- A tracked, first-class `ssss` skill package with evidence-first canon routing,
  a dependency-free document validator, contract reference, evals, and audit
  prompt. The skill is included in the npm package allowlist.
- Conformance checks that pin default and reference-bundle exporter identities
  to current package metadata.
- The `translation` document primitive and spec §11.9 semantic/localization
  contract: exact-hash structural sources, immutable overlay identity, and
  natural-language-only translated fields.
- `@gregiteen/ssss-cli/semantic`, `ssss semantic`, and `ssss localize` for
  deterministic Unicode search/graph projections and non-destructive localized
  materialization through a whole-projection staging directory.
- Fail-closed extension registry composition for malformed fields, invalid
  regular expressions, symlinks, reserved ids, and core/sibling collisions.
- Privacy-safe semantic defaults that exclude `tenant_private` and
  `resource_bound` data unless explicitly requested in an authorized context.
- Conformance fixtures 024–026 plus dedicated extension-registry,
  semantic/localization, and expanded CLI smoke groups.
- Offline help for semantic search and localization, plus a security/UX impact
  report for downstream host implementers.

## [0.7.1] - 2026-07-08
### Fixed
- Reduced `resource_bound` primitives to requirement declarations in `template`
  and `sale` exports, preventing seller-bound domain, phone, or integration
  values from leaking into bundles.
- Rejected malformed bundles with missing `files` arrays and unknown
  `required_extensions`.
- Preserved nested frontmatter maps and arrays during patch serialization.
- Corrected `ssss import --dry-run` accounting to report `would commit` counts
  while leaving target vaults empty.
- Generated starter and reference task files now use the valid `pending` task
  status.

### Added
- Conformance coverage for resource-bound export reduction, strict bundle
  validation, lease conflict/expiry/unreadable-state behavior, nested
  frontmatter patching, `ssss new` scaffold validation, and dry-run import
  behavior.
- `docs/help/leases.md` and completed `IMPROVEMENTS` project documentation.
- Full package content for the `push` skill so skill conformance passes.

## [0.7.0] - 2026-07-02
### Changed
- **BREAKING: universal frontmatter enforcement** — every SSSS document primitive
  now requires `type`, `title`, `description`, and `timestamp`. Primitive-specific
  required fields still apply after these universal fields.
- Registry `spec_version` -> `0.6`; spec header -> v0.6 draft. Reference bundle
  metadata now targets SSSS core `0.6`.
- The reference engine, bundle validator, skill validator, runtime helpers,
  scaffold output, conformance fixtures, shipped skills, and reference bundle now
  share the universal metadata requirement.

### Added
- OKF compatibility guidance documenting `resource`, `tags`, and `aliases` as
  recommended discovery enrichment fields while keeping the mandatory universal
  metadata minimal and deterministic.
- Security hardening for the reference engine and CLI:
  - VFS paths now reject absolute, root, dot-segment, empty-segment, backslash,
    and directory targets.
  - `workspace_id`, `idempotency_key`, and role names are constrained to safe
    filesystem identifiers.
  - Idempotency replay is bound to a request hash; same-key/different-payload
    requests now fail as conflicts.
  - Leases fail closed when unreadable and no longer derive filenames directly
    from raw VFS paths.
  - Bundle validation rejects unsafe and duplicate file paths, and export refuses
    symlinked vault entries.
  - Autolink skips symlinked Markdown targets before `--write`.
  - Repo-local skill utility scripts avoid shell-string execution and validate
    write-target names.

## [0.6.0] - 2026-07-02
### Added
- **Workflow Runtime & Daemon Contract (spec §11.8)** — standardizes workflow
  trigger evaluation across daemon, cron, webhook, file-change, event, condition,
  and manual runtimes. Workflows own `triggers[]`; external schedulers are only
  wake-up mechanisms.
- **`@gregiteen/ssss-cli/runtime` helpers** — deterministic `planWorkflowTrigger()` and
  `createRunEnvelope()` helpers derive `workflow_triggered` events, task
  documents, and run documents through the Operation Contract.
- **Runtime conformance metadata/checks** — `conformance/fixtures.json` v1.3.0
  declares trigger/misfire/concurrency vocabularies and proves duplicate daemon
  ticks replay idempotently.

### Changed
- Registry `spec_version` -> `0.5`; spec header -> v0.5 draft. Reference bundle
  metadata now targets SSSS core `0.5`.

## [0.5.0] - 2026-06-25
### Added
- **`ssss new <dir>` scaffolder** — bootstrap a fresh SSSS-native repo in one command:
  a starter `vault/` of core primitives (incl. a `tenant_private` task to demonstrate
  the sale-drop), a dependency-free conformance test (`node --test`) that replays the
  canonical fixtures through the engine and round-trips the vault as a `sale` bundle,
  plus `package.json` (pinned to the matching `@gregiteen/ssss-cli` tag), `CLAUDE.md`, `README`,
  and `.gitignore`. Flags: `--with-total-recall` (wire the Total Recall memory OS),
  `--install` (npm install + Total Recall init + verify), `--ref`, `--name`, `--force`,
  `--no-git`. All shelling-out uses `execFileSync` with fixed argv (no shell). Docs:
  `ssss help scaffold`.

## [0.4.0] - 2026-06-24
### Added
- **The `.ucw` bundle format (spec §16, registry `bundle`)** — the canonical transportable
  package of a vault: a manifest plus path-sorted files, content-hashed for integrity. The
  manifest declares `ssss_core_version`, `required_extensions`, `export_profile`,
  `primitive_inventory` (registry-driven, replacing the legacy closed `categories` enum),
  `provisioning[]`, `parameters[]`, and `provenance{content_hash, exporter, signature?}`.
  Harvested from the legacy `WorkspaceVfsPackageService` and generalized to be portability-
  and registry-driven.
- **The provisioning contract (spec §17, registry `provisioning`)** — three deterministic,
  idempotent verbs: `export` (pure, profile-filtered), `provision` (params + link-integrity
  + id-remap → replayable envelope plan), `import` (engine replay, idempotent via
  idempotency_key). Adopts the legacy `WorkspaceProvisioningStep.mode`/`system` and
  `WorkspaceGraphEdge.relation` as the canonical binding/dependency vocabularies, plus
  `installMode` composition and structural-only `migration`+`patch` upgrades.
- **Reference engine for bundles (`src/bundle.mjs`)** — dependency-free `exportBundle`,
  `validateBundle`, `provisionBundle`, `importBundle` over the registry bundle schema.
- **Reference bundle (`conformance/reference-bundle.ucw.json`, "Festival in a Box")** — a
  real `sale`-profile bundle, built deterministically by `scripts/build-reference-bundle.mjs`.
  Proves the §5.5 keystone: structural + resource_bound files ship, the `tenant_private`
  ticket record is dropped. Round-tripped (validate → provision → import → re-import) by
  `ssss conformance --engine`; 6/6 bundle/provisioning checks pass alongside the 9 fixtures.
- **`language_convention` documented (spec §11.7)** — the extension-owned, `structural`
  presentation-overlay primitive, formally placed in the semantic layer.
- **CLI command surface for the full lifecycle** — `ssss export`, `validate`, `inspect`,
  `provision`, and `import` wire the bundle/provisioning verbs to the command line, plus
  `ssss help [topic]` serving offline docs from `docs/help/` and `ssss version`. Each
  command has its own `--help`. Shared parsing/formatting in `scripts/lib/cli.mjs`.
- **Open-source packaging** — `README.md`, `LICENSE` (ISC), `.gitignore`, and
  `package.json` metadata (`engines`, `repository`, `files`) so `@gregiteen/ssss-cli` is
  publishable and the runtime-read paths (`VERSION`, `docs/help`) ship in the tarball.

### Changed
- Registry `spec_version` → `0.4`; spec header + §14 → v0.4. Engine exports add `./bundle`.

## [0.3.0] - 2026-06-24
### Added
- **Portability classification (spec §5.5, registry `portability`)** — every document
  primitive now declares a portability class: `structural` (the sellable business model),
  `tenant_private` (the operator's private data, never sold), or `resource_bound` (needs a
  real resource bound at provision). Export profiles `backup | template | sale` are filters
  over these classes; `template`/`sale` exports MUST drop all `tenant_private` primitives.
  Files MAY override their type default with `x_portability`. Lifted and generalized from
  the legacy ad-hoc export filter in `WorkspaceVfsPackageService`.
- **`delete` envelope (spec §6.2)** — promoted from a host implementation into
  the canonical Operation Contract as the fourth envelope type. Removes a replace-type file,
  rejects append-type targets, and emits a deletion event for audit. Idempotent.
- **Reference engine (`src/engine.mjs`, `src/registry.mjs`, `src/frontmatter.mjs`)** — the
  canonical, dependency-free `@gregiteen/ssss-cli` Operation Contract engine. Harvested from total-recall
  (§6.3 pipeline, idempotency replay from the audit log, `buildRepair`/§9 repair blocks) and
  a host implementation (`delete` envelope, `resolveContainedPath` path-traversal guard, registry-driven
  content validation). Validates content against `registry/core.json` + `registry/extensions/*`
  with no per-type code and no Zod/YAML dependency. Runs all 9 conformance fixtures in-process
  via `ssss conformance --engine` (now wired into `npm test`).

### Changed
- Registry now defines **5 contract primitives** (added `delete`); `spec_version` → `0.3`.
- §5.1 Document Primitives table gains a **Portability** column.
