---
type: technical_overview
title: Quickstart
description: Introduction to using SSSS as a database-free, Markdown-first schema and mutation contract for AI-agent state.
tags: [ssss, quickstart]
sources:
  - id: openwiki-source-23775c3de52f3ab95a13cb8b
    resource: repo://README.md
generated: { by: "openwiki/0.7.3", at: "2026-11-03T07:15:54.702Z" }
---

# Quickstart

SSSS (Structured Semantic Syntax System) is a vendor-neutral standard for portable AI memory and state. This guide will help you get started with its core concepts and functionality.

## Core Features

SSSS provides:

- **Document primitives**: Typed Markdown files with YAML frontmatter
- **Operation Contract**: Four envelope types for mutating a vault
- **Workflow Runtime Contract**: Idempotent event/task/run envelopes
- **Multilingual semantic runtime**: Deterministic lexical evidence and runtime rendering
- **Portability classification**: Primitive categorization for safe vault sharing
- **Bundle format and provisioning**: Package and deploy vaults across environments

## Getting Started

### Installation
```bash
npm install -g @gregiteen/ssss-cli
```

### Creating a New Project
```bash
ssss new my-app --install
```
This scaffolds a starter vault and runs conformance tests.

### Key Commands

| Command | Purpose |
|---------|---------|
| `ssss primitive <verb>` | Manage primitive definitions |
| `ssss export <vault>` | Create a portable bundle |
| `ssss import <bundle>` | Deploy a bundle into a vault |
| `ssss semantic <vault>` | Build semantic index |

<!-- openwiki: broken internal link [../architecture.md] file "../architecture.md" does not exist. Fix the href or restore the target, then delete this comment. -->
For more details, see the [Architecture Overview](../architecture.md).

## Next Steps

- Explore the vault structure
- Review the specification
- Run conformance tests

Start building your SSSS-powered AI applications today!
