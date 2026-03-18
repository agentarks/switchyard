# Reintegration Decision Support Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add conservative reintegration decision support to `sy status` so finished sessions surface a compact review assessment without changing the existing next-action vocabulary.

**Architecture:** Keep the slice inside the existing `src/commands/status.ts` control plane. Derive one reintegration assessment from state Switchyard already owns, render it as a compact `REVIEW` column in the all-session table, and add `Review` plus `Why` lines to exact-session status only when reintegration meaningfully applies. Preserve the current `NEXT` vocabulary, current row ordering, and current active-session behavior.

**Tech Stack:** TypeScript, Node.js, Commander, built-in `node:test`, Markdown docs

---

## File Structure

**Modify:**
- `src/commands/status.ts`
- `src/commands/status.test.ts`
- `docs/cli-contract.md`
- `docs/current-state.md`
- `docs/next-steps.md`
- `docs/backlog.md`
- `docs/focus-tracker.md`
- `docs/roadmap.md`
- `docs/slice-ledger.md`

**Create:**
- none

**Why these files:**
- `src/commands/status.ts` already owns status row derivation, selected-session detail rendering, and follow-up ordering.
- `src/commands/status.test.ts` already holds the regression surface for all-session tables, selected-session details, cleanup semantics, follow-up precedence, and recent-event rendering.
- `docs/cli-contract.md` is the operator-facing contract for `sy status`.
- `docs/current-state.md` should reflect that reintegration decision support is now materially real.
- `docs/next-steps.md`, `docs/backlog.md`, `docs/focus-tracker.md`, and `docs/roadmap.md` should stop describing this slice as the next undone milestone step once it lands.
- `docs/slice-ledger.md` is the canonical implementation-slice count and should record this slice as the next completed row.

## Chunk 1: Lock The Status Output With Failing Tests

### Task 1: Add failing all-session table coverage

**Files:**
- Modify: `src/commands/status.test.ts`
- Test: `src/commands/status.test.ts`

- [ ] **Step 1: Add the ordinary finished-session table test**

Add a focused regression that seeds one inactive preserved session with:
- a successful finished run
- cleanup readiness of `abandon-only:not-merged`
- no unread operator mail
- no blocking merge event

Assert that the all-session table now renders:
- a new `REVIEW` column
- `needs-review` in that column for the preserved session
- the existing `NEXT` value of `review-merge`

- [ ] **Step 2: Add the cleanup-ready table test**

Add a focused regression that seeds one inactive preserved session with:
- cleanup readiness of `ready:merged`
- no higher-priority unread follow-up

Assert that the table renders:
- `ready` in the `REVIEW` column
- the existing `NEXT` value of `cleanup`

- [ ] **Step 3: Add the active-session omission test**

Add a regression that keeps one session active and verifies:
- the `REVIEW` column exists in the table
- the active row renders `-` in `REVIEW`
- `NEXT` stays on the existing active-session value such as `wait` or `mail`

- [ ] **Step 4: Add the already-closed omission test**

Add a regression for a session whose cleanup readiness is already `ready:absent` and whose current `NEXT` value is therefore `done`.

Assert that:
- the row renders `-` in `REVIEW`
- the existing `NEXT` value stays `done`
- the slice does not surface a reintegration assessment once closure is already complete

- [ ] **Step 5: Add the blocked and risky table tests**

Add two focused regressions:

```ts
test("statusCommand marks a preserved session blocked when known reintegration blockers already exist", async () => {
  // seed a stopped session with a recent merge.failed event or a hard-blocking cleanup label
  // expect REVIEW=blocked
  // expect NEXT keeps the existing follow-up value
});

test("statusCommand marks a preserved session risky when it finished in a warning state that still needs inspection", async () => {
  // seed a stopped or failed session with a terminal failed run or dirty preserved worktree state
  // expect REVIEW=risky
  // expect NEXT stays inspect or other current follow-up
});
```

- [ ] **Step 6: Run the targeted status tests to verify they fail**

Run:

```bash
node --import tsx --test src/commands/status.test.ts
```

