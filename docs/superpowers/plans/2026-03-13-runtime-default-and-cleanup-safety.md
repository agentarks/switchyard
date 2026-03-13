# Runtime Default And Cleanup Safety Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `sy sling` launches writable by default for normal repo tasks and prevent cleanup readiness from treating dirty preserved worktrees as merged-safe.

**Architecture:** Keep the runtime fix narrow by adjusting the Codex command builder to inject `--sandbox workspace-write` only when the operator did not already choose a sandbox or automation mode. Keep the cleanup fix aligned with existing merge preflight behavior by reusing the current git-status filtering logic to detect meaningful preserved-worktree dirtiness before reporting merged-safe cleanup.

**Tech Stack:** TypeScript, Node.js, Commander, SQLite-backed stores, node:test

---

## Chunk 1: Runtime launch default

### Task 1: Lock the default writable launch behavior with tests

**Files:**
- Modify: `src/runtimes/codex/index.test.ts`
- Modify: `src/commands/sling.test.ts`

- [ ] **Step 1: Write the failing runtime command tests**

Add assertions that the default command becomes `codex exec --json --sandbox workspace-write` and that explicit operator sandbox/automation flags are preserved without extra injection.

- [ ] **Step 2: Run the targeted tests to verify they fail**

Run: `npm test -- src/runtimes/codex/index.test.ts src/commands/sling.test.ts`
Expected: FAIL because the current command builder omits the sandbox default.

- [ ] **Step 3: Implement the minimal command-builder change**

Update the Codex runtime command builder so it adds `--sandbox workspace-write` only when no explicit sandbox or automation flag is already present.

- [ ] **Step 4: Re-run the targeted tests**

Run: `npm test -- src/runtimes/codex/index.test.ts src/commands/sling.test.ts`
Expected: PASS

## Chunk 2: Cleanup readiness safety

### Task 2: Lock dirty preserved-worktree readiness with tests

**Files:**
- Modify: `src/commands/status.test.ts`
- Modify: `src/sessions/cleanup.ts`
- Modify: `src/commands/merge.ts` or extracted shared helper if needed

- [ ] **Step 1: Write the failing cleanup-readiness tests**

Add a test that a preserved worktree with uncommitted or untracked non-Switchyard changes no longer reports `ready:merged` and instead requires explicit abandon/inspection.

- [ ] **Step 2: Run the targeted tests to verify they fail**

Run: `npm test -- src/commands/status.test.ts`
Expected: FAIL because current readiness only checks branch ancestry.

- [ ] **Step 3: Implement the minimal cleanup-readiness dirtiness check**

Reuse the existing git porcelain filtering rules so preserved worktree dirtiness blocks merged cleanup readiness while still ignoring `.switchyard` bookkeeping paths.

- [ ] **Step 4: Re-run the targeted tests**

Run: `npm test -- src/commands/status.test.ts`
Expected: PASS

## Chunk 3: Docs and verification

### Task 3: Update docs and verify the slice

**Files:**
- Modify: `docs/current-state.md`
- Modify: `docs/next-steps.md`
- Modify: `docs/focus-tracker.md`
- Modify: `docs/cli-contract.md`

- [ ] **Step 1: Update the operator-facing docs**

Document the writable-by-default `sy sling` launch behavior and the new cleanup-readiness refusal for dirty preserved worktrees.

- [ ] **Step 2: Run focused test coverage**

Run: `npm test -- src/runtimes/codex/index.test.ts src/commands/sling.test.ts src/commands/status.test.ts`
Expected: PASS

- [ ] **Step 3: Run repo checks**

Run: `npm run check`
Expected: PASS

- [ ] **Step 4: Review diffs before handoff**

Run: `git diff --stat`
Expected: only the intended runtime, cleanup, test, and doc files changed.
