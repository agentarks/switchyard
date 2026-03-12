# Detached Runtime Logs Design

## Summary

This slice addresses the next concrete operator-visible blind spot in the current detached Codex loop: when `sy sling` launches a live Codex session that produces no visible repo artifact or mail, the operator has no Switchyard-native way to inspect what the detached runtime actually printed.

The goal is to add durable transcript capture for detached Codex sessions and a first-class `sy logs <session>` inspection path without broadening into interactive attach, tmux, transcript parsing, or runtime-specific protocol handling.

## Problem

Today, Switchyard can show:
- launch success
- runtime liveness
- recent durable events
- repo-visible progress through worktree state and commits
- mailbox activity

That is enough to distinguish many healthy versus unhealthy sessions, but it still leaves one serious gap:
- a session can be alive
- `sy status` can report `runtime.no_visible_progress`
- the worktree can still be clean
- no mail may exist
- the operator still cannot inspect the detached Codex output through Switchyard

In practice, that means the operator knows a session needs intervention but cannot tell whether Codex is blocked, idle, waiting for input, emitting errors, or making progress outside repo-visible artifacts.

## Goals

- Capture detached Codex output durably under `.switchyard/logs/`
- Add a first-class `sy logs <session>` command for operator inspection
- Keep the current CLI-first operator loop readable and exact-session-safe
- Surface the transcript path in exact-session status output
- Keep the slice narrow and reviewable

## Non-Goals

- No interactive attach
- No tmux or terminal multiplexer adoption in this slice
- No stdout/stderr semantic parsing
- No transcript-derived status heuristics in this slice
- No background tailing, watchdogs, or daemons
- No new runtime abstraction beyond what the current Codex-first loop needs

## Proposed Behavior

### Launch-Time Transcript Capture

`sy sling` should create one durable session-scoped transcript file under `.switchyard/logs/`.

Proposed naming:
- `.switchyard/logs/<agent>-<session>.log`

Requirements:
- transcript creation happens before runtime spawn is treated as successful
- the transcript path is stable and deterministic from agent name plus session id
- detached runtime output is appended to that file for the lifetime of the session
- capture should be best-effort only up to launch success
  - if Switchyard cannot set up transcript capture on a supported platform, `sy sling` should fail explicitly instead of pretending the session is observable

The transcript file is operator-facing state, not durable database metadata in this slice.

### Runtime Capture Mechanism

Keep the current detached Codex model and add transcript capture around it.

On supported Unix platforms:
- keep using the system `script` utility to provide the pseudo-terminal Codex currently needs
- stop discarding the typescript output to `/dev/null`
- write the transcript to the session log path instead

On unsupported platforms:
- keep the current detached direct-spawn fallback
- redirect detached stdout and stderr to the same session log file

This keeps the current launch semantics narrow:
- Codex still runs detached
- Switchyard still tracks the runtime by pid
- transcript capture becomes an operator inspection artifact, not a control channel

## New Command

Add:
- `sy logs <session>`

Purpose:
- inspect the captured detached runtime transcript for one resolved session

Selector behavior:
- resolve one session by exact id or normalized agent name
- reject ambiguous selectors using the same exact-session-safe rules as `status`, `stop`, `merge`, and `mail`

Default rendering:
- print a short heading with agent name, resolved session id, and transcript path
- print the most recent tail of the transcript by default

Use one fixed code-level default in this slice:
- last 200 lines

Optional flag:
- `--all`
  - print the entire transcript instead of the default tail

Failure behavior:
- if no session exists, fail explicitly
- if the session exists but no transcript file exists yet, print an explicit operator-facing message that includes the resolved session id and expected transcript path
- if the transcript file cannot be read, fail explicitly with a logs-style error

## Exact-Session Status

`sy status <session>` should surface the transcript path in the detail block.

Add one field:
- `Log: .switchyard/logs/<agent>-<session>.log`

