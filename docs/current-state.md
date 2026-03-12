# Current State

## Snapshot

This repository now has a minimal but real operator loop for one repo-local Codex session. The codebase is still early, but init, spawn with launch-time session-id visibility, first-class `sy sling` task handoff via explicit `--task` or `--task-file` input with durable spec files under `.switchyard/specs/`, readiness-aware status with session-id visibility plus unread-mail counts, cleanup-readiness inspection, passive stalled-session visibility for quiet active sessions, a more specific passive `runtime.no_visible_progress` hint for long-lived active sessions that still show no inbound mail or repo-visible work artifact, and exact per-session inspection that now surfaces stored base-branch, runtime-pid, latest stored launch-command metadata, a derived next follow-up signal, plus the full recent-event summary and latest launch task handoff, with optional full task-text inspection via `sy status <session> --task`, stop with exact session-id visibility in operator-facing completion output including post-stop cleanup-removal failures plus repeated-stop already-inactive refusals, events with explicit selector disambiguation plus an operator-controlled recent-event window, orphaned agent-name recovery when the session row is gone, exact session-id visibility when a selected tracked session has no events yet, and all-session `sy status` output that now also surfaces the latest run task summary per session plus a compact next-step hint so two delegated sessions can be distinguished and followed through reintegration without drilling into each one, with actionable rows now surfaced ahead of passive wait/done rows, with each row's `UPDATED` value now following the freshest operator-visible activity instead of the last raw session-row mutation so recent merge, mail, and runtime changes are harder to miss, and with `RECENT` output now appending either `runtime.no_visible_progress age=...` or `runtime.stalled idleFor=...` without replacing better diagnostics, durable mail with unread consumption plus both full-history and unread-only read-only inspection that now also echoes the resolved session id, frames each message body as an explicit block, preserves the exact mail body text sent by the operator, and now also supports file-backed `sy mail send --body-file <path>` input for exact multiline follow-up mail, and a narrow merge path for the documented reintegration workflow that now also echoes the resolved session id in handled session-scoped failure output all exist end-to-end. Session-targeting commands now also fail closed when one reused agent name could refer to multiple preserved sessions, so operators have to choose an exact session id instead of relying on an implicit latest-session pick. The CLI entrypoint now also has realistic end-to-end regression coverage for repo bootstrap plus exact follow-up paths such as `sy status --task`, `sy events --limit`, `sy stop --cleanup --abandon`, `sy merge`, `sy mail list --unread`, `sy mail send --body-file`, task-file validation in `sy sling`, and one full two-session operator workflow that spans mailbox review, merge, and cleanup without losing the untouched session's run or reintegration state. Session records now also retain the original merge target branch so later recovery does not depend on drifted config. `sy init` now also warns when the chosen canonical branch does not point to a commit yet, so operators learn they still need an initial commit before `sy sling`. The detached `sy sling` launch path now also wraps Codex with the system `script` utility on supported Unix platforms so local Codex builds that reject non-TTY stdin can still start inside the current operator loop, and it now fails explicitly when the configured canonical branch does not point to a commit yet instead of leaking raw `git worktree` invalid-reference output. The `sy sling` launch flow now also forwards the explicit task text to Codex as the initial prompt and records the task summary, durable spec path, and logical launch command in launch output and launch events, regardless of whether the task came from an inline flag or a file. Merge conflicts now also surface the conflicting paths directly in `sy merge`, with compact conflict metadata carried into durable events and recent status context, repo-root merge-in-progress preflight now fails with an explicit recovery message instead of a generic dirty-worktree error, session-scoped merge preflight refusals now also record durable `merge.failed` events so later `sy status` and `sy events` inspection still show what blocked reintegration, and handled session-scoped merge failures now also echo the resolved session id so later exact-session follow-up commands do not require a fresh lookup, `sy stop` shutdown failures before any state mutation now also record durable `stop.failed` events so later `sy status` and `sy events` inspection still show what blocked shutdown, `sy status` now keeps higher-value merge-failure context like branch-drift targets, preserved-worktree paths, git error text, stop-failure shutdown diagnostics, and stop cleanup mode in its recent-event summary, cleanup inspection now also distinguishes when a preserved worktree has already gone missing while the branch still remains so `sy status`, `sy stop --cleanup`, and later durable `stop.completed` history no longer collapse that partial-artifact-loss case into the harmless already-absent path, explicit-abandon cleanup now also reports when both preserved artifacts were already gone instead of falsely claiming removal, and stop cleanup removal failures now still echo the handled stopped-session summary before exiting nonzero so operators do not lose track of the preserved session they must inspect, repeated-stop already-inactive `sy stop` failures now also echo the resolved session id before they exit nonzero so exact-session follow-up commands do not require a fresh lookup, and Unix zombie runtime pids are now treated as stale dead sessions instead of being misreported as healthy just because the pid still answers a signal probe.

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
- implemented file-backed mail-body input in `sy mail send` via `--body-file <path>`
- implemented `sy mail check`
- implemented `sy mail list`
- implemented read-only unread-only mailbox inspection via `sy mail list --unread`
- mail send now preserves exact body text while still rejecting whitespace-only messages
- mail send now also accepts exactly one file-backed body source via `--body-file <path>`
- mail inspection output now frames each message body as an explicit block
- repo root detection that handles nested directories and git worktrees
- canonical branch detection that prefers `origin/HEAD`
- init-time warning when the chosen canonical branch does not point to a commit yet
- config loading that normalizes `project.root` to the canonical repo root
- `.switchyard/` bootstrap for directories and placeholder database files
- end-to-end CLI regression coverage around `sy init`, `sy status --task`, `sy events --limit`, `sy stop --cleanup --abandon`, `sy merge`, `sy mail send --body-file`, and `sy mail list --unread`
- session store with schema ownership for `sessions.db`
- run store with schema ownership for `runs.db`
- mail store with schema ownership for `mail.db`
- event store with schema ownership for `events.db`
- session records that now retain the spawned runtime pid
- session records that now retain the original canonical branch as `baseBranch`
- session records that distinguish launch-time `starting` from confirmed `running`
- worktree manager with deterministic branch and path naming
- narrow Codex runtime seam that builds and spawns one detached command
- pseudo-terminal-backed detached Codex launch compatibility on supported Unix platforms via `script`
- explicit `sy sling` refusal when the configured canonical branch does not point to a commit yet
- launch-time session-id visibility in `sy sling` so operators can target an exact preserved session immediately
- handled merge-failure session-id visibility in `sy merge` so later follow-up commands can reuse the exact preserved session without another lookup
- stop-time session-id visibility in `sy stop` so later follow-up commands can reuse the exact preserved session without another lookup
- repeated-stop already-inactive refusal output in `sy stop` now also echoes the resolved session id before exiting nonzero
- post-stop cleanup-removal failures in `sy stop --cleanup` now still print the handled stop summary and resolved session id before exiting nonzero
- mail-inspection session-id visibility in `sy mail check` and `sy mail list` so mailbox review also preserves the exact selector in operator-facing output
- mail-body framing in `sy mail check` and `sy mail list` so multi-line mailbox output stays explicit in terminal inspection
- first-class task handoff in `sy sling` via exactly one explicit `--task <instruction>` or `--task-file <path>`
- durable task-spec files under `.switchyard/specs/` that are keyed by agent name and session id
- durable run records under `runs.db` that now track the latest task summary, run state, and terminal outcome per launched session
- initial readiness waiting that requires the spawned Codex process to survive a short launch window before the session is marked usable
- narrow process liveness and stop helpers for detached Codex sessions
- Unix zombie-process detection in runtime liveness checks so stale sessions fail closed instead of staying `running`
- durable lifecycle event appends around `sy sling`, `sy stop`, `sy mail send`, `sy mail check`, and `sy mail list`
- durable `stop.failed` events for shutdown errors that happen before `sy stop` can change session state
- spawn lifecycle events that now distinguish `sling.spawned` from `sling.completed`
- durable runtime reconciliation events for `runtime.ready`, `runtime.exited_early`, and `runtime.exited`
- first operator-facing event inspection path over `events.db`
- explicit selector disambiguation in `sy events` when one raw selector could name different session-id, agent-name, or orphaned-event targets
- orphaned agent-name event recovery in `sy events` when the session row is already gone
- exact session-id visibility in empty selected `sy events` output so follow-up commands still keep the resolved selector visible
- explicit selector disambiguation across session-targeting commands when one normalized agent name matches multiple preserved sessions
- operator-controlled recent-event window selection in `sy events --limit`
- exact per-session inspection in `sy status`, including explicit selector disambiguation between session-id and agent-name matches
- exact per-session inspection in `sy status` now also surfaces stored `baseBranch`, current `runtimePid`, latest stored launch command, creation time, latest launch task summary, launch spec path, latest run summary, a derived next follow-up signal, and the full recent-event summary before the one-row table
- exact per-session inspection in `sy status` now also supports `--task` to print the full stored launch instruction from the durable spec file
- launch-event inspection in `sy events` now also carries `taskSummary` and `taskSpecPath` for `sling.spawned`, `sling.completed`, and `sling.failed`
- explicit selector disambiguation in `sy stop` and `sy merge` when one raw selector could name different sessions by session-id and agent-name
- first operator-facing merge path that preflights active sessions, dirty preserved worktrees, and dirty repo-root state before running `git merge --no-ff`
- merge preflight failures that now surface the blocking git status entries for dirty repo-root and preserved-worktree states
- merge preflight now also detects an in-progress repo-root merge and points the operator to resolve it or run `git merge --abort`
- merge conflict failures that now surface the conflicting paths directly in `sy merge` and durable `merge.failed` events
- merge and merged-cleanup guards that now refuse to silently retarget preserved work when the configured canonical branch changes after launch
- first operator-facing cleanup guard that only removes preserved merge artifacts automatically when the branch is confirmed merged, and otherwise requires explicit `--abandon`
- status output that now joins each session to its latest durable event context, including the recorded readiness delay for fresh launches
- status output that now also joins each session to its latest durable run summary so operators can see `starting`, `active`, or `finished:<outcome>` at a glance
- status output that now also surfaces the latest run task summary per session so concurrent delegated work stays attributable in the all-session view
- status output that now also surfaces one derived next follow-up signal per session so concurrent delegated work stays actionable without decoding unread-mail, run, and cleanup columns by hand
- status output that now also orders all-session rows by current follow-up priority before recency so concurrent mail, inspection, and reintegration work surfaces ahead of passive wait states
- status output that now also treats the `UPDATED` column and same-bucket freshness ordering as the latest operator-visible activity time, so newer merge, mail, and runtime signals do not stay hidden behind stale session-row timestamps
- status output now also derives a passive stalled-session hint from runtime-side progress and inbound non-operator mail without mutating durable session state
- status output now also derives a more specific passive `runtime.no_visible_progress` hint once five minutes have passed since the first readiness signal and the worktree is still clean, the agent branch is not ahead of `baseBranch`, and no inbound non-operator mail exists
- status output now also keeps that stalled idle clock separate from `UPDATED`, so newer operator-visible events can stay visible without resetting the passive stalled hint
- status output now prefers `runtime.no_visible_progress` over `runtime.stalled` when both inspect hints would otherwise apply, and only renders one passive inspect suffix at a time
- status output now also surfaces a synthesized `mail.unread` recent summary from the newest unread inbound operator mail so concurrent mailbox follow-up stays visible without drilling into `sy mail`
- status output now also appends `runtime.stalled idleFor=...` to the chosen recent summary instead of replacing higher-value concrete diagnostics such as `mail.unread`, `stop.failed`, or `merge.failed`
- status output now also appends `runtime.no_visible_progress age=...` to the chosen recent summary without overriding those higher-value concrete diagnostics
- status output now also orders rows within the `mail` follow-up bucket by newest unread inbound mail before falling back to session recency
- status output that now also surfaces durable `stop.failed` context such as shutdown-failure reason, runtime pid, and error text in recent-event summaries, including on the same render that records a follow-up runtime reconciliation event
- status output that now also surfaces each session id in the main overview so later commands can target an exact preserved session without guesswork
- status output that now also surfaces unread mail counts so operators can spot pending mailbox work without checking each session individually
- status output that now also surfaces one cleanup-readiness label per session so operators can see whether plain `--cleanup` is currently safe, already unnecessary, or requires explicit `--abandon`
- status cleanup-readiness now also surfaces when the preserved branch still exists but the preserved worktree path is already missing
- stop history now also keeps that missing-worktree cleanup refusal distinct from the fully-absent artifact case
- status recent-event summaries now also preserve `stop.completed` cleanup mode so later `sy status` inspection still shows whether cleanup removed preserved work after a confirmed merge or an explicit abandon
- status recent-event summaries now also preserve higher-value `merge.failed` details such as branch-drift targets, preserved-worktree paths, and git error text when those fields exist
- merge lifecycle events for `merge.completed`, `merge.failed`, and `merge.skipped`
- durable stop cleanup failure events when cleanup is blocked or artifact removal fails after the stop state is already known
- durable merge preflight failure events for session-scoped refusals such as dirty repo-root or preserved-worktree state
- durable stop cleanup failure events when cleanup is blocked or artifact removal fails after the stop state is already known
- first-readiness reconciliation in `sy status` that promotes launched sessions to `running` or marks them failed with a durable reason
- `sy sling` now creates one durable run record per launched task, moves it from `starting` to `active` after launch success, and marks launch failures as `finished:launch_failed`
- `sy stop` now updates the latest run outcome to `stopped`, `failed`, `merged`, or `abandoned` when the task outcome becomes clear
- `sy merge` now updates the latest run outcome to `merged` on success and already-integrated no-op merges
- explicit v0 decision to keep runtime control pid-backed and defer tmux/live attach unless operator workflows prove the narrower raw-transcript slice insufficient
- documented first merge and reintegration workflow that keeps the initial contract manual-first and git-native
- regression tests around config/root behavior, worktree creation, session persistence, mail, stop, and command parsing

