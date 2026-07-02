# Kanban lifecycle for docs/projects/

Three physical directories under `docs/projects/` ARE the Kanban board — there is
no separate status field to trust over the folder location:

| Directory | Kanban State (in every doc's header) |
|---|---|
| `docs/projects/planned/<PREFIX>/` | 📋 Planned |
| `docs/projects/in-progress/<PREFIX>/` | 🏗️ In Progress |
| `docs/projects/completed/<PREFIX>/` | ✅ Completed |

## Moving a project between stages

1. Move the **entire folder**, not individual files:
   `mv docs/projects/planned/<PREFIX> docs/projects/in-progress/<PREFIX>`
   (or `git mv` if the folder is already tracked).
2. Update the **Kanban State** line in all 4 documents to match the new stage.
   These two steps happen in the same change — a folder move with stale Kanban
   State lines is a drift bug (exactly the kind the SSSS conformance mandate
   warns about elsewhere in this repo).
3. If moving into `docs/projects/planned/`, ensure the previous stage's now-empty
   directory is removed (`rmdir`) rather than left as a stray empty folder.

## Why folders, not a status field

A loose `status: planned` frontmatter field can drift from reality silently — an
agent reads stale state and makes a wrong call about what's active. A directory
move is a single, visible, hard-to-miss action that both a human skimming
`docs/projects/` and an agent doing a `find`/`ls` see identically. This mirrors
SSSS's own preference for structural signals (portability classes, canonical
filenames) over soft convention where possible.
