# Codex Exec Runtime Design

## Summary

This slice replaces Switchyard's detached interactive Codex launch path with a task-bounded headless runtime built on `codex exec --json`.

The goal is to make `sy sling` produce live, operator-readable logs and truthful task completion state without broadening scope into tmux, interactive attach, multi-runtime abstraction, or a broader supervision model.

## Problem

The current detached interactive Codex path is not reliable enough for the operator loop it is meant to support.

From real end-to-end testing on macOS:
- the BSD `script` wrapper buffers transcript output by default, so `sy logs` can stay empty while the task is running
- adding flush behavior alone is not enough because detached interactive Codex emits terminal capability queries and appears to stall in a headless PTY
- the resulting transcript content is not a useful operator-facing status stream
- `sy status` can still report the runtime as healthy because the wrapper pid is alive, even when the task is not making meaningful progress

That means the current model fails at the specific thing it was added to solve:
- operators cannot rely on `sy logs` for live observability
- operators cannot trust a naturally exiting detached task to be classified correctly
- operators have a pid-backed session model, but not a truthful task-backed workflow

## Goals

- Make `sy sling` launch one bounded Codex task that can finish on its own
- Preserve live operator observability through `.switchyard/logs/`
- Make `sy logs <session>` readable while the task is running
- Treat natural task completion as the normal success path
- Keep the current repo-local session, run, mail, status, events, stop, and merge model intact where possible
- Keep the slice smaller than tmux-backed interactive runtime control

## Non-Goals

- No tmux adoption in this slice
- No interactive attach or live input injection
- No multiple runtimes beyond Codex
- No new daemon, watchdog, or background supervisor
- No broad runtime abstraction redesign
- No dashboard or TUI work

## Proposed Runtime Model

`sy sling` should stop launching interactive `codex` and instead launch:
- `codex exec --json <task>`

Runtime properties:
- detached process, still tracked by pid
- stdout/stderr redirected directly to the deterministic session log file
- no `script` wrapper on macOS/BSD for this path
- one launched process represents one explicit operator task

This changes the mental model from:
- "start an agent session that stays open until explicitly stopped"

to:
- "start one Codex task run that may finish naturally and should be observed truthfully while it runs"

## Launch Behavior

`sy sling` should keep its current operator-facing contract around:
- explicit `--task` or `--task-file`
- deterministic worktree creation
- deterministic session id
- durable task spec file
- run creation
- launch-time operator output

But the launch command and emitted metadata should change:
- runtime command metadata should reflect `codex exec --json`
- log output should now contain Codex JSONL events instead of a raw terminal transcript
- launch should still fail explicitly if the process cannot be started or the log file cannot be opened

This slice should continue to treat the log path as deterministic operator-facing state:
- `.switchyard/logs/<agent>-<session>.log`

## Lifecycle Semantics

Session state and run state should adapt to a bounded task model.

### During Launch

- `sy sling` persists the session as `starting`
- the launch window still verifies that the process survives long enough to count as started
- after that window, the session becomes `starting` with a stored pid, exactly as today, until `sy status` reconciliation promotes it to `running`

### While Running

- `sy status` should continue to show an active task as `running`
- unread mail, cleanup readiness, and run task ownership remain unchanged
- `sy logs` should provide live operator inspection from the structured JSONL log file

### Natural Completion

Natural process exit is no longer inherently a failure.

When a running `codex exec --json` process exits:
- exit code `0` should reconcile to a successful finished task outcome
- nonzero exit should reconcile to a failed finished task outcome
- the latest run should move to `finished`
- the session should no longer be treated as an active runtime

The exact session state label can remain `stopped` or become a new terminal session state only if the change stays narrow. The key operator-facing requirement is:
- `sy status` must clearly show a successful finished task rather than a dead runtime misclassified as failure

## Logs Behavior

The on-disk log file should remain raw Codex JSONL.

`sy logs <session>` should become a readable renderer over that file rather than a raw terminal transcript dumper.