Expected:
- FAIL because the `REVIEW` column and assessment logic do not exist yet
- the new failures point at the added table expectations rather than unrelated setup mistakes

- [ ] **Step 7: Commit the failing all-session coverage**

```bash
git add src/commands/status.test.ts
git commit -m "test: lock reintegration review table output"
```

### Task 2: Add failing exact-session review-block coverage

**Files:**
- Modify: `src/commands/status.test.ts`
- Test: `src/commands/status.test.ts`

- [ ] **Step 1: Add the selected preserved-session review-block test**

Add a selected-session regression that seeds one inactive preserved session and asserts exact-session output now includes:
- `Review: needs-review`
- `Why: ...`
- the existing `Next: review-merge`

Use a deterministic reason string based on existing state, for example:
- `run finished successfully and preserved work still needs operator review`

- [ ] **Step 2: Add the cleanup-ready selected-session test**

Add a selected-session regression that asserts a cleanup-ready post-merge session shows:
- `Review: ready`
- `Why: merge is already integrated and cleanup is the next valid action`
- `Next: cleanup`

- [ ] **Step 3: Add the active-session omission test for selected status**

Add a selected-session regression that keeps the session active and asserts:
- no `Review:` line is printed
- no `Why:` line is printed
- the existing `Next:` line still appears unchanged

- [ ] **Step 4: Add the already-closed omission test for selected status**

Add a selected-session regression for a session whose cleanup readiness is `ready:absent` and whose current `Next:` line is `done`.

Assert that:
- no `Review:` line is printed
- no `Why:` line is printed
- the existing `Next: done` line still appears unchanged

- [ ] **Step 5: Add the assessment-unavailable safety test**

Add a regression that forces cleanup-readiness evaluation to return `?` or otherwise prevents a conservative assessment, then assert:
- the all-session row renders `-` in `REVIEW`
- the selected-session output does not invent a `Review:` or `Why:` block
- the existing `Cleanup`, `Next`, and `Recent` output still render

- [ ] **Step 6: Run the targeted tests again to verify the selected-session cases fail**

Run:

```bash
node --import tsx --test src/commands/status.test.ts
```

Expected:
- FAIL on the new review-block expectations
- existing `Next:` and `Recent:` assertions still pass until the review block is added

- [ ] **Step 7: Commit the failing selected-session coverage**

```bash
git add src/commands/status.test.ts
git commit -m "test: add reintegration review detail expectations"
```

## Chunk 2: Implement Conservative Assessment Derivation In `sy status`

### Task 3: Add the derived review assessment to row context

**Files:**
- Modify: `src/commands/status.ts`
- Test: `src/commands/status.test.ts`

- [ ] **Step 1: Introduce a narrow assessment type**

Add explicit status-local types near `StatusRowContext`, for example:

```ts
type ReintegrationAssessmentLabel = "ready" | "needs-review" | "blocked" | "risky";

interface ReintegrationAssessment {
  label: ReintegrationAssessmentLabel;
  reason: string;
}
```

Thread an optional `review?: ReintegrationAssessment` field into `StatusRowContext`.

- [ ] **Step 2: Implement one deterministic derivation helper**

Add a helper such as:

```ts
function deriveReintegrationAssessment(options: {
  session: SessionRecord;
  latestRun?: RunRecord;
  cleanup: string;
  followUp: string;
  recentEvent?: EventRecord;
}): ReintegrationAssessment | undefined
```

Keep it pure and base it only on already-derived status inputs. Do not add a new store, event type, or persistence table.

- [ ] **Step 3: Encode the precedence rules from the merged spec**

Implement the helper with this order:

1. return `undefined` for active sessions
2. return `undefined` for sessions where reintegration no longer meaningfully applies, such as:
   - `cleanup === "ready:absent"`
   - any row whose current `followUp` is already `done`
3. return `undefined` when supporting data is too incomplete to justify a conservative answer
4. return `blocked` for known hard blockers, such as:
   - recent `merge.failed`
   - cleanup labels like `abandon-only:branch-missing`, `abandon-only:legacy`, `abandon-only:no-branch`, `abandon-only:worktree-inspection-failed`, or `abandon-only:worktree-missing`
