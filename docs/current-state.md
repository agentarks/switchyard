# Current State

## Snapshot

This repository now has a minimal but real operator loop for one repo-local Codex session. The codebase is still early, but init, spawn with launch-time session-id visibility, readiness-aware status with session-id visibility plus unread-mail counts, cleanup-readiness inspection, and exact per-session inspection that now surfaces stored base-branch and runtime-pid metadata plus the full recent-event summary, stop, events with explicit selector disambiguation plus an operator-controlled recent-event window and orphaned agent-name recovery when the session row is gone, durable mail with unread consumption plus both full-history and unread-only read-only inspection, and a narrow merge path for the documented reintegration workflow all exist end-to-end. Session-targeting commands now also fail closed when one reused agent name could refer to multiple preserved sessions, so operators have to choose an exact session id instead of relying on an implicit latest-session pick. The repo bootstrap contract now also has one realistic end-to-end CLI-path regression test. Session records now also retain the original merge target branch so later recovery does not depend on drifted config. The detached `sy sling` launch path now also wraps Codex with the system `script` utility on supported Unix platforms so local Codex builds that reject non-TTY stdin can still start inside the current operator loop. Merge conflicts now also surface the conflicting paths directly in `sy merge`, with compact conflict metadata carried into durable events and recent status context, repo-root merge-in-progress preflight now fails with an explicit recovery message instead of a generic dirty-worktree error, session-scoped merge preflight refusals now also record durable `merge.failed` events so later `sy status` and `sy events` inspection still show what blocked reintegration, `sy status` now keeps higher-value merge-failure context like branch-drift targets, preserved-worktree paths, and git error text in its recent-event summary, and cleanup inspection now also distinguishes when a preserved worktree has already gone missing while the branch still remains so `sy status`, `sy stop --cleanup`, and later durable `stop.completed` history no longer collapse that partial-artifact-loss case into the harmless already-absent path.

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
- end-to-end CLI regression coverage around `sy init`, including nested-directory root resolution and repo-root bootstrap outputs
- session store with schema ownership for `sessions.db`
- mail store with schema ownership for `mail.db`
- event store with schema ownership for `events.db`
- session records that now retain the spawned runtime pid
- session records that now retain the original canonical branch as `baseBranch`
- session records that distinguish launch-time `starting` from confirmed `running`
- worktree manager with deterministic branch and path naming
- narrow Codex runtime seam that builds and spawns one detached command
- pseudo-terminal-backed detached Codex launch compatibility on supported Unix platforms via `script`
- launch-time session-id visibility in `sy sling` so operators can target an exact preserved session immediately
- initial readiness waiting that requires the spawned Codex process to survive a short launch window before the session is marked usable
- narrow process liveness and stop helpers for detached Codex sessions
- durable lifecycle event appends around `sy sling`, `sy stop`, `sy mail send`, `sy mail check`, and `sy mail list`
- spawn lifecycle events that now distinguish `sling.spawned` from `sling.completed`
- durable runtime reconciliation events for `runtime.ready`, `runtime.exited_early`, and `runtime.exited`
- first operator-facing event inspection path over `events.db`
- explicit selector disambiguation in `sy events` when one raw selector could name different session-id, agent-name, or orphaned-event targets
- orphaned agent-name event recovery in `sy events` when the session row is already gone
- explicit selector disambiguation across session-targeting commands when one normalized agent name matches multiple preserved sessions
- operator-controlled recent-event window selection in `sy events --limit`
- exact per-session inspection in `sy status`, including explicit selector disambiguation between session-id and agent-name matches
- exact per-session inspection in `sy status` now also surfaces stored `baseBranch`, current `runtimePid`, creation time, and the full recent-event summary before the one-row table
- explicit selector disambiguation in `sy stop` and `sy merge` when one raw selector could name different sessions by session-id and agent-name
- first operator-facing merge path that preflights active sessions, dirty preserved worktrees, and dirty repo-root state before running `git merge --no-ff`
- merge preflight failures that now surface the blocking git status entries for dirty repo-root and preserved-worktree states
- merge preflight now also detects an in-progress repo-root merge and points the operator to resolve it or run `git merge --abort`
- merge conflict failures that now surface the conflicting paths directly in `sy merge` and durable `merge.failed` events
- merge and merged-cleanup guards that now refuse to silently retarget preserved work when the configured canonical branch changes after launch
- first operator-facing cleanup guard that only removes preserved merge artifacts automatically when the branch is confirmed merged, and otherwise requires explicit `--abandon`
- status output that now joins each session to its latest durable event context, including the recorded readiness delay for fresh launches
- status output that now also surfaces each session id in the main overview so later commands can target an exact preserved session without guesswork
- status output that now also surfaces unread mail counts so operators can spot pending mailbox work without checking each session individually
- status output that now also surfaces one cleanup-readiness label per session so operators can see whether plain `--cleanup` is currently safe, already unnecessary, or requires explicit `--abandon`
- status cleanup-readiness now also surfaces when the preserved branch still exists but the preserved worktree path is already missing
- stop history now also keeps that missing-worktree cleanup refusal distinct from the fully-absent artifact case
- status recent-event summaries now also preserve higher-value `merge.failed` details such as branch-drift targets, preserved-worktree paths, and git error text when those fields exist
- merge lifecycle events for `merge.completed`, `merge.failed`, and `merge.skipped`
- durable stop cleanup failure events when cleanup is blocked or artifact removal fails after the stop state is already known
- durable merge preflight failure events for session-scoped refusals such as dirty repo-root or preserved-worktree state
- durable stop cleanup failure events when cleanup is blocked or artifact removal fails after the stop state is already known
- first-readiness reconciliation in `sy status` that promotes launched sessions to `running` or marks them failed with a durable reason
- explicit v0 decision to keep runtime control pid-backed and defer tmux unless operator workflows require attach or transcript handling
- documented first merge and reintegration workflow that keeps the initial contract manual-first and git-native
- regression tests around config/root behavior, worktree creation, session persistence, mail, stop, and command parsing

