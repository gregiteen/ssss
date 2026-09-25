# code-quality architecture — why v3 looks like this

## The incident (2026-08-17)

The laptop was unusable. Load average **644** on a 4-core / 8 GB machine, swap
at 4.5 GB of 5 GB, 250 million swapins.

Cause: **14 orphaned `continuous-checker-ts.mjs` daemons**, all parented to
PID 1, each spawning its own `npm exec tsc --noEmit` — **13 concurrent full
TypeScript compiles** of an 11-package monorepo, each authorized
`--max-old-space-size=6144` on an 8 GB box.

They had accumulated over about an hour: one new daemon every few minutes,
none ever exiting.

## The five bugs

**1. The reaper was fail-open and had never once worked.**
`cleanupStaleTscProcesses()` shelled out to `ps`. That spawn threw `EPERM`
every time — the daemon was spawned detached from a sandboxed agent session and
inherited a profile that denied exec'ing `/bin/ps`. The `catch` logged a warning
and `start()` continued anyway.

```
79 × "Failed to scan for stale TypeScript children: spawn EPERM"
 0 × "Reaped stale TypeScript child PID ..."
```

First entry 2026-08-06, last 2026-08-17. Ten days, zero successful reaps.

**2. The match patterns could not hit a pnpm monorepo.** It looked for
`<ROOT>/node_modules/typescript/bin/tsc`, but each `tsc` ran with `cwd` set to
its own package, so npx resolved `apps/web/node_modules/.bin/../typescript/bin/tsc`.
`includes()` never matched. It also looked for `<ROOT>/server/...`, a path that
did not exist in that repo — leftover from a different repo's layout.

**3. It never targeted sibling daemons.** It only ever looked for `tsc`
binaries. The 14 daemons were never in scope. Worse: had the patterns matched,
each new daemon would have SIGKILLed the *live* children of running siblings,
which would immediately respawn them — a churn loop.

**4. The PID guard was a fail-open TOCTOU race.** `start-here-ts.mjs` checked
`isCheckerRunning()`, then spawned detached — but the child only wrote its PID
file *after* the `ps` scan. Every invocation inside that window saw "not
running" and spawned. They all wrote the same single-slot PID file; last writer
won, and every earlier daemon became permanently invisible to future checks.

**5. `cleanup()` unlinked the PID file unconditionally.** When one daemon
auto-stopped after 3 identical passes, it deleted the *shared* PID file while
13 others were still alive → the next invocation saw nothing → spawned another.
That was the ratchet from 1 to 14.

## What v3 changes

**One-shot, not a daemon.** The harness runs background jobs and wakes the agent
when they exit. A detached forever-loop was solving a problem that no longer
exists — and solving it badly, because its report had no causal relationship to
any particular edit.

**Causality over concurrency.** The report records `startedAt`. `report.mjs`
stats every tracked source file and names the ones modified since. "Is this
stale?" became a question with an answer, which retired an entire genre of
warning banner (`LAW 5 MANDATE: NEVER WAIT`, `DO NOT FREAK OUT`, the
don't-poll-immediately rule).

**Fail-closed locking.** A lock is honored only when the PID is alive **and**
its command line still contains this program's path tail. If the command line
cannot be read, the lock is honored and the run refuses to start. This mirrors
`shouldHonorPidLock()` in Total Recall core (3.23.0/3.23.1), added after stale
PID files pointed at `metrickitd` and a crashpad handler. Refusing to start is
recoverable; two writers are not.

**A machine-wide lock.** Six repos share one laptop. The global lock at
`~/.agent/skills/code-quality/.global-check.lock` means only one check runs
anywhere at a time.

**Tiers.** `fast` (default) is typecheck/lint/grep/registry-validate. `full`
adds conformance and contract suites. `remote` is builds and monorepo test runs
that belong on the Mac Mini or droplet. Skipped gates are always reported, so a
bounded run can never read as full coverage.

**Ownership.** Background jobs are owned by the session that launched them and
die with it. Orphans were not a locking bug so much as a consequence of nobody
owning the process.

## What v3 deliberately kept

The v2 system's real insight was never the daemon — it was the **work queue**:
group findings by file, sort worst-first, show the top few, page to the next.
That is a pure function of tool output and survives unchanged in `report.mjs`.

## The other failure v3 addresses

The v2 skill was blind-synced into every repo regardless of stack. `moogie_crm`
is a **Python** project — flake8, mypy, `.venv`, no `package.json` anywhere —
and the sync deleted its `format.py` and `lint.py` and replaced them with
TypeScript daemons that could never run. `total-recall` and `portfolio-site`
declare neither `typescript` nor `eslint` and still carried full `tsc` checkers.

Hence: the engine is shared, the **gate list is repo content**. `config.json`
and each repo's SKILL.md are tailored. `detect.mjs` only proposes a starting
point — it is explicitly not the source of truth.
