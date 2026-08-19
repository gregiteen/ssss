---
type: skill
title: SSSS Protocol Reference
name: ssss
description: "Use this skill when reading, writing, parsing, validating, or extending SSSS -- the Structured Semantic Syntax System: the SSSS Core Contract API, VFS-native primitives, operation/patch/event envelopes, leases, and projections. MANDATORY: You MUST read the full SKILL.md file before executing."
timestamp: 2026-07-15T00:00:00Z
---

# SSSS — Structured Semantic Syntax System Reference

You are operating in a repository that implements, extends, or relies on the **Structured Semantic Syntax System (SSSS)**. SSSS is a database-free, Markdown-first schema and mutation contract for AI-agent state.

This skill provides the normative rules for interacting with an SSSS-compliant vault or host engine (like Total Recall). 

## ⚠️ The VFS-First Mandate (Absolute Rule)

**NEVER use raw database inserts, updates, or deletes to mutate application state in an SSSS environment!**

All persistent state (memories, agents, workflows, tasks) lives in the Virtual File System (VFS) as Markdown files with YAML frontmatter. The VFS is the absolute source of truth. 
- If you are interacting via CLI: Use `npx total-recall remember` or `npx total-recall recall`.
- If you are building host code: You must route mutations through the SSSS **Operation Contract** engine (which handles idempotency, leasing, and semantic indexing), or use the provided API wrappers. Do not bypass the engine to write files directly.

## SSSS Core Concepts

### 1. Primitives (The Data Model)
Data in SSSS is defined by standard primitives (e.g. `workflow`, `assistant`, `skill`, `memory`). Each primitive has a defined schema (in `registry/core.json` or extension registries) and belongs to a specific Portability Class:
- `structural`: Logic and system prompts (e.g. rules, workflows). Included in export templates.
- `tenant_private`: User data (e.g. chats, tasks). NEVER included in templates.
- `resource_bound`: Requires external setup (e.g. Twilio numbers). Exported only as a requirement.

### 2. The Operation Contract (Envelopes)
When an SSSS engine processes a write, it receives an **Envelope**:
- `operation`: Creates or completely replaces a document.
- `patch`: Merges partial data into a document (e.g. updating task status).
- `event`: Appends an immutable log entry to a document.
- `delete`: Tombstones a replace-type document.

### 3. Idempotency and Leases
- **Idempotency**: All mutations must provide an `idempotency_key`. The engine ensures duplicate submissions do not result in duplicate state.
- **Leases**: Background tasks and workflows use the Lease store to acquire temporary locks on documents to prevent race conditions during execution.

### 4. Bundles (.ucw)
An SSSS vault can be packaged into a `.ucw` (Universal Containerized Workspace) bundle. A bundle is a portable snapshot containing a manifest, deterministic file paths, and content hashes for cryptographic integrity.

## Validation 

If you are writing tests or schemas in a host repository, ensure that:
1. `MemoryNodeSchema` validations provide all required SSSS v2 properties (`status`, `created`, `updated`, `last_accessed`, `source`, `decay`).
2. Schema changes maintain strict compatibility with the Open Knowledge Format (OKF) standard if applicable.
