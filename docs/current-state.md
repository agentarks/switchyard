# Current State

## Snapshot

This repository now has a minimal but real operator loop for one repo-local Codex session. The codebase is still early, but init, spawn, status, stop, and basic durable mail all work end-to-end.

## What Exists

- TypeScript Node CLI scaffold
- `sy` entrypoint with command registration
- implemented `sy init`
- implemented `sy events`
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
- initial readiness waiting that requires the spawned Codex process to survive a short launch window before the session is marked usable
- narrow process liveness and stop helpers for detached Codex sessions
- durable lifecycle event appends around `sy sling`, `sy stop`, `sy mail send`, and `sy mail check`
- spawn lifecycle events that now distinguish `sling.spawned` from `sling.completed`
- first operator-facing event inspection path over `events.db`
- status output that now joins each session to its latest durable event context, including the recorded readiness delay for fresh launches
- regression tests around config/root behavior, worktree creation, session persistence, mail, stop, and command parsing

## What Does Not Exist Yet

- tmux control
- merge workflow

## Current Command Surface

- `sy init`
  - works inside a git repository
  - writes `.switchyard/config.yaml`
  - creates the initial `.switchyard/` layout
- `sy events [session]`
  - loads config from the canonical repo root
  - prints the recent durable event timeline from `events.db`
  - optionally scopes the recent view to one resolved session
  - prints an empty-state message when no events exist
- `sy sling [args...]`
  - requires an agent name
  - creates one deterministic branch under `agents/`
  - creates one worktree under `.switchyard/worktrees/`
  - spawns one Codex process from that worktree
  - records `sling.spawned` once the runtime pid exists
  - waits for one short initial readiness window before persisting the session as `running`
  - records `sling.failed` when the runtime exits during that launch window
- `sy status [args...]`
  - loads config and session state
  - marks obviously stale `running` pid-backed sessions as `failed`
  - prints an empty-state message when no sessions exist
  - prints a tab-separated session table ordered by most recent update
  - includes one concise recent-event summary per session when event history exists, including `readyAfterMs` for fresh `sling.completed` events
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
- the readiness signal is intentionally narrow: surviving the first launch window proves only that the process stayed alive briefly, not that Codex completed a richer handshake.
- older pre-pid session rows cannot be liveness-checked automatically.
- `sy events <selector>` currently resolves in this order: exact session row by id, orphaned events by raw `session_id`, then latest session by normalized agent name. That preserves orphaned event readability, but it means a raw selector that could plausibly match both an orphaned session id and an agent name will prefer the orphaned session-id path until the CLI grows explicit selector disambiguation.

## Recommended Next Task

Decide whether pid-only lifecycle control is sufficient for v0 or whether tmux needs to land next:
- compare the current pid-based spawn/status/stop loop against the concrete operator failure cases
- make the decision explicit in docs or an ADR instead of leaving tmux as an unresolved assumption
- keep the scope narrow to the current single-repo Codex workflow

That is the next highest-risk ambiguity in the operator loop now that the first launch boundary is clearer.

## How To Use This File

Update this document whenever one of these changes:
- a placeholder command becomes real
- a new subsystem starts owning persistent state
- an important architectural assumption is changed
- the recommended next task changes

For scope control across sessions, keep `docs/focus-tracker.md` aligned with the real implementation state.