## What Does Not Exist Yet

- interactive runtime attach or first-class transcript capture
- automatic cleanup after merge

## Current Command Surface

- `sy init`
  - works inside a git repository
  - writes `.switchyard/config.yaml`
  - creates the initial `.switchyard/` layout
  - warns when the chosen canonical branch does not point to a commit yet, while still completing bootstrap
- `sy events [session]`
  - loads config from the canonical repo root
  - prints the recent durable event timeline from `events.db`
  - supports `--limit <count>` so operators can widen or narrow the recent-event window explicitly
  - optionally scopes the recent view to one resolved session
  - when no session row remains, can still recover one orphaned event stream by normalized agent name if that agent maps to exactly one orphaned session id
  - rejects ambiguous selectors when one raw value could refer to different session-id, agent-name, or orphaned-event targets
  - rejects reused agent-name selectors when multiple sessions share that normalized agent name, and requires an exact session id instead
  - prints the resolved session id when a selected tracked session has no events yet
  - prints an empty-state message when no events exist
- `sy sling [args...]`
  - requires an agent name plus exactly one task source via `--task <instruction>` or `--task-file <path>`
  - creates one deterministic branch under `agents/`
  - creates one worktree under `.switchyard/worktrees/`
  - writes one durable task handoff file under `.switchyard/specs/`
  - passes the explicit task text to Codex as the initial prompt
  - spawns one Codex process from that worktree
  - uses the system `script` utility on macOS, Linux, and BSD platforms so detached Codex startup still gets a pseudo-terminal
  - fails explicitly when the configured canonical branch does not point to a commit yet, instead of surfacing raw `git worktree` invalid-reference output
  - persists the original canonical branch as session `baseBranch`
  - prints the durable session id, task summary, and task spec path in the initial launch summary
  - records `sling.spawned` once the runtime pid exists
  - waits for one short initial readiness window before persisting the session as `starting`
  - records `sling.completed` after that launch window succeeds, including `readyAfterMs`, `taskSummary`, and `taskSpecPath`
  - records `sling.failed` when the runtime exits during that launch window, preserving task handoff metadata when available
  - falls back to direct detached Codex spawn on other platforms
