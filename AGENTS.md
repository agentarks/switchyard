# AGENTS.md

## Project Identity

Switchyard is a CLI-first, Codex-first orchestration tool for one repository at a time.

The current target is a reliable bounded autonomous swarm loop:
- `sy init`
- `sy sling`
- `sy status`
- `sy events`
- `sy logs`
- `sy stop`
- `sy merge`
- `sy mail send`
- `sy mail check`
- `sy mail list`

In this direction, `sy sling` means "start one bounded orchestration run" for one operator objective, not "launch one detached worker and stop there."

The near-term product target is bounded autonomous swarm execution with explicit:
- `lead`
- `scout`
- `builder`
- `reviewer`

The `lead` owns:
- the integration branch
- the integration worktree
- composition of accepted specialist work

The rollout gate for v1 is:
- ship `manual-ready` first
- stop the first swarm implementation at a verified `merge_ready` result
- do not enable `auto-after-verify` until the repo adopts that policy explicitly in a later decision

Favor milestone-bundled work that makes this loop more reliable or easier to understand.
Batch adjacent in-scope changes when they share code, tests, and operator workflow meaning.

## Source Of Truth

Use the docs in `/docs` and `PLAN.md` as the project source of truth.

Read these first when the task touches behavior or scope:
- `docs/current-state.md`
- `docs/next-steps.md`
- `docs/backlog.md`
- `docs/focus-tracker.md`

Update docs when project state or workflow meaning changes.

## Scope Rules

In-scope work:
- tighter lifecycle behavior in the bounded orchestration loop
- clearer run and session status, event, and log inspection
- durable state, task/artifact records, tests, and docs that reduce operator risk
- role-aware orchestration boundaries that keep delegation explicit and bounded

Defer unless explicitly requested:
- multiple runtimes beyond Codex
- dashboard or TUI work
- watchdog daemons or supervisors
- broad analytics or filtering
- unbounded delegation trees
- `auto-after-verify` merge until the repo explicitly adopts that policy

## Working Rules

- Keep CLI behavior operator-first: explicit inputs, explicit outputs, explicit failure modes.
- Prefer coherent milestone-bundled changes over speculative abstractions.
- Do not re-triage the next tiny slice once the active milestone bundle is already clear.
- If you change behavior, add or update tests in the same session when practical.
- If you change CLI behavior or output, update the relevant docs.
- Run `npm run check` before closing a milestone bundle when behavior changed.
- Every material change requires 3 independent subagent reviews before it can be called review-clean, implementation-ready, or merge-ready.
- A material change includes code, behavior, architecture, workflow docs, specs, plans, merge or PR process changes, and any doc edit that changes meaning.
- Trivial typo-only edits that do not change meaning do not require the 3-review gate.
- Independent means 3 distinct reviewer identities. Reusing the same reviewer multiple times does not satisfy the gate.
- A review counts only when a reviewer returns an actual result on the current diff or current document state; timeout or no-response does not count.
- If any reviewer returns a non-trivial finding, the change is not clean.
- A non-trivial finding is any issue involving correctness, contract mismatch, behavioral regression, missing verification, unsafe workflow behavior, scope violation, or ambiguity that changes the effective contract, test oracle, or implementation path. Pure wording preferences or clearly advisory suggestions are not blocking by themselves.
- After fixes, rerun enough independent reviewers to re-establish 3 clean review results on the updated state.
- If reviewers disagree, resolve the conflict with direct verification and additional fresh review rather than declaring the change clean early.
- If 3 independent review-capable subagents are not available, the environment cannot advance a material change to review-clean, implementation-ready, or merge-ready. Surface the constraint and stop rather than inventing a weaker fallback.

## Pull Request Rules

- After implementing each milestone bundle, send a PR instead of leaving the work only local.
- Keep PRs milestone-scoped and batch adjacent in-scope work into one reviewable PR when it advances the same operator workflow step.
- Every PR that changes operator-facing behavior must include example output in the PR description.
- Call out concrete behavior changes, file references, assumptions, and any remaining risks.

## Decision Rule

When uncertain:
- choose the smaller change
- choose the smaller coherent bundle when several adjacent tasks belong together
- choose the more operator-readable output
- choose the path that improves the current repo-local lifecycle
- defer broader systems until the docs explicitly move the scope
