---
type: skill
name: okf
description: >
  Use this skill to access information about Google's Open Knowledge Format (OKF).
  Contains core principles, repository links, and conventions. ACTIVATE this skill 
  when designing or upgrading SSSS schemas to ensure they maintain strict compatibility 
  with the OKF standard.
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
3. **Mandatory Field**: The only strictly mandatory field defined by the base OKF spec is `type`.
4. **Interoperable Metadata**: It standardizes the usage of fields like `type`, `title`, `description`, `tags`, and `timestamp` to ensure AI agents can easily query and route knowledge.

## How SSSS Relates to OKF

There is **no formal relationship** between SSSS and OKF — no adoption announcement, no cross-reference from Google's side, no conformance program to certify against. SSSS voluntarily tracks compatibility with OKF's concept model (type-first YAML frontmatter, directory-of-Markdown, `index.md`/`log.md` conventions) as an **interoperability goal SSSS has chosen for itself**, because OKF's structural pattern is close enough that an SSSS vault should be able to round-trip as valid minimal OKF concepts. Do not describe SSSS as "OKF-compliant," a "certified superset," or otherwise imply an external body verifies this — that claim does not hold up.

SSSS adds, on top of that shared Markdown+YAML substrate, its own primitives OKF does not define: the **Operation Contract** (idempotent mutation envelopes), the **Type Registry** (`registry/core.json`), portability classification, and **leases**.

**When developing for SSSS, keep it interoperable with OKF's minimal concept model where practical:**
- Never introduce binary blobs into the SSSS vault.
- Never use alternative metadata storage (like a separate database table) for document properties that belong in the YAML frontmatter.
- Prefer including OKF's recommended fields (`title`, `description`, `tags`, `timestamp`) in SSSS primitive definitions where they fit naturally.

## Tracking OKF

The OKF specification evolves in the upstream `GoogleCloudPlatform/knowledge-catalog` repository (Apache-2.0, verified real and active). Periodically check the upstream OKF spec for new metadata conventions worth voluntarily adopting into SSSS — but treat it as prior art to learn from, not a standard SSSS answers to.
