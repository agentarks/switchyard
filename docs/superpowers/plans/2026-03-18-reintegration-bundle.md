# Reintegration Bundle Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace slice-first execution with milestone-bundle execution and finish the current reintegration milestone by making exact-session status readable through review, closure, and post-closure history.

**Architecture:** Keep the implementation inside the existing `sy status` control plane plus workflow docs. Add exact-session derived summary/artifact state from data Switchyard already owns or can inspect locally, without new persistence tables or a new top-level command. Update repo guidance so the next work executes as one bundled milestone instead of repeated tiny-slice triage.

**Tech Stack:** TypeScript, Node.js, commander, git CLI, existing Switchyard docs/tests

---

## Chunk 1: Workflow Guidance

### Task 1: Replace slice-first repo guidance with milestone-bundle execution

**Files:**
- Modify: `AGENTS.md`
- Modify: `CONTRIBUTING.md`
- Modify: `docs/dev-workflow.md`

- [ ] **Step 1: Update the docs with the new workflow rule**

Add wording that:
- keeps scope milestone-focused instead of broad
- allows batching adjacent milestone work into one branch/PR
- removes the expectation that every small vertical slice must become its own PR
- says planning docs are read at milestone start, then execution proceeds from one active bundle checklist unless scope changes

- [ ] **Step 2: Review the wording for consistency**

Run: `rg -n "vertical slice|feature slice|smallest change|next slice|batch" AGENTS.md CONTRIBUTING.md docs/dev-workflow.md`
Expected: the new wording consistently prefers milestone bundles and no longer instructs tiny-slice execution as the default.

## Chunk 2: Exact-Session Reintegration Summary

### Task 2: Add failing tests for exact-session summary and artifact history

**Files:**
- Modify: `src/commands/status.test.ts`
- Test: `src/commands/status.test.ts`

- [ ] **Step 1: Write failing tests for preserved-review, cleanup-ready, and closed-history sessions**

Add focused tests that assert selected-session `sy status <session>` prints:
- `Summary:` for a completed preserved session that still needs operator review
- `Summary:` for a merged session that is ready for cleanup
- `Summary:` for a closed session whose preserved artifacts are already absent
- `Artifacts:` with explicit `branch=...`, `worktree=...`, `log=...`, `spec=...` states

- [ ] **Step 2: Run the targeted tests to verify they fail**

Run: `npm test -- src/commands/status.test.ts`
Expected: FAIL because the new `Summary:` and `Artifacts:` lines do not exist yet.

### Task 3: Implement derived exact-session summary and artifact inspection

**Files:**
- Modify: `src/commands/status.ts`
- Possibly modify: `src/git/status.ts`
- Test: `src/commands/status.test.ts`

- [ ] **Step 1: Add minimal helpers for exact-session artifact inspection**

Implement helpers that can derive:
- whether the preserved branch still exists
- whether the preserved worktree path exists
- whether the transcript log exists
- whether the stored task spec exists when Switchyard knows its path

- [ ] **Step 2: Add a derived exact-session summary**

Implement `Summary:` generation from existing state using conservative rules:
- preserved completed work => operator review summary
- merged cleanup-ready work => cleanup summary
- fully closed merged/abandoned work => post-closure history summary
- failed or launch-failed work => inspect-before-reintegration summary

- [ ] **Step 3: Render the new summary and artifact lines in exact-session output**

Keep the all-session table unchanged. In selected-session output, print:
- `Summary: ...`
- `Artifacts: branch=..., worktree=..., log=..., spec=...`

- [ ] **Step 4: Run the targeted tests to verify they pass**

Run: `npm test -- src/commands/status.test.ts`
Expected: PASS for the new exact-session summary/artifact coverage and existing status regressions.

## Chunk 3: Contract And State Docs

### Task 4: Update operator docs for the new bundle behavior

**Files:**
- Modify: `docs/cli-contract.md`
- Modify: `docs/current-state.md`
- Modify: `docs/next-steps.md`
- Modify: `docs/backlog.md`
- Modify: `docs/focus-tracker.md`
- Modify: `docs/roadmap.md`

- [ ] **Step 1: Update CLI/state docs for exact-session reintegration summaries**

Document that exact-session status now includes:
- a concise `Summary:` line for completed/closed work
- an `Artifacts:` line that preserves post-closure inspection value even after cleanup

- [ ] **Step 2: Update planning docs to switch from slices to the active reintegration bundle**

Advance the planning docs so they describe:
- milestone-bundle execution
- the current reintegration bundle as in progress/completed once implemented
- the next backlog only after this bundled milestone work

- [ ] **Step 3: Run focused doc checks**

Run: `rg -n "completed-task review summaries|session closure and post-closure history|vertical slice|feature slice" docs AGENTS.md CONTRIBUTING.md`
Expected: planning docs reflect milestone-bundle wording and operator docs describe the new exact-session summary/artifact behavior.

## Chunk 4: Full Verification

### Task 5: Verify the full bundle

**Files:**
- Verify: `AGENTS.md`
- Verify: `CONTRIBUTING.md`
- Verify: `docs/dev-workflow.md`
- Verify: `src/commands/status.ts`
- Verify: `src/commands/status.test.ts`
- Verify: `docs/cli-contract.md`
- Verify: `docs/current-state.md`
- Verify: `docs/next-steps.md`
- Verify: `docs/backlog.md`
- Verify: `docs/focus-tracker.md`
- Verify: `docs/roadmap.md`

- [ ] **Step 1: Run the full project check**

Run: `npm run check`
Expected: PASS with build, typecheck, and test suite green.

- [ ] **Step 2: Review the final diff**

Run: `git diff -- AGENTS.md CONTRIBUTING.md docs/dev-workflow.md src/commands/status.ts src/commands/status.test.ts docs/cli-contract.md docs/current-state.md docs/next-steps.md docs/backlog.md docs/focus-tracker.md docs/roadmap.md`
Expected: workflow docs, status behavior, tests, and milestone docs align with the bundled reintegration change.
