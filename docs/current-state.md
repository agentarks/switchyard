# Current State

## Snapshot

This repository now has a minimal but real operator loop for one repo-local Codex session. The codebase is still early, but init, spawn, status, stop, and basic durable mail all work end-to-end.

## What Exists

- TypeScript Node CLI scaffold
- `sy` entrypoint with command registration
- implemented `sy init`
- implemented `sy status`
- implemented `sy sling`
- implemented `sy stop`
- implemented `sy mail send`
- implemented `sy mail check`
- repo root detection that handles nested directories and git worktrees
- canonical branch detection that prefers `origin/HEAD`
- config loading that normalizes `project.root` to the canonical repo root
- `.switchyard/` bootstrap for directories and placeholder database files
- session store with schema ownership for `sessions.db`
- mail store with schema ownership for `mail.db`
- event store with schema ownership for `events.db`
- session records that now retain the spawned runtime pid
- worktree manager with deterministic branch and path naming
- narrow Codex runtime seam that builds and spawns one detached command
- narrow process liveness and stop helpers for detached Codex sessions
- durable lifecycle event appends around `sy sling`, `sy stop`, `sy mail send`, and `sy mail check`
- regression tests around config/root behavior, worktree creation, session persistence, mail, stop, and command parsing

## What Does Not Exist Yet

- tmux control
- event inspection commands
- merge workflow

## Current Command Surface

- `sy init`
  - works inside a git repository
  - writes `.switchyard/config.yaml`
  - creates the initial `.switchyard/` layout
- `sy sling [args...]`
  - requires an agent name
  - creates one deterministic branch under `agents/`
  - creates one worktree under `.switchyard/worktrees/`
  - spawns one Codex process from that worktree
  - persists one session record as `running`
- `sy status [args...]`
  - loads config and session state
  - marks obviously stale `running` pid-backed sessions as `failed`
  - prints an empty-state message when no sessions exist
  - prints a tab-separated session table ordered by most recent update
- `sy stop <session>`
  - resolves one session by id or normalized agent name
  - stops one pid-backed runtime and updates durable session state
  - preserves the worktree by default
  - removes the worktree and branch when `--cleanup` is passed
- `sy mail send <session> <body>`
  - resolves one session by id or normalized agent name
  - writes one durable message into `mail.db`
  - defaults the sender to `operator`
- `sy mail check <session>`
  - resolves one session by id or normalized agent name
  - reads unread mail for that session in creation order
  - marks returned messages as read

## Current Risks

- `src/config.ts` is carrying both config logic and git root-resolution behavior; that should eventually split once lifecycle code grows further.
- `node:sqlite` is still experimental in Node 25, so the SQLite choice may need revision if core API churn becomes painful.
- there is no end-to-end test around `sy init`.
- the current stop path is pid-based only; tmux-backed control is still deferred.
- older pre-pid session rows cannot be liveness-checked automatically.

## Recommended Next Task

Expose the first operator-facing event read path:
- add one narrow CLI inspection view over recent durable lifecycle events
- keep the event model and output intentionally small
- improve diagnosis without broadening runtime control yet

That would let operators answer "what just happened?" from the CLI instead of reading SQLite state directly.

## How To Use This File

Update this document whenever one of these changes:
- a placeholder command becomes real
- a new subsystem starts owning persistent state
- an important architectural assumption is changed
- the recommended next task changes