- `sy status [session]`
  - loads config and session state
  - optionally resolves one session by id or normalized agent name and renders only that session
  - when a selector is present, prints a small detail block ahead of the one-row table so operators can inspect stored `baseBranch`, current `runtimePid`, latest stored launch command, creation time, latest launch task summary, launch spec path, unread-mail count, cleanup-readiness label, latest run summary, one derived next follow-up signal, and the full recent-event summary without reading the database
  - supports `--task` with an exact selector to print the full stored launch instruction from `.switchyard/specs/`
  - fails explicitly when `--task` is used without an exact selector or when the stored task text is unavailable
  - accepts an exact session id before agent-name normalization, even when the raw selector is not a valid agent name
  - rejects ambiguous selectors that would match different sessions by id and agent name
  - rejects reused agent-name selectors when multiple sessions share that normalized agent name, and requires an exact session id instead
  - promotes `starting` sessions to `running` when the pid survives the first liveness check
  - marks early-dead `starting` sessions as `failed`
  - marks obviously stale `running` pid-backed sessions as `failed`
  - treats Unix zombie runtime pids as stale not-running sessions and records `process_state_zombie` in the reconciliation event reason
  - when a selector is present, only reconciles that targeted session before printing
  - prints an empty-state message when no sessions exist
  - prints a tab-separated session table ordered by current follow-up priority first and then by the freshest operator-visible activity within each follow-up bucket
  - includes the durable session id in that table for exact follow-up selectors
  - includes one unread-mail count per session from `mail.db`
  - includes one cleanup-readiness label per session based on the same merged-cleanup rules enforced by `sy stop --cleanup`, with active sessions showing the post-stop outcome as `stop-then:*`
  - includes the latest durable run task summary per session in that table so overlapping delegated work stays attributable without drilling into exact-session views
  - includes one derived next follow-up signal per session so the all-session view stays readable when concurrent sessions need different operator actions such as mailbox review, waiting, review/merge, cleanup, or inspection
  - prioritizes `mail` in that follow-up signal when unread mailbox items addressed to `operator` exist for a session, instead of leaving the operator to infer it only from the unread-count column
  - derives a passive `runtime.stalled` hint for active sessions from runtime-progress events plus inbound non-operator mail, and surfaces `inspect` when that idle clock crosses the stalled threshold without any higher-priority unread mail
  - synthesizes a `mail.unread` recent summary from the newest unread inbound operator mail when mailbox follow-up is pending, so the all-session and exact-session views stay communication-aware without requiring an immediate `sy mail` drilldown
  - orders rows within the `mail` follow-up bucket by newest unread inbound mail before falling back to session update timestamps
  - distinguishes partial preserved-artifact loss in that cleanup-readiness label when the branch still exists but the preserved worktree path is already missing
  - includes one concise recent-event summary per session when event history exists, including `readyAfterMs` for fresh `sling.completed` events, shutdown-failure details from `stop.failed`, cleanup mode and missing-worktree details from `stop.completed`, and higher-value merge-failure details such as drift targets, preserved-worktree paths, and git errors when those fields exist
  - uses the latest durable event or unread inbound operator mail time to drive the `UPDATED` column when that activity is newer than the stored session-row timestamp
  - keeps the stalled idle clock separate from `UPDATED`, so operator-only activity such as `mail.sent`, `mail.checked`, and `mail.listed` does not reset passive stalled detection
  - appends `runtime.stalled idleFor=...` to the chosen recent summary instead of replacing a newer concrete diagnostic
  - when that same status run also records a runtime reconciliation event, keeps a latest pre-existing `stop.failed` visible in the current recent summary instead of immediately replacing it with the synthetic runtime event
  - records runtime reconciliation events when it changes session state
