# Bounded Autonomous Swarm Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current single-agent `sy sling` session model with a bounded orchestration run that can plan, delegate, compose, verify, and close one objective through explicit `lead`, `scout`, `builder`, and `reviewer` roles.

**Architecture:** Reuse the current durable foundations where they still fit: keep `sessions` as per-agent runtime records, but add a separate orchestration layer for top-level swarm runs, task graphs, role policy, and artifact references. Execute the redesign in milestone bundles so the repo first adopts the new direction in its source-of-truth docs, then ships manual-merge-ready swarm execution, and only then enables automatic merge if the repo explicitly adopts that policy.

**Tech Stack:** TypeScript, Node.js, commander, `node:sqlite`, git CLI, Codex `exec --json`, existing Switchyard docs/tests

---

## Status

Contingent future-state plan only.

This document does not change the repo's current source of truth by itself. Until a separate direction-adoption PR lands and updates `AGENTS.md`, `PLAN.md`, and the planning docs, the active milestone remains the current reintegration/operator-closure work. Do not treat this file as the repo's new execution guide until Chunk 1 has landed as its own adopted bundle.

This spec is larger than one normal PR. Execute it as the chunk sequence below, with one reviewable milestone bundle per chunk. Do not skip Chunk 1: the current repo docs still define a narrower single-agent/manual-first loop, so implementation should not outrun the source of truth.

## Chunk 1: Direction And Policy Reset

### Task 1: Land the source-of-truth adoption bundle before activating this plan

**Files:**
- Modify: `AGENTS.md`
- Modify: `PLAN.md`
- Modify: `docs/architecture.md`
- Modify: `docs/cli-contract.md`
- Modify: `docs/current-state.md`
- Modify: `docs/merge-workflow.md`
- Modify: `docs/milestones.md`
- Modify: `docs/next-steps.md`
- Modify: `docs/backlog.md`
- Modify: `docs/focus-tracker.md`
- Modify: `docs/roadmap.md`
- Create: `docs/decisions/0005-bounded-autonomous-swarm-v1.md`

- [ ] **Step 1: Rewrite the project direction before touching runtime behavior**

Update the source-of-truth docs so they consistently say:
- until this adoption bundle lands, the current repo milestone remains reintegration/operator closure and this plan stays contingent rather than active
- `sy sling` now means “start one bounded orchestration run,” not “launch one detached worker”
- the near-term target is bounded autonomous swarm execution, not the reintegration-only hardening loop
- `lead`, `scout`, `builder`, and `reviewer` are first-class roles
- the lead owns the integration branch and composition step
- automatic merge is allowed only after an explicit policy adoption; until then, the first swarm bundle stops at a verified `merge_ready` result

- [ ] **Step 2: Add one explicit decision record for rollout policy**

Write `docs/decisions/0005-bounded-autonomous-swarm-v1.md` with the concrete rollout rule:

```md
Decision:
- adopt bounded orchestration as the near-term product target
- keep the host bounded for v1
- ship `manual-ready` merge policy first
- allow `auto-after-verify` only after a later explicit policy flip
```

- [ ] **Step 3: Review the wording for contradictions**

Run: `rg -n "single-agent|manual-first|reintegration and operator closure|bounded Codex runtime is now stable enough|auto-after-verify|merge_ready" AGENTS.md PLAN.md docs`

Expected: the docs consistently describe the bounded swarm direction, and any remaining manual-merge wording is framed as the temporary rollout gate rather than the permanent product contract.

## Chunk 2: Durable Orchestration State

### Task 2: Add failing tests for the new orchestration store, session metadata, and config

**Files:**
- Create: `src/orchestration/store.test.ts`
- Modify: `src/sessions/store.test.ts`
- Modify: `src/storage/bootstrap.test.ts`
- Modify: `src/config.test.ts`
- Test: `src/orchestration/store.test.ts`
- Test: `src/sessions/store.test.ts`
- Test: `src/storage/bootstrap.test.ts`
- Test: `src/config.test.ts`

- [ ] **Step 1: Write failing tests for top-level runs, tasks, artifacts, and agent-role metadata**

