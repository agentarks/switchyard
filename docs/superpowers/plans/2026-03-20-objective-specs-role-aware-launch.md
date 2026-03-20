# Objective Specs And Role-Aware Launch Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cut `sy sling` over from the legacy detached-worker launch path to a bounded run bootstrap that creates one run, one lead session, and the durable objective/handoff/result artifacts needed for later orchestration work.

**Architecture:** Reuse the Chunk 2 orchestration and session stores, keep the existing bounded Codex runtime wrapper, and add a thin orchestration launcher boundary that writes run-scoped specs and reserved result-envelope paths before spawning the lead. Extend the worktree and naming helpers for run-aware lead integration branches/worktrees instead of inventing a second launch path.

**Tech Stack:** TypeScript, Node.js, commander, `node:sqlite`, git CLI, Codex `exec --json`, existing Switchyard stores/tests/docs

---

## Chunk 1: Launcher Contract Cutover

### Task 1: Add failing tests for run-aware launch bootstrap

**Files:**
- Create: `src/orchestration/launcher.test.ts`
- Create: `src/specs/objective.test.ts`
- Modify: `src/commands/sling.test.ts`
- Modify: `src/worktrees/manager.test.ts`
- Test: `src/orchestration/launcher.test.ts`
- Test: `src/specs/objective.test.ts`
- Test: `src/commands/sling.test.ts`
- Test: `src/worktrees/manager.test.ts`

- [ ] **Step 1: Write the failing objective-spec tests**

Add assertions for deterministic run-scoped objective output, for example:

```ts
assert.match(record.relativePath, /^\\.switchyard\\/objectives\\/run-/);
assert.match(document, /Role: lead/);
assert.match(document, /Merge policy: manual-ready/);
```

- [ ] **Step 2: Write the failing launcher bootstrap tests**

Add assertions that one launcher call creates:

```ts
assert.equal(run.state, "planning");
assert.equal(session.role, "lead");
assert.equal(task.role, "lead");
assert.match(resultEnvelopePath, /^\\.switchyard\\/agent-results\\//);
```

- [ ] **Step 3: Update `src/commands/sling.test.ts` for the CLI cutover**

Cover:
- `sy sling --task ...` without a positional agent
- stdout showing run id plus lead session details
- no legacy `Spawned <agent>` output
- command parsing rejects the removed positional contract

- [ ] **Step 4: Update `src/worktrees/manager.test.ts` for lead integration naming**

Cover:
- deterministic integration branch naming
- deterministic integration worktree naming
- collision checks for run-aware lead worktrees

- [ ] **Step 5: Run the targeted tests to verify RED**

Run: `npm test -- src/orchestration/launcher.test.ts src/specs/objective.test.ts src/commands/sling.test.ts src/worktrees/manager.test.ts`

Expected: FAIL because the launcher still uses the detached-worker flow and the objective-spec writer does not exist yet.

### Task 2: Implement objective specs, lead handoff specs, and reserved result envelopes

**Files:**
- Create: `src/orchestration/contracts.ts`
- Create: `src/orchestration/prompt.ts`
- Create: `src/specs/objective.ts`
- Modify: `src/specs/task.ts`
- Test: `src/specs/objective.test.ts`

- [ ] **Step 1: Implement the objective-spec writer**

Write a focused module that persists one run-level objective document and returns:

```ts
{
  path,
  relativePath,
  objectiveSummary
}
```

- [ ] **Step 2: Introduce the structured result-envelope contract**

Define the first JSON envelope types for lead launch, for example:

```ts
type AgentResultEnvelope =
  | { kind: "lead_plan"; summary: string; tasks: PlannedTaskEnvelope[] }
  | { kind: "run_complete"; outcome: "merge_ready" | "blocked" | "failed"; summary: string };
```

- [ ] **Step 3: Extend the handoff-spec writer for role-aware launch**

Add a role-aware handoff document shape that includes:
- run id
- role
- objective task id
- objective spec path
- result-envelope path
- integration branch/worktree

- [ ] **Step 4: Run the new spec-focused tests to verify GREEN**

Run: `npm test -- src/specs/objective.test.ts`

Expected: PASS with deterministic objective and handoff documents.

### Task 3: Implement the orchestration launcher boundary

