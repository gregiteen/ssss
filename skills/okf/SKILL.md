---
type: skill
title: OKF Compatibility
name: okf
description: >
  Use this skill to access information about Google's Open Knowledge Format (OKF).
  Contains core principles, repository links, and conventions. ACTIVATE this skill 
  when designing or upgrading SSSS schemas to ensure they maintain strict compatibility 
  with the OKF standard.
timestamp: 2026-07-02T00:00:00Z
---

# Google Open Knowledge Format (OKF)

> OKF is a vendor-neutral, lightweight open specification introduced by Google Cloud in June 2026.
> It formalizes the "LLM-wiki" pattern by organizing organizational knowledge as a directory of standard Markdown files.

## Official Resources

- **GitHub Repository**: [GoogleCloudPlatform/knowledge-catalog](https://github.com/GoogleCloudPlatform/knowledge-catalog)
- **OKF Specification**: [SPEC.md](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md)
- **Announcement**: [Google Cloud blog, 2026-06-12](https://cloud.google.com/blog/products/data-analytics/how-the-open-knowledge-format-can-improve-data-sharing)

*(Note: Do not confuse this with the Open Knowledge Foundation. This is the technical spec for AI agent context.)*

## Core Characteristics

OKF solves the "context problem" for AI agents by providing a unified, interoperable format that can be consumed by various systems, LLMs, and humans alike without needing complex translation or SDKs.

1. **Simple Structure**: An OKF bundle is simply a directory of standard Markdown files.
2. **YAML Frontmatter**: Every file MUST include YAML frontmatter.
3. **Mandatory Field**: The base OKF spec requires `type`; Google's reference tooling also validates `title`, `description`, and `timestamp`.
4. **Interoperable Metadata**: SSSS treats `type`, `title`, `description`, and `timestamp` as mandatory universal metadata, with `resource`, `tags`, and `aliases` as portable enrichment fields.

## How SSSS Relates to OKF

There is **no formal relationship** between SSSS and OKF — no adoption announcement, no cross-reference from Google's side, no conformance program to certify against. SSSS targets OKF v0.1 compatibility as a first-class interoperability requirement: every SSSS document primitive must carry `type`, `title`, `description`, and `timestamp`, and OKF export surfaces must be plain Markdown directory trees using OKF reserved `index.md` / `log.md` semantics.

SSSS adds, on top of that shared Markdown+YAML substrate, its own primitives OKF does not define: the **Operation Contract** (idempotent mutation envelopes), the **Type Registry** (`registry/core.json`), portability classification, and **leases**.

**When developing for SSSS, keep it interoperable with OKF's concept model:**
- Never introduce binary blobs into the SSSS vault.
- Never use alternative metadata storage (like a separate database table) for document properties that belong in the YAML frontmatter.
- Always include `type`, `title`, `description`, and `timestamp`; prefer `resource`, `tags`, and `aliases` when they fit naturally.

## Tracking OKF

The OKF specification evolves in the upstream `GoogleCloudPlatform/knowledge-catalog` repository (Apache-2.0, verified real and active). Periodically check the upstream OKF spec for new metadata conventions worth voluntarily adopting into SSSS — but treat it as prior art to learn from, not a standard SSSS answers to.
