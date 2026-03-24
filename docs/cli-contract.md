# CLI Contract

This file defines the adopted user-facing behavior for Switchyard as it moves to bounded autonomous swarm v1.

The current implementation still reflects an earlier bounded single-agent loop in several places. When that happens, treat this file as the product contract the code should move toward, and use [docs/current-state.md](current-state.md) to understand the current gap honestly.

## Global Rules

- The CLI name is `sy`.
- Commands should work from the repository root, a nested directory, or a git worktree unless a command explicitly requires otherwise.
- Failures should be explicit and operator-readable.
- `sy sling` means "start one bounded orchestration run" for one objective.
- Runs are bounded: one `lead` may dispatch `scout`, `builder`, and `reviewer` specialists, and only the `lead` may do so.
- The `lead` owns the integration branch, integration worktree, and composition step.
- The default merge policy is `manual-ready`.
- `auto-after-verify` must not become the default or the implicit fallback path without a later explicit policy adoption.

## `sy init`

Purpose:
- initialize Switchyard for the current git repository

Expected behavior:
- resolve the canonical repository root, even when invoked from a nested directory or worktree
- write bootstrap artifacts under that canonical repo root
- create and maintain the durable `.switchyard/` layout needed for orchestration runs
- keep bootstrap successful even when the chosen canonical branch does not point to a commit yet
- warn explicitly when the chosen canonical branch does not point to a commit yet before a later `sy sling`

## `sy sling`

Purpose:
- start one bounded orchestration run from one explicit objective

Adopted contract:
- accept one objective via `--task <instruction>` or `--task-file <path>`
- continue accepting option-like runtime pass-through arguments such as `--sandbox read-only` or `--model gpt-5`
- create one top-level run record
- create one `lead` session linked to that run
- create the lead-owned integration branch and integration worktree
- write one durable objective spec
- write one lead handoff spec and deterministic result-envelope path
- launch one bounded lead runtime through the configured runtime adapter
- default the run merge policy to `manual-ready`
- record durable launch and failure events that preserve role, objective, spec, and artifact metadata

Rollout note:
- the launcher cutover has landed: the CLI now accepts only one objective source and starts one run plus one `lead`
- broader run-centric inspection, host recovery, and specialist lifecycle behavior are still rollout work, not completed contract

## `sy status`

Purpose:
- render the most actionable operator view of a run or exact agent session

Adopted contract:
- the default view is run-centric
- all-run status should show objective summary, lead state, specialist progress, verification state, and merge state
- exact-run status should show task graph progress plus lead and specialist rows
- exact lead or specialist inspection should stay available when the operator needs session-level detail
- status should preserve explicit next-step guidance and artifact presence after closure

## `sy events`

Purpose:
- show the durable orchestration timeline

Adopted contract:
- the primary timeline is run-centric across the lead and specialists
- exact session inspection remains available when the operator intentionally drills into one lead or specialist
- selector failures must stay explicit and avoid accidental ambiguity

## `sy logs`

Purpose:
- inspect bounded runtime output for a lead or specialist session

Adopted contract:
- logs should resolve a run's lead or one exact specialist session
- logs should preserve readable structured rendering over the bounded runtime transcript
- missing-log behavior must stay explicit and operator-readable

## `sy stop`

Purpose:
- stop one bounded orchestration run or one explicitly targeted specialist

Adopted contract:
- if the selector resolves to a run id or the lead session, stop the whole run
- if the selector resolves to a specialist session id, stop only that specialist
- preserve truthful run and task outcomes
- keep cleanup separate from stop unless it is explicitly requested and safe
- fail closed when cleanup safety cannot be established

## `sy merge`

Purpose:
- close a verified run by merging the lead-owned integration branch

Adopted contract:
- `manual-ready` is the initial rollout policy
- under `manual-ready`, Switchyard stops after verified integration at `merge_ready`
- `sy merge` or explicit git then performs the final merge of the integration branch into the target branch
- under a later adopted `auto-after-verify` policy, Switchyard may perform that final merge automatically only after required checks pass
- Switchyard must not silently fall through from `manual-ready` to `auto-after-verify`

## Merge And Reintegration

Adopted contract:
- the `lead` owns the integration branch and integration worktree
- accepted builder outputs compose onto that integration branch in deterministic order
- required verification runs there, not on disconnected builder branches
- the initial rollout stops at a verified `merge_ready` result
- the operator keeps the final merge decision until a later explicit policy flip says otherwise

Implementation note:
- the current code still exposes a preserved-session merge path
- that remains the truthful implementation state today, but it is no longer the long-term product contract

## `sy mail`

Purpose:
- support small, durable communication without losing run context

Adopted contract:
- mail remains intentionally small
- the system should support run-aware communication while preserving exact session-level inspection when needed
- operator-visible output should keep exact run or session resolution explicit

## Priority Order

When the contract and implementation diverge, prefer fixing the implementation if this file still matches the intended product direction. If the product direction changes, update this file in the same session.