Cover at least:
- creating one bounded orchestration run with stored objective text, target branch, integration branch/worktree, and merge policy
- creating one `lead` session linked to that run
- storing child task records with parent/child relationships and file scopes
- storing artifact references for prompt/spec, logs, branches, worktrees, and verification output
- storing enough host checkpoint/lease state to resume an interrupted orchestration host without re-dispatching completed work
- parsing and defaulting new config fields such as concurrency cap and merge policy
- bootstrapping any new `.switchyard/` directories needed for objective specs or agent result envelopes

Use assertions in the shape of:

```ts
expect(run.mergePolicy).toBe("manual-ready");
expect(session.role).toBe("lead");
expect(task.fileScope).toEqual(["src/commands/sling.ts"]);
expect(artifacts.integrationWorktreePath).toContain(".switchyard/worktrees");
```

- [ ] **Step 2: Run the targeted tests to verify they fail**

Run: `npm test -- src/orchestration/store.test.ts src/sessions/store.test.ts src/storage/bootstrap.test.ts src/config.test.ts`

Expected: FAIL because the orchestration store, session-role metadata, and new config/bootstrap behavior do not exist yet.

### Task 3: Implement the durable orchestration model and config surface

**Files:**
- Create: `src/orchestration/types.ts`
- Create: `src/orchestration/store.ts`
- Modify: `src/config.ts`
- Modify: `src/config.test.ts`
- Modify: `src/sessions/store.ts`
- Modify: `src/sessions/types.ts`
- Modify: `src/storage/bootstrap.ts`
- Modify: `src/storage/bootstrap.test.ts`
- Modify: `src/types.ts`
- Test: `src/orchestration/store.test.ts`
- Test: `src/sessions/store.test.ts`

- [ ] **Step 1: Add the orchestration domain types**

Define explicit top-level records instead of overloading the current session/run types:

```ts
export type AgentRole = "lead" | "scout" | "builder" | "reviewer";
export type RunMergePolicy = "manual-ready" | "auto-after-verify";
export type OrchestrationRunState =
  | "planning"
  | "dispatching"
  | "integrating"
  | "verifying"
  | "merge_ready"
  | "merged"
  | "blocked"
  | "failed";
```

- [ ] **Step 2: Implement the orchestration store and schema migrations**

Create a new orchestration store module that persists:
- top-level runs
- task graph rows
- artifact references
- host checkpoint or lease metadata required for resume/recovery

Keep `sessions.db` as the per-agent runtime table, but migrate it to carry:
- `run_id`
- `role`
- `parent_session_id`
- `objective_task_id` or equivalent task linkage

- [ ] **Step 3: Extend the config/bootstrap contract**

Add an `orchestration` section to `SwitchyardConfig` and default config output:

```ts
orchestration: {
  maxConcurrentSpecialists: 3,
  reviewPolicy: "required",
  mergePolicy: "manual-ready"
}
```

Bootstrap any new durable directories now, for example:
- `.switchyard/objectives/`
- `.switchyard/agent-results/`

- [ ] **Step 4: Run the targeted tests to verify they pass**

Run: `npm test -- src/orchestration/store.test.ts src/sessions/store.test.ts src/storage/bootstrap.test.ts src/config.test.ts`

Expected: PASS with the new store, config, and schema behavior covered.

## Chunk 3: Objective Specs And Specialist Launch Contracts

### Task 4: Add failing tests for objective specs, result envelopes, and role-aware launch

**Files:**
- Create: `src/orchestration/launcher.test.ts`
- Create: `src/specs/objective.test.ts`
- Modify: `src/commands/sling.test.ts`
- Modify: `src/worktrees/manager.test.ts`
- Test: `src/orchestration/launcher.test.ts`
- Test: `src/specs/objective.test.ts`
- Test: `src/commands/sling.test.ts`

- [ ] **Step 1: Write failing tests for the new `sy sling` bootstrap behavior**

Cover at least:
- `sy sling --task ...` creates one orchestration run plus one `lead` session
- the run gets a lead-owned integration branch/worktree distinct from specialist worktrees
- one top-level objective spec is written under `.switchyard/objectives/`
- one per-agent handoff/spec file is written under `.switchyard/specs/`
- one structured result envelope path is reserved under `.switchyard/agent-results/`
- launcher prompts differ by role and require structured output instead of free-form “best effort” narration

