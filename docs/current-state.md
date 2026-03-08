# Current State

## Snapshot

This repository now has a minimal but real operator loop for one repo-local Codex session. The codebase is still early, but init, spawn, readiness-aware status, stop, events, basic durable mail, and a documented manual-first reintegration workflow all exist end-to-end.

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
- session records that distinguish launch-time `starting` from confirmed `running`
- worktree manager with deterministic branch and path naming
- narrow Codex runtime seam that builds and spawns one detached command
- initial readiness waiting that requires the spawned Codex process to survive a short launch window before the session is marked usable
- narrow process liveness and stop helpers for detached Codex sessions
- durable lifecycle event appends around `sy sling`, `sy stop`, `sy mail send`, and `sy mail check`
- spawn lifecycle events that now distinguish `sling.spawned` from `sling.completed`
- durable runtime reconciliation events for `runtime.ready`, `runtime.exited_early`, and `runtime.exited`
- first operator-facing event inspection path over `events.db`
- status output that now joins each session to its latest durable event context, including the recorded readiness delay for fresh launches
- first-readiness reconciliation in `sy status` that promotes launched sessions to `running` or marks them failed with a durable reason
- explicit v0 decision to keep runtime control pid-backed and defer tmux unless operator workflows require attach or transcript handling
- documented first merge and reintegration workflow that keeps the initial contract manual-first and git-native
- regression tests around config/root behavior, worktree creation, session persistence, mail, stop, and command parsing

## What Does Not Exist Yet

- interactive runtime attach or transcript capture
- `sy merge` command
- conflict reporting beyond normal git behavior

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
  - includes one concise recent-event summary per session when event history exists, including `readyAfterMs` for fresh `sling.completed` events
  - records runtime reconciliation events when it changes session state
- `sy stop <session>`
  - resolves one session by id or normalized agent name
  - stops one active pid-backed runtime and updates durable session state
  - preserves the worktree by default so the operator can review or merge the branch later
  - removes the worktree and branch when `--cleanup` is passed
- `sy mail send <session> <body>`
  - resolves one session by id or normalized agent name
  - writes one durable message into `mail.db`
  - defaults the sender to `operator`
- `sy mail check <session>`
  - resolves one session by id or normalized agent name
  - reads unread mail for that session in creation order
  - marks returned messages as read

## Current Merge Workflow

- stop the session without `--cleanup` if it is still active
- inspect status, events, mail, and the preserved worktree as needed
- switch to the canonical branch in the main repository and merge the agent branch manually with git
- run cleanup only after the merge succeeds or the branch is explicitly abandoned

## Current Risks

- `src/config.ts` is carrying both config logic and git root-resolution behavior; that should eventually split once lifecycle code grows further.
- `node:sqlite` is still experimental in Node 25, so the SQLite choice may need revision if core API churn becomes painful.
- there is no end-to-end test around `sy init`.
- the current readiness model is intentionally narrow: `sy sling` only proves the process survived a short launch window, and `sy status` promotes the session to `running` on the first later successful pid liveness check.
- the current runtime-control model intentionally omits live attach and transcript capture, so debugging still relies on durable events and external process inspection.
- the readiness signal is intentionally narrow: surviving the first launch window proves only that the process stayed alive briefly, not that Codex completed a richer handshake.
- older pre-pid session rows cannot be liveness-checked automatically.
- `sy events <selector>` currently resolves in this order: exact session row by id, orphaned events by raw `session_id`, then latest session by normalized agent name. That preserves orphaned event readability, but it means a raw selector that could plausibly match both an orphaned session id and an agent name will prefer the orphaned session-id path until the CLI grows explicit selector disambiguation.
- reintegration is still manual, so Switchyard cannot yet preflight merge safety, surface conflicts, or guard operators from calling `sy stop --cleanup` before they have merged a useful branch.

## Recommended Next Task

Implement the smallest merge path that matches the documented workflow:
- add a narrow `sy merge` command that resolves one stopped session to its preserved branch
- keep review, validation, and conflict handling explicit instead of hiding them behind automation
- broaden session metadata only if the merge implementation proves it is necessary

That is the next biggest missing piece in the repo-local lifecycle now that runtime control is explicit enough for v0.

## How To Use This File

Update this document whenever one of these changes:
- a placeholder command becomes real
- a new subsystem starts owning persistent state
- an important architectural assumption is changed
- the recommended next task changes

For scope control across sessions, keep `docs/focus-tracker.md` aligned with the real implementation state.