## What Does Not Exist Yet

- interactive runtime attach or transcript capture
- automatic cleanup after merge

## Current Command Surface

- `sy init`
  - works inside a git repository
  - writes `.switchyard/config.yaml`
  - creates the initial `.switchyard/` layout
- `sy events [session]`
  - loads config from the canonical repo root
  - prints the recent durable event timeline from `events.db`
  - supports `--limit <count>` so operators can widen or narrow the recent-event window explicitly
  - optionally scopes the recent view to one resolved session
  - when no session row remains, can still recover one orphaned event stream by normalized agent name if that agent maps to exactly one orphaned session id
  - rejects ambiguous selectors when one raw value could refer to different session-id, agent-name, or orphaned-event targets
  - rejects reused agent-name selectors when multiple sessions share that normalized agent name, and requires an exact session id instead
  - prints an empty-state message when no events exist
- `sy sling [args...]`
  - requires an agent name
  - creates one deterministic branch under `agents/`
  - creates one worktree under `.switchyard/worktrees/`
  - spawns one Codex process from that worktree
  - uses the system `script` utility on macOS, Linux, and BSD platforms so detached Codex startup still gets a pseudo-terminal
  - persists the original canonical branch as session `baseBranch`
  - prints the durable session id in the initial launch summary
  - records `sling.spawned` once the runtime pid exists
  - waits for one short initial readiness window before persisting the session as `starting`
  - records `sling.completed` after that launch window succeeds, including `readyAfterMs`
  - records `sling.failed` when the runtime exits during that launch window
  - falls back to direct detached Codex spawn on other platforms
- `sy status [session]`
  - loads config and session state
  - optionally resolves one session by id or normalized agent name and renders only that session
  - when a selector is present, prints a small detail block ahead of the one-row table so operators can inspect stored `baseBranch`, current `runtimePid`, creation time, unread-mail count, cleanup-readiness label, and the full recent-event summary without reading the database
  - accepts an exact session id before agent-name normalization, even when the raw selector is not a valid agent name
  - rejects ambiguous selectors that would match different sessions by id and agent name
  - rejects reused agent-name selectors when multiple sessions share that normalized agent name, and requires an exact session id instead
  - promotes `starting` sessions to `running` when the pid survives the first liveness check
  - marks early-dead `starting` sessions as `failed`
  - marks obviously stale `running` pid-backed sessions as `failed`
  - when a selector is present, only reconciles that targeted session before printing
  - prints an empty-state message when no sessions exist
  - prints a tab-separated session table ordered by most recent update
  - includes the durable session id in that table for exact follow-up selectors
  - includes one unread-mail count per session from `mail.db`
  - includes one cleanup-readiness label per session based on the same merged-cleanup rules enforced by `sy stop --cleanup`, with active sessions showing the post-stop outcome as `stop-then:*`
  - distinguishes partial preserved-artifact loss in that cleanup-readiness label when the branch still exists but the preserved worktree path is already missing
  - includes one concise recent-event summary per session when event history exists, including `readyAfterMs` for fresh `sling.completed` events, missing-worktree cleanup details from `stop.completed`, and higher-value merge-failure details such as drift targets, preserved-worktree paths, and git errors when those fields exist
  - records runtime reconciliation events when it changes session state
