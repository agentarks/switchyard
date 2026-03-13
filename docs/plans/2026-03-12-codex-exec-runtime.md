# Codex Exec Runtime Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the detached interactive Codex launch path with a bounded `codex exec --json` runtime that keeps logs readable and natural task completion truthful.

**Architecture:** Keep the existing repo-local session, run, and event model. Narrow the runtime seam to launch `codex exec --json`, add tolerant JSONL rendering in `sy logs`, and reconcile natural task exit in `sy status` while reserving `sy stop` for cancellation and cleanup.

**Tech Stack:** TypeScript, Node.js, Commander, SQLite-backed stores, repo-local filesystem state under `.switchyard/`

---

## Chunk 1: Runtime Spawn And Launch Metadata

### Task 1: Switch the Codex runtime to `exec --json`

**Files:**
- Modify: `src/runtimes/codex/index.ts`
- Test: `src/runtimes/codex/index.test.ts`
- Test: `src/commands/sling.test.ts`

- [ ] **Step 1: Write the failing tests**

Add coverage for:
- `spawnCodexSession` building `codex exec --json` plus caller-supplied runtime args and task text
- direct stdout/stderr redirection to the deterministic session log path on supported platforms
- `slingCommand` surfacing `Runtime: codex exec --json ...` in launch output and launch events

- [ ] **Step 2: Run targeted tests to verify they fail**

Run:
```bash
node --import tsx --test src/runtimes/codex/index.test.ts src/commands/sling.test.ts
```

Expected:
- failures because the runtime still launches the detached interactive path

- [ ] **Step 3: Implement the minimal runtime change**

Build the logical command as `codex exec --json`, append the explicit task as the final argument, open the session log file directly, and remove the Unix `script` wrapper from this launch path.

- [ ] **Step 4: Re-run targeted tests**

Run:
```bash
node --import tsx --test src/runtimes/codex/index.test.ts src/commands/sling.test.ts
```

Expected:
- pass

## Chunk 2: Readable Structured Logs

### Task 2: Render Codex JSONL through `sy logs`

**Files:**
- Modify: `src/commands/logs.ts`
- Test: `src/commands/logs.test.ts`

- [ ] **Step 1: Write the failing tests**

Add coverage for:
- assistant message events rendering as readable text
- command execution events rendering concise start/completion lines
- command output rendering as readable blocks
- malformed or partial JSONL lines passing through without crashing
- default tailing and `--all` remaining intact with structured rendering

- [ ] **Step 2: Run targeted tests to verify they fail**

Run:
```bash
node --import tsx --test src/commands/logs.test.ts
```

Expected:
- failures because `sy logs` still dumps raw transcript lines

- [ ] **Step 3: Implement tolerant JSONL rendering**

Parse the log file line-by-line, render known Codex event shapes into plain operator output, and fall back to the raw line for malformed or unrecognized entries.

- [ ] **Step 4: Re-run targeted tests**

Run:
```bash
node --import tsx --test src/commands/logs.test.ts
```

Expected:
- pass

## Chunk 3: Natural Completion And Cancellation

### Task 3: Reconcile bounded-task completion in status and stop

**Files:**
- Modify: `src/runs/types.ts`
- Modify: `src/commands/status.ts`
- Modify: `src/commands/stop.ts`
- Test: `src/commands/status.test.ts`
- Test: `src/commands/stop.test.ts`

- [ ] **Step 1: Write the failing tests**

Add coverage for:
- natural exit code `0` reconciling a running session to a successful finished task outcome
- nonzero natural exit reconciling to failed finished task outcome
- recent status summaries distinguishing success and failure honestly
- `sy stop` recording cancellation for still-running tasks
- `sy stop` not pretending to stop a task that already finished naturally

- [ ] **Step 2: Run targeted tests to verify they fail**

Run:
```bash
node --import tsx --test src/commands/status.test.ts src/commands/stop.test.ts
```

Expected:
- failures because natural exits still map to failure/stopped semantics only

- [ ] **Step 3: Implement minimal lifecycle changes**

Extend run outcomes for successful completion and cancellation, teach status reconciliation to classify observed dead pids from bounded runs via exit metadata, and keep stop focused on cancellation plus cleanup.

- [ ] **Step 4: Re-run targeted tests**

Run:
```bash
node --import tsx --test src/commands/status.test.ts src/commands/stop.test.ts
```

Expected:
- pass

## Chunk 4: Docs And Full Verification

### Task 4: Update docs and run the full verification set

**Files:**
- Modify: `docs/cli-contract.md`
- Modify: `docs/current-state.md`
- Modify: `docs/next-steps.md`
- Modify: `docs/focus-tracker.md`

- [ ] **Step 1: Update docs to reflect the completed slice**

Document the bounded `codex exec --json` runtime, readable structured `sy logs`, and natural completion semantics in the operator loop.

- [ ] **Step 2: Run the full project verification**

Run:
```bash
npm run check
```

Expected:
- build, typecheck, and tests all pass

- [ ] **Step 3: Review the diff for scope discipline**

Confirm the slice stayed within:
- headless `codex exec --json` launch
- readable structured `sy logs`
- truthful natural completion in `sy status`
- cancellation-oriented `sy stop`

- [ ] **Step 4: Summarize remaining risks**

Capture any JSONL-shape tolerance limits or remaining completion-detection caveats in the final handoff.