This is intentionally exact-session only in this slice. The all-session table should stay compact and should not gain a new log-path column.

## Cleanup Lifecycle

The transcript file is a preserved session artifact in this slice.

Apply these rules:
- plain `sy stop <session>` preserves the transcript file by default, alongside the preserved worktree and branch, so operators can inspect it during post-stop diagnosis or merge review
- `sy stop <session> --cleanup` removes the transcript file when merged cleanup is confirmed, alongside the preserved worktree and branch
- `sy stop <session> --cleanup --abandon` removes the transcript file when the operator explicitly discards the preserved session
- an already-missing transcript file should not block an otherwise safe cleanup path; it should be treated like another already-absent cleanup artifact
- if transcript removal fails after the stop state is already known, the command should surface that failure through the same handled cleanup-failure path used for other preserved artifact removal failures

This means the slice does extend the cleanup artifact set, but it should not change the existing merge-versus-abandon cleanup decision rules.

## Events

No new command surface beyond `sy logs` is needed, but launch events should carry the transcript path when available so exact-session and event inspection can stay aligned.

Likely additions:
- `sling.spawned` payload includes `logPath`
- `sling.completed` payload includes `logPath`
- `sling.failed` preserves `logPath` when transcript setup succeeded before launch failed

This keeps transcript location visible in durable operator history without adding new event types.

## Precedence And Interaction

Apply these rules:
1. `sy logs` is read-only and does not change runtime state
2. transcript presence does not suppress existing status hints such as `runtime.no_visible_progress`
3. transcript absence for legacy sessions should fail closed to an explicit message, not a guessed fallback
4. this slice should not change `sy stop` decision rules, `sy merge`, or mail semantics beyond treating the transcript as another preserved cleanup artifact
5. transcript capture should not be required for reading old preserved sessions that predate this slice; it should simply report that no transcript exists

## Implementation Notes

Keep the slice inside the current Codex-first operator loop.

Likely touch points:
- `src/runtimes/codex/index.ts`
- `src/commands/sling.ts`
- `src/commands/status.ts`
- `src/commands/logs.ts`
- `src/commands/logs.test.ts`
- `src/commands/sling.test.ts`
- `src/commands/status.test.ts`
- CLI registration in `src/index.ts`

The implementation should prefer simple file-backed handling:
- create parent log directories through the existing bootstrap layout
- pass the log path into runtime spawn setup
- read the file directly in `sy logs`
- avoid adding new persistence tables or schema

## Testing

Add focused tests for:
- `sy sling` records and surfaces a deterministic transcript path on successful launch
- supported-platform launch wiring writes transcript output to the expected path instead of `/dev/null`
- direct detached fallback on unsupported platforms redirects stdout/stderr to the transcript file
- `sy logs <session>` prints the default recent tail for one resolved session
- `sy logs <session> --all` prints the full transcript
- `sy logs` reports a clear message when a session exists but no transcript file exists yet
- `sy logs` rejects ambiguous selectors with the same rules as other session-targeting commands
- exact-session `sy status <session>` surfaces the transcript path
- launch events preserve `logPath` metadata where applicable
- plain `sy stop` preserves the transcript file for later inspection
- `sy stop --cleanup` and `sy stop --cleanup --abandon` remove the transcript file as part of preserved artifact cleanup
- already-missing transcript files do not block otherwise safe cleanup

## Risks

- transcript files can grow large for noisy sessions
- platform-specific `script` behavior can make capture wiring fragile across Unix variants
- direct-spawn fallback transcript behavior may differ from pseudo-terminal-backed capture

These risks are acceptable in this slice because the feature is operator-facing, read-only, and narrowly scoped to solving one observed inspection gap.

## Acceptance

This slice is complete when:
- operators can inspect detached Codex output through `sy logs <session>`
- exact-session `sy status` shows where the transcript lives
- detached launch no longer discards the only useful runtime output on supported platforms
- tests and docs reflect the new operator-facing behavior
