# Detached Runtime Logs Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add durable detached-runtime transcript capture plus a first-class `sy logs <session>` command without widening the operator loop beyond raw log inspection.

**Architecture:** Keep transcript handling file-backed and deterministic from existing session data. Extend the Codex runtime seam to wire detached output into `.switchyard/logs/<agent>-<session>.log`, derive the same path in session-facing commands, and treat the log file as another preserved artifact in stop cleanup.

**Tech Stack:** TypeScript, Node.js, Commander, SQLite-backed stores, repo-local filesystem state under `.switchyard/`

---

## Chunk 1: Runtime And Path Plumbing

### Task 1: Add deterministic detached-log path helpers and runtime coverage

**Files:**
- Create: `src/logs/path.ts`
- Test: `src/runtimes/codex/index.test.ts`
- Test: `src/commands/sling.test.ts`

- [ ] **Step 1: Write the failing tests**

Add coverage for:
- Unix `script` launch syntax writing to the session log path instead of `/dev/null`
- fallback detached spawn redirecting stdout/stderr to the same opened log file
- `slingCommand` surfacing a deterministic `.switchyard/logs/<agent>-<session>.log` path in output and launch events

- [ ] **Step 2: Run targeted tests to verify they fail**

Run:
```bash
node --import tsx --test src/runtimes/codex/index.test.ts src/commands/sling.test.ts
```

Expected:
- failures because no log-path plumbing exists yet

- [ ] **Step 3: Implement minimal runtime and log-path support**

Add a narrow helper that builds absolute and relative session log paths from `projectRoot`, `agentName`, and `sessionId`. Pass the absolute path into `spawnCodexSession`, update Unix `script` invocations to write there, and wire fallback detached spawn stdio to the same file.

- [ ] **Step 4: Re-run targeted tests**

Run:
```bash
node --import tsx --test src/runtimes/codex/index.test.ts src/commands/sling.test.ts
```

Expected:
- pass

## Chunk 2: Operator Inspection Commands

### Task 2: Add `sy logs <session>` with exact-session-safe resolution

**Files:**
- Create: `src/commands/logs.ts`
- Modify: `src/index.ts`
- Test: `src/commands/logs.test.ts`
- Test: `src/index.test.ts`

- [ ] **Step 1: Write the failing tests**

Add coverage for:
- default `sy logs <session>` tailing the last 200 lines
- `sy logs <session> --all` printing the entire transcript
- explicit operator-facing output when the session exists but the log file does not
- ambiguous selector rejection parity with other session commands
- CLI registration through `sy logs`

- [ ] **Step 2: Run targeted tests to verify they fail**

Run:
```bash
node --import tsx --test src/commands/logs.test.ts src/index.test.ts
```

Expected:
- failures because the command does not exist yet

- [ ] **Step 3: Implement the command**

Resolve the session via the shared selector logic, derive the log path from session data, print a short heading (`Agent`, `Session`, `Log`) plus either the full contents or the last 200 lines, and fail explicitly on selector/read errors.

- [ ] **Step 4: Re-run targeted tests**

Run:
```bash
node --import tsx --test src/commands/logs.test.ts src/index.test.ts
```

Expected:
- pass

## Chunk 3: Status And Cleanup Integration

### Task 3: Surface log paths in exact-session status and preserve/remove logs through stop cleanup

**Files:**
- Modify: `src/commands/status.ts`
- Modify: `src/commands/stop.ts`
- Modify: `src/sessions/cleanup.ts`
- Test: `src/commands/status.test.ts`
- Test: `src/commands/stop.test.ts`

- [ ] **Step 1: Write the failing tests**

Add coverage for:
- exact-session `sy status <session>` showing `Log: .switchyard/logs/<agent>-<session>.log`
- plain `sy stop <session>` preserving the transcript file
- `sy stop --cleanup` and `sy stop --cleanup --abandon` removing the transcript file
- already-missing transcript files not blocking otherwise-safe cleanup

- [ ] **Step 2: Run targeted tests to verify they fail**

Run:
```bash
node --import tsx --test src/commands/status.test.ts src/commands/stop.test.ts
```

Expected:
- failures because status and cleanup do not yet know about transcript files

- [ ] **Step 3: Implement minimal status and cleanup changes**

Derive the log path in exact-session status output. Extend stop cleanup to remove the transcript file after the session state is already known, preserving the existing handled cleanup-failure path and tolerating missing files.

- [ ] **Step 4: Re-run targeted tests**

Run:
```bash
node --import tsx --test src/commands/status.test.ts src/commands/stop.test.ts
```

Expected:
- pass

## Chunk 4: Docs And Full Verification

### Task 4: Update operator docs and run the full verification set

**Files:**
- Modify: `docs/current-state.md`
- Modify: `docs/next-steps.md`
- Modify: `docs/focus-tracker.md`

- [ ] **Step 1: Update docs to reflect the completed slice**

Document the new `sy logs` command, exact-session status log-path output, and detached transcript capture under `.switchyard/logs/`.

- [ ] **Step 2: Run the full project verification**

Run:
```bash
npm run check
```

Expected:
- build, typecheck, and tests all pass

- [ ] **Step 3: Review the diff for scope discipline**

Confirm the slice stayed within:
- raw transcript capture
- `sy logs`
- exact-session status log-path visibility
- stop cleanup artifact handling

- [ ] **Step 4: Summarize remaining risks**

Capture any platform-specific `script` behavior caveats or transcript-size concerns in the final handoff.
