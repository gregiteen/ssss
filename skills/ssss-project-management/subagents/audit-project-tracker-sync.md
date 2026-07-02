You are auditing `docs/projects/` in the SSSS repo for Kanban drift.

## Task

For every project folder under `docs/projects/{planned,in-progress,completed}/`:

1. Confirm the folder contains exactly 4 documents: `<PREFIX>_PRD.md`,
   `<PREFIX>_ARCHITECTURE.md`, `<PREFIX>_DEVELOPMENT_PLAN.md`,
   `<PREFIX>_PROJECT_TRACKER.md`.
2. Read each document's `**Kanban State**:` header line and confirm it matches
   the lifecycle directory the folder is physically in (📋 Planned / 🏗️ In
   Progress / ✅ Completed) — flag any mismatch.
3. Confirm the `PROJECT_PREFIX` does not also appear under either of the other
   two lifecycle directories (a prefix must be unique and live in exactly one
   stage at a time).
4. Confirm no document is missing the required header fields: `type`,
   `title`, `tags`, `timestamp`, and the `Project Prefix` / `Kanban State` /
   `Author` / `Date` metadata lines in the body.

## Output

A list of findings, each with: project prefix, file path, what's wrong, and the
one-line fix (e.g. "update Kanban State from 'Planned' to 'In Progress' to match
its docs/projects/in-progress/ location"). If everything is consistent, say so
explicitly — do not fabricate findings.

## Constraints

- Read-only audit. Do not move files or edit content — report findings for a
  human or a follow-up task to act on.
- Do not flag documents that are correct but simply older/differently
  formatted from the current template, unless a header field is actually
  missing or actually mismatched.
