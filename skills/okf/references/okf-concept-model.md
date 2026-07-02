Source: https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md
(Cached summary — check the source for the current, authoritative text.)

# OKF concept model, summarized

OKF (Open Knowledge Format), announced by Google Cloud June 2026, formalizes the
"LLM-wiki" pattern: organizational knowledge as a directory of plain Markdown
files with YAML frontmatter, designed to be readable by humans, LLMs, and tooling
without an SDK.

## What OKF actually requires

- A bundle is a directory tree of `.md` files. No binary blobs, no external
  database.
- Every file has YAML frontmatter. The **only** strictly mandatory field is
  `type`.
- Recommended (not required) fields: `title`, `description`, `tags`,
  `timestamp` — these make the bundle queryable/routable without parsing body
  text.
- Progressive disclosure via `index.md` files: directories MAY carry a
  frontmatter-less `index.md` as a table of contents.

## What OKF does NOT define

OKF has no concept of:
- A mutation contract (how a write is proposed, validated, committed).
- A type registry with required-field enforcement per type.
- Portability/sharing classes for which documents are safe to export.
- Concurrency control (locks/leases) for concurrent writers.

These are exactly SSSS's four differentiators on top of the shared Markdown+YAML
substrate — see `docs/ssss-spec.md` §5 (Type Registry), §6 (Operation Contract),
§5.5 (Portability), §7 (Leases).

## The relationship, precisely

There is no formal partnership, adoption, or cross-reference between SSSS and
OKF. SSSS voluntarily targets structural compatibility with OKF's minimal
concept model as an interoperability goal SSSS chose for itself — not because
any external body requires or certifies it. Never describe SSSS as
"OKF-compliant" or "OKF-certified" — that claim doesn't hold up to scrutiny and
this skill exists partly to stop that claim from re-appearing (see
`evals/evals.json`).