- [ ] **Step 2: Run the targeted tests to verify they fail**

Run: `npm test -- src/orchestration/launcher.test.ts src/specs/objective.test.ts src/worktrees/manager.test.ts src/commands/sling.test.ts`

Expected: FAIL because `sy sling` still creates only one worker session and the role-aware orchestration bootstrap does not exist.

### Task 5: Implement the objective/spec writer and specialist launcher boundary

**Files:**
- Create: `src/orchestration/contracts.ts`
- Create: `src/orchestration/launcher.ts`
- Create: `src/orchestration/prompt.ts`
- Create: `src/specs/objective.ts`
- Modify: `src/commands/sling.ts`
- Modify: `src/runtimes/codex/index.ts`
- Modify: `src/specs/task.ts`
- Modify: `src/worktrees/manager.ts`
- Modify: `src/worktrees/naming.ts`
- Test: `src/orchestration/launcher.test.ts`
- Test: `src/specs/objective.test.ts`

- [ ] **Step 1: Introduce a structured agent-result contract**

Do not make the host parse free-form prose. Define a JSON result envelope that every specialist must write before exit, for example:

```ts
type AgentResultEnvelope =
  | { kind: "lead_plan"; tasks: PlannedTaskEnvelope[]; summary: string }
  | { kind: "builder_result"; taskId: string; branch: string; verification: VerificationResult[] }
  | { kind: "review_result"; taskId: string; passed: boolean; reasons: string[] }
  | { kind: "run_complete"; outcome: "merge_ready" | "merged" | "blocked" | "failed"; summary: string };
```

- [ ] **Step 2: Add the objective/spec writers**

Write:
- one top-level objective spec describing the operator request and run-level policy
- one per-agent handoff spec containing role, task scope, file ownership, and required result-envelope path

- [ ] **Step 3: Add role-aware launch helpers**

Teach the launcher/worktree layer to create:
- the lead integration branch/worktree
- role-specific specialist branches/worktrees
- deterministic log/spec/result paths per session

Keep the existing bounded `codex exec --json` runtime wrapper; parameterize it with the role-specific prompt/spec contract instead of inventing a second runtime path.

- [ ] **Step 4: Run the targeted tests to verify they pass**

Run: `npm test -- src/orchestration/launcher.test.ts src/specs/objective.test.ts src/worktrees/manager.test.ts src/commands/sling.test.ts`

Expected: PASS with `sy sling` creating a run, a lead session, and the durable files needed for later orchestration.

## Chunk 4: Bounded Lead Host And Dispatch Policy

### Task 6: Add failing tests for lead dispatch, bounded delegation, and stop cascade behavior

**Files:**
- Create: `src/orchestration/host.test.ts`
- Modify: `src/commands/stop.test.ts`
- Modify: `src/events/store.test.ts`
- Modify: `src/mail/store.test.ts`
- Test: `src/orchestration/host.test.ts`
- Test: `src/commands/stop.test.ts`

- [ ] **Step 1: Write failing tests for the orchestration loop**

Cover at least:
- only the `lead` may dispatch children
- `scout`, `builder`, and `reviewer` cannot spawn further agents
- builder file scopes must not overlap
- concurrency is capped by config
- completed child results advance the task graph and persist run-scoped events
- if the orchestration host dies after dispatch, the run can be resumed from durable state without re-running already-finished specialists
- `sy stop <run-or-lead>` stops the full run and marks unfinished tasks truthfully

- [ ] **Step 2: Run the targeted tests to verify they fail**

Run: `npm test -- src/orchestration/host.test.ts src/commands/stop.test.ts src/events/store.test.ts src/mail/store.test.ts`

Expected: FAIL because there is no orchestration host or run-scoped stop/dispatch policy yet.

### Task 7: Implement the bounded lead host and run-scoped policy layer

**Files:**
- Create: `src/orchestration/host.ts`
- Create: `src/orchestration/policy.ts`
- Create: `src/orchestration/recovery.ts`
- Create: `src/orchestration/result.ts`
- Modify: `src/commands/sling.ts`
- Modify: `src/commands/stop.ts`
- Modify: `src/events/store.ts`
- Modify: `src/events/types.ts`
- Modify: `src/mail/store.ts`
- Modify: `src/mail/types.ts`
- Modify: `src/sessions/store.ts`
- Test: `src/orchestration/host.test.ts`