5. return `ready` only for closure-ready states already justified by the current manual-first workflow, such as:
   - `cleanup === "ready:merged"`
6. return `risky` for warning states that still need cautious inspection, such as:
   - latest run outcome `failed` or `launch_failed`
   - cleanup label `abandon-only:worktree-dirty`
7. return `needs-review` for the ordinary finished-but-unmerged preserved-session case, including:
   - `cleanup === "abandon-only:not-merged"`
   - otherwise-successful preserved work that still needs manual review

Keep `ready` narrow and conservative. Ordinary completed-but-unmerged sessions must stay `needs-review`.
Already-closed `done` rows must not gain a reintegration review label.

- [ ] **Step 4: Generate short deterministic reason strings**

Implement reason text from structured state, not from the already-formatted `RECENT` summary.

Use short operator-readable templates such as:
- `merge is already integrated and cleanup is the next valid action`
- `run finished successfully and preserved work still needs operator review`
- `previous merge attempt failed and reintegration is currently blocked`
- `latest run failed, so preserved work should be inspected before reintegration`

Do not introduce a second next-action vocabulary inside the reason text.

- [ ] **Step 5: Rebuild row contexts with the new assessment**

Keep the current follow-up derivation and activity ordering intact, then attach the derived assessment after `followUp` is known.

- [ ] **Step 6: Re-run the targeted tests**

Run:

```bash
node --import tsx --test src/commands/status.test.ts
```

Expected:
- PASS for the new all-session and selected-session review tests
- PASS for the existing ordering, follow-up, and recent-summary regressions

- [ ] **Step 7: Commit the derivation helper**

```bash
git add src/commands/status.ts src/commands/status.test.ts
git commit -m "feat: derive reintegration review assessments in status"
```

### Task 4: Render the new assessment without breaking the current control plane

**Files:**
- Modify: `src/commands/status.ts`
- Test: `src/commands/status.test.ts`

- [ ] **Step 1: Add the compact table column**

Insert a `REVIEW` column into the all-session table header and row output.

Use:
- the assessment label for inactive sessions with a derived answer
- `-` for active or assessment-unavailable rows

Do not change the existing `NEXT` column values or row sort order.

- [ ] **Step 2: Add the selected-session review lines**

Update exact-session rendering so inactive sessions with a derived assessment print:
- `Review: <label>`
- `Why: <reason>`

Keep the existing `Next:` line and treat it as the review block's action line instead of printing a second one.

- [ ] **Step 3: Preserve active-session and unavailable-assessment output**

Keep exact-session output unchanged when:
- the session is still active
- the helper returned `undefined` because the assessment could not be justified conservatively

That means:
- no `Review:` line
- no `Why:` line
- existing `Cleanup`, `Run`, `Next`, and `Recent` lines still print

- [ ] **Step 4: Re-run targeted coverage after the rendering changes**

Run:

```bash
node --import tsx --test src/commands/status.test.ts
```

Expected:
- PASS with the new `REVIEW` column and exact-session review lines in place

- [ ] **Step 5: Review the exact output shape manually**

Run:

```bash
node --import tsx --test src/commands/status.test.ts --test-name-pattern "review|selected session|cleanup readiness"
```

Expected:
- PASS
- no accidental second `Next:` line
- active-session exact-status coverage still proves the omission path

- [ ] **Step 6: Commit the rendering changes**

```bash
git add src/commands/status.ts src/commands/status.test.ts
git commit -m "feat: render reintegration review status output"
```

## Chunk 3: Update Docs And Verify The Slice

### Task 5: Update the contract, state, and planning docs

**Files:**
- Modify: `docs/cli-contract.md`
- Modify: `docs/current-state.md`
- Modify: `docs/next-steps.md`
- Modify: `docs/backlog.md`
- Modify: `docs/focus-tracker.md`
- Modify: `docs/roadmap.md`
- Modify: `docs/slice-ledger.md`

- [ ] **Step 1: Update the `sy status` contract**

