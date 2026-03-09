# Current State

## Snapshot

This repository now has a minimal but real operator loop for one repo-local Codex session. The codebase is still early, but init, spawn, readiness-aware status with unread-mail visibility, stop, events with explicit selector disambiguation, durable mail with unread consumption plus both full-history and unread-only read-only inspection, and a narrow merge path for the documented reintegration workflow all exist end-to-end. Session records now also retain the original merge target branch so later recovery does not depend on drifted config.

## What Exists

- TypeScript Node CLI scaffold
- `sy` entrypoint with command registration
- implemented `sy init`
- implemented `sy events`
- implemented `sy status`
- implemented `sy sling`
- implemented `sy stop`
- implemented `sy merge`
- implemented `sy mail send`
- implemented `sy mail check`
- implemented `sy mail list`
- implemented read-only unread-only mailbox inspection via `sy mail list --unread`
- repo root detection that handles nested directories and git worktrees
- canonical branch detection that prefers `origin/HEAD`
- config loading that normalizes `project.root` to the canonical repo root
- `.switchyard/` bootstrap for directories and placeholder database files
- session store with schema ownership for `sessions.db`
- mail store with schema ownership for `mail.db`
- event store with schema ownership for `events.db`
- session records that now retain the spawned runtime pid
- session records that now retain the original canonical branch as `baseBranch`
- session records that distinguish launch-time `starting` from confirmed `running`
- worktree manager with deterministic branch and path naming
- narrow Codex runtime seam that builds and spawns one detached command
- initial readiness waiting that requires the spawned Codex process to survive a short launch window before the session is marked usable
- narrow process liveness and stop helpers for detached Codex sessions
- durable lifecycle event appends around `sy sling`, `sy stop`, `sy mail send`, `sy mail check`, and `sy mail list`
- spawn lifecycle events that now distinguish `sling.spawned` from `sling.completed`
- durable runtime reconciliation events for `runtime.ready`, `runtime.exited_early`, and `runtime.exited`
- first operator-facing event inspection path over `events.db`
- explicit selector disambiguation in `sy events` when one raw selector could name different session-id, agent-name, or orphaned-event targets
- first operator-facing merge path that preflights active sessions, dirty preserved worktrees, and dirty repo-root state before running `git merge --no-ff`
- merge and merged-cleanup guards that now refuse to silently retarget preserved work when the configured canonical branch changes after launch
- first operator-facing cleanup guard that only removes preserved merge artifacts automatically when the branch is confirmed merged, and otherwise requires explicit `--abandon`
- status output that now joins each session to its latest durable event context, including the recorded readiness delay for fresh launches
- status output that now also surfaces unread mail counts so operators can spot pending mailbox work without checking each session individually
- merge lifecycle events for `merge.completed`, `merge.failed`, and `merge.skipped`
- first-readiness reconciliation in `sy status` that promotes launched sessions to `running` or marks them failed with a durable reason
- explicit v0 decision to keep runtime control pid-backed and defer tmux unless operator workflows require attach or transcript handling
- documented first merge and reintegration workflow that keeps the initial contract manual-first and git-native
- regression tests around config/root behavior, worktree creation, session persistence, mail, stop, and command parsing

## What Does Not Exist Yet

- interactive runtime attach or transcript capture
- conflict reporting beyond normal git behavior
- automatic cleanup after merge

## Current Command Surface

- `sy init`
  - works inside a git repository
  - writes `.switchyard/config.yaml`
  - creates the initial `.switchyard/` layout
- `sy events [session]`
  - loads config from the canonical repo root
  - prints the recent durable event timeline from `events.db`
  - optionally scopes the recent view to one resolved session
  - rejects ambiguous selectors when one raw value could refer to different session-id, agent-name, or orphaned-event targets
  - prints an empty-state message when no events exist
- `sy sling [args...]`
  - requires an agent name
  - creates one deterministic branch under `agents/`
  - creates one worktree under `.switchyard/worktrees/`
  - spawns one Codex process from that worktree
  - persists the original canonical branch as session `baseBranch`
  - records `sling.spawned` once the runtime pid exists
  - waits for one short initial readiness window before persisting the session as `starting`
  - records `sling.completed` after that launch window succeeds, including `readyAfterMs`
  - records `sling.failed` when the runtime exits during that launch window