- [ ] **Step 1: Implement the host loop around the lead result envelope**

The host should:
- wait for the `lead` result envelope
- validate each requested subtask against the policy layer
- persist accepted tasks before spawning specialists
- launch specialists only after their task rows, file scopes, and artifact paths are durable
- reconcile child completion/failure back into the run state
- persist enough host progress to resume an interrupted run from durable state

- [ ] **Step 2: Make events and mail run-aware**

Extend durable events and mail so aggregate operator views can group by run as well as by session. A minimal extension is:

```ts
interface CreateEventInput {
  runId?: string | null;
  sessionId?: string | null;
  agentName?: string | null;
}
```

Do the same for mail, so agent-to-agent and operator-to-agent traffic can be rendered by run later without lossy joins.

- [ ] **Step 3: Implement the recovery and resume contract**

Add one explicit resume path, for example `sy sling --resume <run-id>`, that:
- reloads the durable run, task graph, artifact references, and live child-session state
- resumes only unfinished orchestration work
- re-enters composition, verification, or closure from the last durable checkpoint
- fails explicitly when the stored state is insufficient to resume truthfully

- [ ] **Step 4: Implement run-level stop semantics**

`sy stop` should stop:
- the whole run when the selector resolves to a run id or the lead session
- one selected specialist only when the operator explicitly targets that specialist session id

Persist truthful task/run outcomes instead of collapsing every interruption into one generic failure.

- [ ] **Step 5: Run the targeted tests to verify they pass**

Run: `npm test -- src/orchestration/host.test.ts src/commands/stop.test.ts src/events/store.test.ts src/mail/store.test.ts`

Expected: PASS with bounded lead-only delegation, durable run-aware events/mail, and correct stop behavior.

## Chunk 5: Composition, Verification, And Merge Policy

### Task 8: Add failing tests for integration composition, verification, and merge gating

**Files:**
- Create: `src/orchestration/compose.test.ts`
- Create: `src/orchestration/verify.test.ts`
- Modify: `src/commands/merge.test.ts`
- Modify: `src/commands/sling.test.ts`
- Test: `src/orchestration/compose.test.ts`
- Test: `src/orchestration/verify.test.ts`
- Test: `src/commands/merge.test.ts`

- [ ] **Step 1: Write failing tests for the integration branch workflow**

Cover at least:
- accepted builder branches compose onto the lead-owned integration branch in deterministic order
- verification commands run on the integration worktree, not on disconnected builder branches
- failed review or failed verification yields `blocked` or `failed`, never optimistic merge
- `manual-ready` policy leaves the run at `merge_ready`
- `auto-after-verify` policy performs the final merge only when every required check passes

- [ ] **Step 2: Run the targeted tests to verify they fail**

Run: `npm test -- src/orchestration/compose.test.ts src/orchestration/verify.test.ts src/commands/merge.test.ts src/commands/sling.test.ts`

Expected: FAIL because there is no integration-branch composition or merge-policy gate yet.

### Task 9: Implement composition, verification, and the staged merge policy

**Files:**
- Create: `src/orchestration/compose.ts`
- Create: `src/orchestration/verify.ts`
- Modify: `src/commands/merge.ts`
- Modify: `src/git/status.ts`
- Modify: `src/orchestration/host.ts`
- Modify: `src/orchestration/types.ts`
- Test: `src/orchestration/compose.test.ts`
- Test: `src/orchestration/verify.test.ts`

- [ ] **Step 1: Implement deterministic composition on the integration branch**

Compose accepted builder branches in one stable order, for example task creation order plus task id tie-breaker. Record conflicts and stop immediately if composition fails.

- [ ] **Step 2: Implement verification on the integration worktree**

Run required repo checks only after composition:

```ts
interface VerificationResult {
  command: string;
  exitCode: number;
  stdoutPath?: string;
  stderrPath?: string;
}
```

Persist both the verification summary and artifact references so `status` and `events` can explain what happened later.