Default rendering should:
- keep the current heading with agent, session id, and log path
- parse JSONL line by line when possible
- render assistant messages plainly
- render command execution start/completion lines concisely
- render command output as readable blocks when present
- render final completion/usage information when present
- ignore or pass through malformed or partial lines without crashing

This keeps the stored file faithful while making the operator command useful.

`--all` should continue to mean full log history.
The default non-`--all` view may continue to tail recent lines/events, as long as the output stays readable and live.

## Status And Events

`sy status` should stop treating every natural runtime exit as failure.

Required behavior:
- successful natural completion should surface as a success-oriented recent summary
- failed natural completion should surface as a failure-oriented recent summary
- exact-session status should continue to show the log path
- the all-session table should remain compact but reflect terminal success/failure honestly in run state and recent context

Durable events should distinguish:
- launch success
- task completion success
- task completion failure
- explicit operator stop/cancel

This can be done either with new event types or with richer payloads on existing runtime exit events. The operator requirement matters more than the exact event taxonomy.

## Stop Semantics

`sy stop <session>` becomes cancellation for an in-flight headless task.

Required behavior:
- if the task is still running, `sy stop` should terminate it and record a cancellation-oriented terminal outcome
- if the task already finished naturally, `sy stop` should not pretend it stopped a live runtime
- cleanup behavior after completion should remain available
- transcript/log preservation rules remain the same unless cleanup is requested

This keeps `sy stop` useful while acknowledging that normal completion no longer requires an explicit stop.

## Comparison To Overstory

Overstory avoids this exact problem by using tmux for interactive sessions and reading pane content directly. Switchyard should not copy that approach in this slice.

Reasons:
- tmux adds a larger dependency and control surface
- tmux pulls the product toward interactive attach and input injection semantics
- current docs explicitly keep tmux out of scope unless a narrower approach fails

`codex exec --json` is the smaller change because it:
- works headlessly without a pseudo-terminal transcript hack
- produces live structured output
- fits the explicit task-oriented `sy sling` contract more naturally than a long-lived interactive TUI

## Implementation Notes

Likely touch points:
- `src/runtimes/codex/index.ts`
- `src/runtimes/codex/index.test.ts`
- `src/commands/sling.ts`
- `src/commands/sling.test.ts`
- `src/commands/status.ts`
- `src/commands/status.test.ts`
- `src/commands/logs.ts`
- `src/commands/logs.test.ts`
- `docs/cli-contract.md`
- `docs/current-state.md`
- `docs/next-steps.md`

Implementation guidance:
- keep the runtime seam narrow and Codex-specific
- prefer tolerant parsing for JSONL logs
- do not add new persistence tables unless the existing session/run/event model proves insufficient
- preserve exact session-id visibility in operator output

## Testing

Add focused coverage for:
- runtime spawn now using `codex exec --json`
- direct stdout/stderr redirection to the deterministic log path
- live-readable log content while the process is still running
- `sy logs` rendering structured JSONL into readable operator output
- malformed or partial JSONL lines not crashing `sy logs`
- natural exit code `0` reconciling to successful finished task state
- nonzero exit reconciling to failed finished task state
- `sy stop` cancelling a still-running exec task
- post-completion `sy stop --cleanup` behavior remaining truthful
- existing exact-session selector and ambiguity rules staying intact

## Risks

- Codex JSONL event shape may evolve, so rendering must be tolerant
- natural completion semantics touch status, run, and stop behavior together, so partial implementation would create inconsistent operator output
- some existing tests and docs currently assume a long-lived interactive runtime and will need coordinated updates

## Acceptance

This slice is complete when:
- `sy sling` launches a headless Codex task via `codex exec --json`
- `sy logs <session>` shows live readable output while the task is still running
- natural exit code `0` is represented as successful task completion
- nonzero natural exit is represented as failure
- `sy stop` is reserved for cancellation or cleanup rather than normal completion
- tests and docs reflect the new bounded-task runtime behavior