- `sy stop <session>`
  - resolves one session by id or normalized agent name
  - rejects ambiguous selectors that would match different sessions by id and agent name
  - rejects reused agent-name selectors when multiple sessions share that normalized agent name, and requires an exact session id instead
  - stops one active pid-backed runtime and updates durable session state
  - prints the resolved durable session id in operator-facing handled success paths so later `events`, `merge`, or cleanup commands can reuse it directly
  - still prints that handled stop summary and resolved session id when cleanup artifact removal fails after the stop state is already known, before the command exits nonzero
  - prints the resolved durable session id before failing when a repeated stop targets an already inactive session without cleanup
  - preserves the worktree by default so the operator can review or merge the branch later
  - still stops active sessions when `--cleanup` is requested, even if cleanup is later refused
  - records a durable `stop.failed` event when runtime shutdown fails before session state can be updated
  - removes the worktree and branch when `--cleanup` is passed only if the preserved branch is confirmed merged into the session's stored `baseBranch`
  - refuses plain merged-cleanup for legacy rows that do not have stored `baseBranch` metadata
  - requires `--cleanup --abandon` to discard preserved work that is not confirmed merged
  - refuses plain cleanup when the preserved branch still exists but the preserved worktree path is already missing, including for legacy rows without stored `baseBranch` metadata, and tells the operator to restore it manually or use explicit abandon
  - reports when preserved cleanup artifacts were already absent instead of claiming removal, including explicit-abandon cleanup
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
- `sy mail send <session> [body]`
  - resolves one session by id or normalized agent name
  - accepts an exact session id before agent-name normalization, even when the raw selector is not a valid agent name
  - rejects reused agent-name selectors when multiple sessions share that normalized agent name, and requires an exact session id instead
  - requires exactly one message body source via positional `[body]` or `--body-file <path>`
  - reads `--body-file <path>` relative to the invocation directory
  - writes one durable message into `mail.db`
  - preserves the exact provided body text while still rejecting whitespace-only input
  - fails explicitly when the requested body file cannot be read
  - defaults the sender to `operator`