Document in `docs/cli-contract.md` that:
- the all-session table now includes a `REVIEW` column
- the compact assessment uses `ready`, `needs-review`, `blocked`, `risky`, or `-`
- active sessions keep their current `NEXT` behavior and render `-` in `REVIEW`
- exact-session status adds `Review` and `Why` only for inactive sessions where reintegration meaningfully applies
- `Next` continues to use the existing follow-up vocabulary

- [ ] **Step 2: Update current-state docs**

Update `docs/current-state.md` to say reintegration decision support is now materially real in `sy status`, including:
- compact all-session review visibility
- richer exact-session review explanation
- continued conservative manual-first merge posture

- [ ] **Step 3: Advance the milestone docs past this slice**

Update:
- `docs/next-steps.md`
- `docs/backlog.md`
- `docs/focus-tracker.md`
- `docs/roadmap.md`

So they no longer describe reintegration decision support as the next undone slice. Shift the near-term emphasis to:
- completed-task review summaries
- session closure and post-closure history
- only narrow reintegration hardening where the new review assessment still leaves ambiguity

- [ ] **Step 4: Record the completed slice in the ledger**

Update `docs/slice-ledger.md` by:
- increasing the headline total by one from whatever value the ledger has when the implementation lands
- adding the next sequential row for `reintegration-decision-support`
- linking this plan, the merged design spec, and the implementation PR once it exists

- [ ] **Step 5: Commit the doc updates**

```bash
git add docs/cli-contract.md docs/current-state.md docs/next-steps.md docs/backlog.md docs/focus-tracker.md docs/roadmap.md docs/slice-ledger.md
git commit -m "docs: record reintegration decision support slice"
```

### Task 6: Run focused verification and the repo check

**Files:**
- Verify: `src/commands/status.ts`
- Verify: `src/commands/status.test.ts`
- Verify: `docs/cli-contract.md`
- Verify: `docs/current-state.md`
- Verify: `docs/next-steps.md`
- Verify: `docs/backlog.md`
- Verify: `docs/focus-tracker.md`
- Verify: `docs/roadmap.md`
- Verify: `docs/slice-ledger.md`

- [ ] **Step 1: Run the focused status tests**

Run:

```bash
node --import tsx --test src/commands/status.test.ts
```

Expected:
- PASS

- [ ] **Step 2: Run the full repo check**

Run:

```bash
npm run check
```

Expected:
- PASS
- if unrelated pre-existing failures remain, capture them explicitly before claiming the slice complete

- [ ] **Step 3: Verify the milestone docs moved on from this slice**

Run:

```bash
rg -n '^1\. Completed-task review summaries|^2\. Session closure and post-closure history' docs/backlog.md
rg -n 'completed-task review summaries|session closure and post-closure history' docs/next-steps.md docs/focus-tracker.md docs/roadmap.md
```

Expected:
- `docs/backlog.md` now promotes the next categories after this slice to the top of `Now`
- the other milestone docs now point at completed-task review and closure/history as the near-term follow-up

- [ ] **Step 4: Verify the new status contract and ledger mechanically**

Run:

```bash
rg -n 'REVIEW|needs-review|Review:|Why:' docs/cli-contract.md docs/current-state.md
rg -n 'reintegration-decision-support' docs/slice-ledger.md
git diff -- docs/slice-ledger.md
```

Expected:
- contract and current-state docs mention the new review assessment intentionally
- the ledger contains one new `reintegration-decision-support` row
- the ledger diff shows the headline total changed and one new sequential row was added relative to the pre-edit state

- [ ] **Step 5: Review the final diff**

Run:

```bash
git diff --stat origin/main...
```

Expected:
- status implementation, status tests, and the intended docs only
- no unrelated source files changed

- [ ] **Step 6: Commit the verification-ready final state**

```bash
git add src/commands/status.ts src/commands/status.test.ts docs/cli-contract.md docs/current-state.md docs/next-steps.md docs/backlog.md docs/focus-tracker.md docs/roadmap.md docs/slice-ledger.md
git commit -m "feat: add reintegration decision support"
```