- [ ] **Step 3: Preserve the rollout gate between `manual-ready` and `auto-after-verify`**

Implement both code paths, but keep them explicit:
- `manual-ready` stops at a verified integration result and expects `sy merge` to merge the integration branch
- `auto-after-verify` performs the final merge into the stored target branch and records the merged outcome automatically

Do not let the code silently fall through from one policy to the other.

- [ ] **Step 4: Run the targeted tests to verify they pass**

Run: `npm test -- src/orchestration/compose.test.ts src/orchestration/verify.test.ts src/commands/merge.test.ts src/commands/sling.test.ts`

Expected: PASS with truthful merge-ready, blocked, failed, and auto-merged outcomes.

## Chunk 6: Closure, Cleanup, And Post-Closure History

### Task 10: Add failing tests for swarm cleanup, abandon, and post-closure history

**Files:**
- Create: `src/orchestration/cleanup.test.ts`
- Modify: `src/commands/stop.test.ts`
- Modify: `src/commands/status.test.ts`
- Modify: `src/commands/merge.test.ts`
- Test: `src/orchestration/cleanup.test.ts`
- Test: `src/commands/stop.test.ts`
- Test: `src/commands/status.test.ts`

- [ ] **Step 1: Write failing tests for the new closure lifecycle**

Cover at least:
- safe cleanup of specialist worktrees after `merged` runs
- safe cleanup of the lead integration worktree only after merge or explicit abandon
- explicit `--cleanup --abandon` handling for unresolved swarm runs
- partial cleanup failure visibility when one artifact is already missing or removal fails
- exact-session and exact-run status retaining understandable post-closure artifact history after cleanup

- [ ] **Step 2: Run the targeted tests to verify they fail**

Run: `npm test -- src/orchestration/cleanup.test.ts src/commands/stop.test.ts src/commands/status.test.ts src/commands/merge.test.ts`

Expected: FAIL because the swarm plan currently has no defined cleanup or post-closure contract for lead and specialist artifacts.

### Task 11: Implement swarm closure, cleanup, and retained artifact history

**Files:**
- Create: `src/orchestration/cleanup.ts`
- Modify: `src/commands/merge.ts`
- Modify: `src/commands/status.ts`
- Modify: `src/commands/stop.ts`
- Modify: `src/orchestration/host.ts`
- Modify: `src/orchestration/types.ts`
- Modify: `src/sessions/cleanup.ts`
- Test: `src/orchestration/cleanup.test.ts`
- Test: `src/commands/status.test.ts`

- [ ] **Step 1: Define the swarm closure rules explicitly**

Specify which artifacts are:
- preserved until merge or abandon
- removable only after safe merge cleanup
- retained as history even after physical cleanup, for example logs, spec paths, verification records, and artifact-presence summaries

- [ ] **Step 2: Implement explicit cleanup and abandon behavior**

Extend the current cleanup model so it can handle:
- specialist worktrees and branches
- the lead integration branch/worktree
- durable artifact references for merged, abandoned, blocked, and failed runs

The cleanup path must fail closed when it cannot confirm the safety of removing preserved swarm artifacts.

- [ ] **Step 3: Keep post-closure inspection truthful**

After cleanup, `sy status` should still explain:
- what the run produced
- whether it was merged or abandoned
- which artifacts remain present versus only durably referenced
- why cleanup failed when it did not complete cleanly

- [ ] **Step 4: Run the targeted tests to verify they pass**

Run: `npm test -- src/orchestration/cleanup.test.ts src/commands/stop.test.ts src/commands/status.test.ts src/commands/merge.test.ts`

Expected: PASS with merged, abandoned, blocked, and partially cleaned-up swarm runs staying operator-readable after closure.

## Chunk 7: Operator Surfaces And End-To-End Proof

### Task 12: Add failing tests for run-centric status, events, logs, and mail views

**Files:**
- Modify: `src/commands/status.test.ts`
- Modify: `src/commands/events.test.ts`
- Modify: `src/commands/logs.test.ts`
- Modify: `src/commands/mail.test.ts`
- Modify: `src/commands/session-selector.test.ts`
- Test: `src/commands/status.test.ts`
- Test: `src/commands/events.test.ts`
- Test: `src/commands/logs.test.ts`
- Test: `src/commands/mail.test.ts`

