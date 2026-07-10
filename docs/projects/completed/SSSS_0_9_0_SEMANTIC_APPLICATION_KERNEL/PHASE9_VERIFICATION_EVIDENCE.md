# Phase 9 Verification Evidence — SSSS 0.9.0

> Date: 2026-07-10  
> Package: `@gregiteen/ssss-cli@0.9.0`  
> Operator: automated agent session (Grok Build)

## Reference package (clean checkout)

| Check | Result |
|-------|--------|
| `npm test` (full conformance + engine) | **PASS** — fixtures 24/24, runtime 8/8, regression 7/7, extensions 7/7, semantic 12/12, kernel/adapter/UI **47/47**, bundle 14/14, CLI smoke 7/7 |
| Version in package.json | `0.9.0` |
| Changelog | `[0.9.0]` section present |

## Packed release candidate

| Check | Result |
|-------|--------|
| `npm pack` | `gregiteen-ssss-cli-0.9.0.tgz` (137.8 kB, 70 files, shasum `6bc5fa3d80aa3203c4e8298529ccf3ac1e0c01f0`) |
| Clean install from tarball | **PASS** — reports version `0.9.0` |
| Exports resolvable | kernel, vfs, registry, validator, guard, ui, events, idempotency, leases, projections, primitive, http, authorization |
| Adapter contracts from install | idempotency + lease **PASS** |
| `ssss adapter conformance` | machine-readable green report |
| `ssss --version` | `0.9.0` |
| `npm audit` (after lockfile) | **0 vulnerabilities** |

## Migration

| Check | Result |
|-------|--------|
| `ssss new` starter vault | **PASS** |
| `ssss migrate 0.8-to-0.9 <vault>` dry-run | **PASS** — backup_manifest emitted, `writes_performed: 0` |

## Cross-host command corpus

| Check | Result |
|-------|--------|
| `node scripts/phase9-cross-host-corpus.mjs` | **6/6 PASS** |
| Report artifact | `artifacts/phase9-cross-host-corpus.json` |
| Cases | create, idempotent replay, conflict, dry-run, multilingual rule, missing actor deny |

## Host adapter contract suites

| Host | Suite | Result |
|------|-------|--------|
| Total Recall | `ssss-kernel-bridge.spec.mjs` | **13/13 PASS** (default `kernel-core`) |
| Festech | kernel bridge + SQL adapters | **21/21 PASS** (default `kernel-low-risk`) |
| UltraChat | kernel + package contracts + durable | **29/29 PASS** (default `kernel-low-risk`) |

## Security / adversarial (package suite)

Covered by the 47 kernel/adapter/UI checks including:

- lease missing/mismatch/expiry/unreadable
- path/symlink VFS refusal
- CAS no partial write
- policy floors fail-closed
- UI prompt-injection redaction + fallback
- direct-write guard

## Host mutation authority

| Host | Default kernel mode | Legacy path | Direct-write detector |
|------|---------------------|-------------|------------------------|
| Total Recall | `kernel-core` | removed | yes |
| Festech | `kernel-low-risk` | retained for product types | yes |
| UltraChat | `kernel-low-risk` | retained for product types | yes |

## Deferred (not release-blocking)

See `docs/projects/DEFERRED_BACKLOG.md`:

- Live production Supabase soak (UltraChat ops)
- Full host local-pipeline deletion (Festech/UltraChat product projections)
- Full removal of host-copied validators after longer soak
- 0.8.0 npm deprecation policy application (post-publish verification)


## Publish gate

| Check | Result |
|-------|--------|
| Registry version | `@gregiteen/ssss-cli@0.9.0` published 2026-07-10T20:51:41Z |
| Clean `npm install @gregiteen/ssss-cli@0.9.0` | **PASS** — version 0.9.0; kernel + adapter contracts green |
| Deprecate 0.8.0 | **DONE** — message points to 0.9.0 shared kernel |
| Re-publish 0.9.0 | Skipped — version already on registry (cannot overwrite) |