**Files:**
- Create: `src/orchestration/launcher.ts`
- Modify: `src/orchestration/store.ts`
- Modify: `src/runtimes/codex/index.ts`
- Modify: `src/sessions/store.ts`
- Test: `src/orchestration/launcher.test.ts`

- [ ] **Step 1: Write the launcher flow around existing stores**

Create a helper that:
- allocates run id, task id, and session id
- creates the orchestration run
- creates the lead task
- creates the lead worktree
- writes the objective spec and lead handoff spec
- reserves the result-envelope path

- [ ] **Step 2: Spawn the lead through the existing runtime adapter**

Keep `codex exec --json`, but pass launch inputs derived from the role-aware contract rather than the raw task string alone.

- [ ] **Step 3: Persist the lead session linkage**

Create the session with:

```ts
{
  runId,
  role: "lead",
  objectiveTaskId: leadTaskId
}
```

- [ ] **Step 4: Run the launcher tests to verify GREEN**

Run: `npm test -- src/orchestration/launcher.test.ts`

Expected: PASS with one run, one lead task, one lead session, and deterministic artifact paths.

## Chunk 2: `sy sling` Command Cutover

### Task 4: Replace the legacy CLI and output contract

**Files:**
- Modify: `src/commands/sling.ts`
- Modify: `src/index.test.ts`
- Modify: `src/commands/sling.test.ts`
- Test: `src/commands/sling.test.ts`
- Test: `src/index.test.ts`

- [ ] **Step 1: Remove the `<agent>` positional from the command definition**

Make `sy sling` accept:
- `--task <instruction>`
- `--task-file <path>`
- optional runtime args passthrough only if still needed by the runtime wrapper

- [ ] **Step 2: Route the command through the new orchestration launcher**

Replace direct detached-worker setup with the launcher result object.

- [ ] **Step 3: Rewrite operator output to be run-aware**

Print:
- run id
- lead session id
- role
- target branch
- integration branch
- objective spec
- handoff spec
- result-envelope path
- log path
- worktree path

- [ ] **Step 4: Run the command tests to verify GREEN**

Run: `npm test -- src/commands/sling.test.ts src/index.test.ts`

Expected: PASS with the new CLI contract and output.

### Task 5: Update the docs that change meaning with the cutover

**Files:**
- Modify: `docs/current-state.md`
- Modify: `docs/next-steps.md`
- Modify: `docs/focus-tracker.md`
- Modify: `docs/cli-contract.md`

- [ ] **Step 1: Update `docs/current-state.md`**

Mark that:
- `sy sling` now creates one orchestration run plus one `lead`
- objective specs, lead handoff specs, and reserved result-envelope paths are real
- specialist launch/host behavior is still not implemented

- [ ] **Step 2: Update planning docs to move the recommended next task**

Shift the active milestone text from Chunk 3 launch bootstrap to the next bounded lead-host bundle.

- [ ] **Step 3: Run a doc consistency check**

Run: `rg -n "detached worker|<agent>|objective spec|lead handoff|result-envelope|role-aware launch" AGENTS.md PLAN.md docs src`

Expected: remaining legacy references are either removed or clearly historical.

## Chunk 3: Verification

### Task 6: Run the behavior checks and the repo check suite

**Files:**
- Test: `src/orchestration/launcher.test.ts`
- Test: `src/specs/objective.test.ts`
- Test: `src/commands/sling.test.ts`
- Test: `src/worktrees/manager.test.ts`

- [ ] **Step 1: Run the targeted Chunk 3 tests**

Run: `npm test -- src/orchestration/launcher.test.ts src/specs/objective.test.ts src/commands/sling.test.ts src/worktrees/manager.test.ts`

Expected: PASS

- [ ] **Step 2: Run the broader command regression checks affected by the cutover**

Run: `npm test -- src/commands/status.test.ts src/commands/events.test.ts src/commands/stop.test.ts`

Expected: PASS, or explicit follow-up fixes if session-centric surfaces need launch metadata updates.

- [ ] **Step 3: Run the repo check suite**

Run: `npm run check`

Expected: PASS

- [ ] **Step 4: Record example output for the PR description**

Capture one representative `sy sling --task "..."` output block showing:
- run id
- lead session id
- integration branch
- objective spec path
- handoff spec path
- result-envelope path