- [ ] **Step 1: Write failing CLI tests for the new operator-facing model**

Cover at least:
- all-session `sy status` shows run id, objective summary, lead state, specialist progress, verification state, and merge state
- exact-run `sy status <run>` shows the lead plus child agent rows and task graph progress
- `sy events` renders one orchestration timeline across lead and specialists
- `sy logs` can resolve the lead or one exact specialist session
- `sy mail` can inspect run-related communication without losing the exact session path when needed

- [ ] **Step 2: Run the targeted tests to verify they fail**

Run: `npm test -- src/commands/status.test.ts src/commands/events.test.ts src/commands/logs.test.ts src/commands/mail.test.ts src/commands/session-selector.test.ts`

Expected: FAIL because the CLI still assumes one session is the primary unit of work.

### Task 13: Implement the run-centric operator surfaces and finalize docs

**Files:**
- Modify: `src/commands/events.ts`
- Modify: `src/commands/logs.ts`
- Modify: `src/commands/mail.ts`
- Modify: `src/commands/session-selector.ts`
- Modify: `src/commands/status.ts`
- Modify: `docs/cli-contract.md`
- Modify: `docs/current-state.md`
- Modify: `docs/merge-workflow.md`
- Modify: `docs/focus-tracker.md`
- Modify: `docs/roadmap.md`
- Modify: `docs/slice-ledger.md`
- Test: `src/commands/status.test.ts`
- Test: `src/commands/events.test.ts`
- Test: `src/commands/logs.test.ts`
- Test: `src/commands/mail.test.ts`

- [ ] **Step 1: Make `status` and `events` run-first**

Render:
- top-level run lifecycle state
- lead state
- child specialist progress
- verification summary
- merge state/outcome

Keep exact agent/session drill-down available, but make the run the primary operator unit.

- [ ] **Step 2: Make logs and mail compatible with run-first inspection**

Allow the operator to start from the run, then drill into one lead or specialist session without ambiguity. Preserve exact ids in all operator-facing output.

- [ ] **Step 3: Update the contract and current-state docs to match the real CLI**

Document only behavior that actually shipped in the code from Chunks 2 through 7. Do not leave the docs at the proposal level once the behavior is implemented.

### Task 14: Prove the bounded swarm workflow end to end

**Files:**
- Verify: `src/orchestration/cleanup.ts`
- Verify: `src/orchestration/store.ts`
- Verify: `src/orchestration/launcher.ts`
- Verify: `src/orchestration/host.ts`
- Verify: `src/orchestration/recovery.ts`
- Verify: `src/orchestration/compose.ts`
- Verify: `src/orchestration/verify.ts`
- Verify: `src/commands/sling.ts`
- Verify: `src/commands/status.ts`
- Verify: `src/commands/events.ts`
- Verify: `src/commands/logs.ts`
- Verify: `src/commands/mail.ts`
- Verify: `src/commands/stop.ts`
- Verify: `src/commands/merge.ts`
- Verify: `docs/cli-contract.md`
- Verify: `docs/current-state.md`
- Verify: `docs/merge-workflow.md`

- [ ] **Step 1: Run the bounded-swarm focused test set**

Run: `npm test -- src/orchestration/store.test.ts src/orchestration/launcher.test.ts src/orchestration/host.test.ts src/orchestration/compose.test.ts src/orchestration/verify.test.ts src/commands/sling.test.ts src/commands/status.test.ts src/commands/events.test.ts src/commands/logs.test.ts src/commands/mail.test.ts src/commands/stop.test.ts src/commands/merge.test.ts`

Expected: PASS with end-to-end coverage for:
- one simple successful objective
- one multi-builder objective
- one verification failure
- one blocked/conflicted run

- [ ] **Step 2: Run the full project check**

Run: `npm run check`

Expected: PASS with build, typecheck, lint/test checks, and the new orchestration regression coverage green.

- [ ] **Step 3: Review the final diff**

Run: `git diff -- AGENTS.md PLAN.md docs src`

Expected: docs, durable state, runtime flow, CLI output, and merge policy all describe the same bounded autonomous swarm model without leftover single-agent contradictions.