- `sy mail check <session>`
  - resolves one session by id or normalized agent name
  - rejects reused agent-name selectors when multiple sessions share that normalized agent name, and requires an exact session id instead
  - reads unread mail for that session in creation order
  - prints the resolved session id in operator-facing output, including when no unread mail exists
  - frames each returned message body as an explicit `Body:` block so multi-line content remains readable
  - marks returned messages as read
- `sy mail list <session>`
  - resolves one session by id or normalized agent name
  - prints the full mailbox for that session in creation order
  - supports `--unread` to print only unread mail without consuming it
  - prints the resolved session id in operator-facing output, including empty mailbox views
  - frames each returned message body as an explicit `Body:` block so multi-line content remains readable
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
- the current run model is intentionally narrow: it captures one compact latest run story per launched session, but it is not yet a richer run history, replay, or multi-session coordination layer
- older session rows created before `baseBranch` was added now fail closed for `sy merge` and plain merged-cleanup, so operators must use manual git review/merge or explicit `--abandon`
- the current readiness model is intentionally narrow: `sy sling` only proves the process survived a short launch window, and `sy status` promotes the session to `running` on the first later successful pid liveness check.
- the current runtime-control model intentionally omits live attach and transcript capture, so debugging still relies on durable events and external process inspection.
- the next named operator-visible blind spot is detached runtime observability: durable raw transcript capture plus a first-class `sy logs <session>` path, kept narrower than live attach or tmux
- the readiness signal is intentionally narrow: surviving the first launch window proves only that the process stayed alive briefly, not that Codex completed a richer handshake.
- the detached `sy sling` launch compatibility fix currently depends on the system `script` utility on supported Unix platforms; unsupported platforms still fall back to direct detached Codex spawn and may need a follow-up if Codex requires a TTY there too.
- older pre-pid session rows cannot be liveness-checked automatically.
- the merge and cleanup paths are intentionally narrow: they preflight obvious unsafe states and keep review, conflict resolution, post-merge validation, and explicit abandon decisions manual-first.

## Recommended Next Task

The first concurrent proving workflow is now minimally real:
- two delegated sessions can be followed through `sy status`, `sy mail check`, `sy merge`, and `sy stop --cleanup` without losing exact selector clarity
- the untouched session keeps its run and reintegration state while the other session is reviewed, merged, and cleaned up
- treat both the run-tracking slice and the first concurrent proving slice as complete unless a concrete operator blind spot now appears

If a new gap appears, name one small operator-visible follow-up slice before coding.

## How To Use This File

Update this document whenever one of these changes:
- a placeholder command becomes real
- a new subsystem starts owning persistent state
- an important architectural assumption is changed
- the recommended next task changes

For scope control across sessions, keep `docs/focus-tracker.md` aligned with the real implementation state.
