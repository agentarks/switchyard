# Runtime Smoke Validation Docs Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record fresh temp-repo smoke validation for the bounded Codex runtime and cleanup semantics in the source-of-truth docs.

**Architecture:** Keep this slice doc-only. Update the existing state and planning docs where the runtime baseline and next-slice guidance already live, and capture only the proved operator-visible behavior from the real CLI smoke run.

**Tech Stack:** Markdown docs in the Switchyard repo

---

## Chunk 1: Record smoke-validation evidence

### Task 1: Add the execution plan file

**Files:**
- Create: `docs/superpowers/plans/2026-03-13-runtime-smoke-validation-docs.md`

- [ ] **Step 1: Write the plan file**

Create this file with the goal, architecture, and doc-only task list.

- [ ] **Step 2: Review the file for path and scope accuracy**

Check that the filename, referenced docs, and stated goal match the approved design.

### Task 2: Update the source-of-truth docs

**Files:**
- Modify: `docs/current-state.md`
- Modify: `docs/next-steps.md`
- Modify: `docs/focus-tracker.md`

- [ ] **Step 1: Add a manual smoke-validation note to `docs/current-state.md`**

Record the fresh temp-repo smoke evidence for:
- launch output showing `codex exec --json --sandbox workspace-write`
- active status showing `Run: active`, `Cleanup: stop-then:merged`, and `Next: wait`
- natural completion reconciling to `State: stopped`, `Run: finished:completed`, `Cleanup: abandon-only:worktree-dirty`, and `Next: inspect`
- dirty preserved-worktree cleanup refusal without `--abandon`
- successful explicit-abandon cleanup

- [ ] **Step 2: Reinforce the proof state in `docs/next-steps.md`**

Add one short note that the runtime baseline now has fresh temp-repo smoke validation with the real `sy` entrypoint and Codex CLI, so the next slice should still come from a newly reproduced operator gap.

- [ ] **Step 3: Reinforce the same planning state in `docs/focus-tracker.md`**

Add one short bullet that the current runtime baseline and cleanup semantics have fresh manual smoke proof in a real temp-repo run.

- [ ] **Step 4: Review the edited docs**

Read the changed sections and verify they stay factual, concise, and aligned with the existing source-of-truth language.
