---
type: project_document
title: CAPABILITY_PROVISIONING_CONTRACT — PRD
tags: ["project-management", "CAPABILITY_PROVISIONING_CONTRACT"]
timestamp: 2026-09-26T00:00:00Z
---

# CAPABILITY_PROVISIONING_CONTRACT — PRD

> **Project Prefix**: `CAPABILITY_PROVISIONING_CONTRACT`
> **Kanban State**: 📋 Planned
> **Author**: Claude (Opus 5.5) with Greg Iteen
> **Date**: 2026-09-25

---

## Problem

The [audit](CAPABILITY_PROVISIONING_CONTRACT_AUDIT.md) found seven defects (D1–D7) and five spec gaps (G1–G5). They block Total Recall from turning a capability bundle into a working, upgradeable install in a new or existing SSSS app. The provisioning half of §16–§17 was specified but only partly implemented.

## Goal

Make `provision → import → upgrade` do what §16–§17 promise, deterministically, and give non-JavaScript hosts and SQL projections a conformance path. Total Recall's composer should be able to rely on SSSS instead of re-implementing any of it.

## In scope

1. Fix `registry compose` (D1) with a CLI regression test.
2. Specify parameter binding (G1), then implement it (D2).
3. Specify the deterministic id map (G2), then implement slug, workspace-id, and link remapping, with link integrity checked against the **remapped** target (D3).
4. Emit resource bindings in the provision result (D4).
5. Resolve `required` dependencies before the bundle and report `optional`/`recommended` ones (D5).
6. Add an upgrade verb: `migration` primitive plus structural-only `patch` envelopes, refusing any `tenant_private` write (D6).
7. Make `ssss new --with-total-recall --install` initialize a project brain (D7).
8. Specify an HTTP/JSON wire contract over the kernel, add conformance cases, and ship a small reference server so non-JavaScript hosts can run the same fixtures (G3).
9. Add a projection-adapter conformance suite: rebuild from canonical state, drift detection, replay. The reference in-memory adapter must pass it (G4).
10. Decide on path-scoped grants (G5). Either add them to the authorizer and spec, or document that plugin isolation is by type namespace and justify it.

## Out of scope

- A physical alternate canonical store.
- Any Total Recall, festech-modular, or plugin code.
- Hosted mesh or marketplace concerns.

## Success criteria

| ID | Verifiable outcome |
| --- | --- |
| S1 | `ssss registry compose --extension <file>` prints the composed registry. A regression test covers it. |
| S2 | Provisioning the reference bundle twice into different workspaces gives two self-consistent instances. Parameter values appear where the spec says, no id or link aliases the source, and every internal link resolves in the target. |
| S3 | Provisioning is deterministic: the same bundle, parameters, and target produce a byte-identical plan. Re-importing is a no-op. |
| S4 | A bundle with a `required` dependency fails clearly if it is missing and installs it first if it is supplied. |
| S5 | An upgrade fixture changes structural documents, leaves `tenant_private` documents untouched, and is rejected if it tries to write one. |
| S6 | `ssss new x --with-total-recall --install` produces `x/.agent/skills/total-recall/` (a project brain) and does not modify the global brain. |
| S7 | The reference HTTP server passes the canonical conformance suite through `ssss conformance --endpoint`, using only the documented wire contract. `ssss bridge` passes the same suite over stdin, and Dabber CRM runs on it unchanged in behavior. |
| S8 | The projection conformance suite passes for the reference adapter. A deliberately drifted projection is detected. |
| S9 | The grant decision (G5) is recorded in the spec and covered by fixtures. |
| S10 | Spec, `registry/core.json`, `src/`, and `conformance/fixtures.json` agree, and the full code-quality tier passes. |

## Priority

P0: D2, D3, and D6, because silent aliasing and upgrades that could touch `tenant_private` data are unsafe published contracts. P1: D1, D4, D5, D7, G3, G4. P2: G5, if the type-namespace isolation is documented as sufficient.

## Dependencies and risks

- Changing the bundle or provision output is a contract change for existing hosts (Total Recall, UltraChat, Festech). It needs a minor version bump and release notes. Existing `.ucw` bundles without parameter bindings must keep provisioning unchanged.
- G1 and G2 are spec decisions. Settle them before writing code.