- `sy status [args...]`
  - loads config and session state
  - promotes `starting` sessions to `running` when the pid survives the first liveness check
  - marks early-dead `starting` sessions as `failed`
  - marks obviously stale `running` pid-backed sessions as `failed`
  - prints an empty-state message when no sessions exist
  - prints a tab-separated session table ordered by most recent update
  - includes one unread-mail count per session from `mail.db`
  - includes one concise recent-event summary per session when event history exists, including `readyAfterMs` for fresh `sling.completed` events
  - records runtime reconciliation events when it changes session state
- `sy stop <session>`
  - resolves one session by id or normalized agent name
  - stops one active pid-backed runtime and updates durable session state
  - preserves the worktree by default so the operator can review or merge the branch later
  - still stops active sessions when `--cleanup` is requested, even if cleanup is later refused
  - removes the worktree and branch when `--cleanup` is passed only if the preserved branch is confirmed merged into the session's stored `baseBranch`
  - refuses plain merged-cleanup for legacy rows that do not have stored `baseBranch` metadata
  - requires `--cleanup --abandon` to discard preserved work that is not confirmed merged
  - reports when preserved cleanup artifacts were already absent instead of claiming removal
- `sy merge <session>`
  - resolves one session by id or normalized agent name
  - refuses active sessions so merge only runs against preserved work
  - refuses legacy rows that do not have stored `baseBranch` metadata
  - refuses to silently retarget preserved work when the session `baseBranch` disagrees with the current configured canonical branch
  - verifies the preserved worktree path still resolves to the expected git worktree root
  - refuses dirty preserved worktrees so uncommitted agent changes are resolved before merge or cleanup
  - requires the repo root worktree to be clean before it switches to the configured canonical branch
  - verifies the preserved local `agents/*` branch still exists
  - runs `git merge --no-ff <branch>` from the canonical repo root worktree
  - records `merge.completed` on success, `merge.failed` when git stops in a conflict state, and `merge.skipped` when the branch is already integrated
  - leaves review, conflict resolution, validation, and cleanup explicit for the operator
- `sy mail send <session> <body>`
  - resolves one session by id or normalized agent name
  - writes one durable message into `mail.db`
  - defaults the sender to `operator`
- `sy mail check <session>`
  - resolves one session by id or normalized agent name
  - reads unread mail for that session in creation order
  - marks returned messages as read
- `sy mail list <session>`
  - resolves one session by id or normalized agent name
  - prints the full mailbox for that session in creation order
  - supports `--unread` to print only unread mail without consuming it
  - leaves read/unread state unchanged
  - rejects ambiguous selectors that would match different sessions by id and agent name

## Current Merge Workflow

- stop the session without `--cleanup` if it is still active
- inspect status, events, mail, and the preserved worktree as needed
- run `sy merge <session>` to execute the documented repo-root merge path against the configured canonical branch
- if git reports conflicts, resolve them manually or abort with git from the repo root
- run `sy stop <session> --cleanup` after the merged result is validated
- run `sy stop <session> --cleanup --abandon` only after an explicit discard decision

## Current Risks

- `src/config.ts` is carrying both config logic and git root-resolution behavior; that should eventually split once lifecycle code grows further.
- `node:sqlite` is still experimental in Node 25, so the SQLite choice may need revision if core API churn becomes painful.
- there is no end-to-end test around `sy init`.
- older session rows created before `baseBranch` was added now fail closed for `sy merge` and plain merged-cleanup, so operators must use manual git review/merge or explicit `--abandon`
- the current readiness model is intentionally narrow: `sy sling` only proves the process survived a short launch window, and `sy status` promotes the session to `running` on the first later successful pid liveness check.
- the current runtime-control model intentionally omits live attach and transcript capture, so debugging still relies on durable events and external process inspection.
- the readiness signal is intentionally narrow: surviving the first launch window proves only that the process stayed alive briefly, not that Codex completed a richer handshake.
- older pre-pid session rows cannot be liveness-checked automatically.
- the merge and cleanup paths are intentionally narrow: they preflight obvious unsafe states and keep review, conflict resolution, post-merge validation, and explicit abandon decisions manual-first.

## Recommended Next Task

Validate whether the current `sy events` or merge inspection paths need one more narrow operator-facing diagnostic improvement:
- prefer clearer operator-readable inspection over broader automation
- keep the change narrow and grounded in the current single-repo lifecycle

The mail question is now resolved narrowly enough for the current loop, and `sy status` now surfaces unread mailbox counts directly. The next slice should stay equally small and avoid broader automation without clear operator pressure.

## How To Use This File

Update this document whenever one of these changes:
- a placeholder command becomes real
- a new subsystem starts owning persistent state
- an important architectural assumption is changed
- the recommended next task changes

For scope control across sessions, keep `docs/focus-tracker.md` aligned with the real implementation state.