- `sy stop <session>`
  - resolves one session by id or normalized agent name
  - rejects ambiguous selectors that would match different sessions by id and agent name
  - rejects reused agent-name selectors when multiple sessions share that normalized agent name, and requires an exact session id instead
  - stops one active pid-backed runtime and updates durable session state
  - preserves the worktree by default so the operator can review or merge the branch later
  - still stops active sessions when `--cleanup` is requested, even if cleanup is later refused
  - removes the worktree and branch when `--cleanup` is passed only if the preserved branch is confirmed merged into the session's stored `baseBranch`
  - refuses plain merged-cleanup for legacy rows that do not have stored `baseBranch` metadata
  - requires `--cleanup --abandon` to discard preserved work that is not confirmed merged
  - refuses plain cleanup when the preserved branch still exists but the preserved worktree path is already missing, including for legacy rows without stored `baseBranch` metadata, and tells the operator to restore it manually or use explicit abandon
  - reports when preserved cleanup artifacts were already absent instead of claiming removal
  - records a durable `stop.completed` event with cleanup failure details when cleanup is blocked or artifact removal fails after the stop state is already known, keeping missing-worktree refusals distinct from the fully-absent artifact case
- `sy merge <session>`
  - resolves one session by id or normalized agent name
  - rejects ambiguous selectors that would match different sessions by id and agent name
  - rejects reused agent-name selectors when multiple sessions share that normalized agent name, and requires an exact session id instead
  - refuses active sessions so merge only runs against preserved work
  - refuses legacy rows that do not have stored `baseBranch` metadata
  - refuses to silently retarget preserved work when the session `baseBranch` disagrees with the current configured canonical branch
  - verifies the preserved worktree path still resolves to the expected git worktree root
  - refuses dirty preserved worktrees so uncommitted agent changes are resolved before merge or cleanup
  - reports the blocking git status entries when the preserved worktree is dirty
  - requires the repo root worktree to be clean before it switches to the configured canonical branch
  - refuses to start when the repo root already has an in-progress merge, and points the operator to resolve it or run `git merge --abort`
  - reports the blocking git status entries when the repo root is dirty
  - verifies the preserved local `agents/*` branch still exists
  - runs `git merge --no-ff <branch>` from the canonical repo root worktree
  - surfaces the conflicting paths when git stops in a merge-conflict state
  - records `merge.completed` on success, `merge.failed` for session-scoped preflight refusals and git-stopped conflict states, and `merge.skipped` when the branch is already integrated
  - leaves review, conflict resolution, validation, and cleanup explicit for the operator
- `sy mail send <session> <body>`
  - resolves one session by id or normalized agent name
  - accepts an exact session id before agent-name normalization, even when the raw selector is not a valid agent name
  - rejects reused agent-name selectors when multiple sessions share that normalized agent name, and requires an exact session id instead
  - writes one durable message into `mail.db`
  - defaults the sender to `operator`
- `sy mail check <session>`
  - resolves one session by id or normalized agent name
  - rejects reused agent-name selectors when multiple sessions share that normalized agent name, and requires an exact session id instead
  - reads unread mail for that session in creation order
  - marks returned messages as read
- `sy mail list <session>`
  - resolves one session by id or normalized agent name
  - prints the full mailbox for that session in creation order
  - supports `--unread` to print only unread mail without consuming it
  - leaves read/unread state unchanged
  - rejects ambiguous selectors that would match different sessions by id and agent name
  - rejects reused agent-name selectors when multiple sessions share that normalized agent name, and requires an exact session id instead

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
- older session rows created before `baseBranch` was added now fail closed for `sy merge` and plain merged-cleanup, so operators must use manual git review/merge or explicit `--abandon`
- the current readiness model is intentionally narrow: `sy sling` only proves the process survived a short launch window, and `sy status` promotes the session to `running` on the first later successful pid liveness check.
- the current runtime-control model intentionally omits live attach and transcript capture, so debugging still relies on durable events and external process inspection.
- the readiness signal is intentionally narrow: surviving the first launch window proves only that the process stayed alive briefly, not that Codex completed a richer handshake.
- the detached `sy sling` launch compatibility fix currently depends on the system `script` utility on supported Unix platforms; unsupported platforms still fall back to direct detached Codex spawn and may need a follow-up if Codex requires a TTY there too.
- older pre-pid session rows cannot be liveness-checked automatically.
- the merge and cleanup paths are intentionally narrow: they preflight obvious unsafe states and keep review, conflict resolution, post-merge validation, and explicit abandon decisions manual-first.

## Recommended Next Task

Pick the next reproduced operator-loop hardening gap before broadening scope:
- keep the slice inside the current `init -> sling -> status -> stop -> merge -> mail -> events` loop
- prefer one concrete inspection or lifecycle blind spot over broader runtime redesign or new surface area
- keep prioritizing operator-readable behavior, durable state, and regression coverage over new subsystems

## How To Use This File

Update this document whenever one of these changes:
- a placeholder command becomes real
- a new subsystem starts owning persistent state
- an important architectural assumption is changed
- the recommended next task changes

For scope control across sessions, keep `docs/focus-tracker.md` aligned with the real implementation state.
