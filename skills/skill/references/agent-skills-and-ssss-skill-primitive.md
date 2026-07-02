# The open Agent Skills standard, and SSSS's `skill` primitive on top of it

## The open Agent Skills standard

Multiple agent tools (Claude Code among them) discover "skills" as a directory
containing a `SKILL.md` with YAML frontmatter. The standard's only two
required fields:

- `name` — matches the containing directory.
- `description` — trigger text; the tool uses this (not the body) to decide
  when to surface the skill to the model, so it must state both WHAT the
  skill does and WHEN to use it.

Everything else — body content, extra directories, extra frontmatter fields —
is unspecified by the open standard, which is exactly what makes it safe for
SSSS to layer a discriminator on top without breaking compatibility (extra
fields are simply ignored by tooling that doesn't know about them).

## SSSS's `skill` primitive (registry/core.json, spec §5.4)

```json
"skill": {
  "family": "capability",
  "canonical_filename": "SKILL.md",
  "append_only": false,
  "portability": "structural",
  "required_fields": ["type", "name", "description"],
  "notes": "Compatible with the open Agent Skills standard (name + description). The `type: skill` discriminator is REQUIRED for SSSS-managed manifests."
}
```

The only delta from the open standard is `type: skill`. That single field is
what lets an SSSS engine (`src/engine.mjs`) route a write to the right
validation path (`validateContent('skill', ...)`), classify its portability
(`structural` — skills ship in `template`/`sale` bundle exports, spec §5.5),
and let a conformance suite exercise it as a first-class primitive
(`conformance/fixtures.json` fixture-019 through fixture-021).

## Why this matters in practice

A SKILL.md with `type: skill` works identically for a plain Agent-Skills-only
tool (it ignores the field) and gets full SSSS conformance for free. A
SKILL.md WITHOUT `type: skill` works for the plain tool but silently fails
SSSS validation the moment anything tries to write/patch it through the
Operation Contract (`Missing required frontmatter field 'type'` — see
fixture-020). This repo shipped with every one of its own skills in the
second, broken state for a full session before the gap was caught — see this
skill's Changelog v2.1.0 entry.
