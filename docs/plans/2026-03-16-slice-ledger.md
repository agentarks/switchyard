# Slice Ledger Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a canonical implementation-slice ledger that answers the repo's slice count unambiguously and point the existing source-of-truth docs at it.

**Architecture:** Keep this slice doc-only. Create one dedicated ledger file at `docs/slice-ledger.md`, seed it with a best-effort historical implementation-only view from the existing milestone, plan, spec, and git artifacts, and update the planning docs to treat that ledger as the canonical slice-count source without broadening scope or retrofitting automation.

**Tech Stack:** Markdown docs in the Switchyard repo

---

## Chunk 1: Create the Canonical Ledger

### Task 1: Inventory the historical implementation slices

**Files:**
- Read: `docs/milestones.md`
- Read: `docs/focus-tracker.md`
- Read: `docs/next-steps.md`
- Read: `docs/plans/2026-03-11-stalled-session-status.md`
- Read: `docs/plans/2026-03-12-codex-exec-runtime.md`
- Read: `docs/plans/2026-03-12-detached-runtime-logs.md`
- Read: `docs/specs/2026-03-11-no-visible-progress-status-design.md`
- Read: `docs/specs/2026-03-11-stalled-session-status-design.md`
- Read: `docs/specs/2026-03-12-codex-exec-runtime-design.md`
- Read: `docs/specs/2026-03-12-detached-runtime-logs-design.md`
- Read: `docs/plans/2026-03-13-runtime-default-and-cleanup-safety.md`
- Read: `docs/plans/2026-03-13-runtime-smoke-validation-docs.md`

- [ ] **Step 1: Review the milestone and slice artifacts**

Read the listed files and identify which historical entries are implementation slices versus supporting specs/docs.

- [ ] **Step 2: Draft the best-effort slice boundaries**

Write down the implementation rows that will be seeded into the ledger, keeping ambiguous older history coarse rather than speculative.

- [ ] **Step 3: Record the runtime-docs folding rule**

Ensure the bounded Codex runtime row includes the runtime smoke-validation docs as supporting evidence in notes instead of as a separate counted slice.

### Task 2: Create `docs/slice-ledger.md`

**Files:**
- Create: `docs/slice-ledger.md`

- [ ] **Step 1: Write the ledger header**

Add:
- a one-sentence purpose statement
- the implementation-only counting rule
- a note that older rows are best-effort reconstructions and newer rows are canonical
- a headline total derived from the seeded implementation rows

- [ ] **Step 2: Add the seeded implementation rows**

Create one compact table with these columns:
- `SEQ`
- `DATE`
- `SLUG`
- `SUMMARY`
- `ARTIFACTS`
- `NOTES`

Populate the table with the best-effort historical implementation slices identified in Task 1.

- [ ] **Step 3: Fold supporting docs into the relevant implementation rows**

For slices with supporting specs, plans, or follow-up docs, include those links in `ARTIFACTS` or `NOTES` instead of creating separate counted rows.

- [ ] **Step 4: Review the ledger for counting clarity**

Read `docs/slice-ledger.md` and confirm:
- every counted row is an implementation slice
- no doc-only or spec-only item is counted separately
- the total matches the number of seeded implementation rows

- [ ] **Step 5: Commit the ledger doc**

```bash
git add docs/slice-ledger.md
git commit -m "docs: add canonical slice ledger"
```

## Chunk 2: Point the Source-of-Truth Docs at the Ledger

### Task 3: Update the planning docs

**Files:**
- Modify: `docs/next-steps.md`
- Modify: `docs/focus-tracker.md`

- [ ] **Step 1: Add a canonical-ledger note to `docs/next-steps.md`**

Add one short note in the current planning guidance that `docs/slice-ledger.md` is now the canonical source for implementation-slice counts.

- [ ] **Step 2: Add the same canonical-ledger note to `docs/focus-tracker.md`**

Add one short note in the planning-state section that slice counts now live in `docs/slice-ledger.md`.

- [ ] **Step 3: Keep the doc roles narrow**

Review the new wording and confirm:
- `docs/next-steps.md` still focuses on choosing the next slice
- `docs/focus-tracker.md` still focuses on target, scope, and planning state
- neither file starts duplicating the ledger rows

- [ ] **Step 4: Commit the source-of-truth doc updates**

```bash
git add docs/next-steps.md docs/focus-tracker.md
git commit -m "docs: point planning docs to slice ledger"
```

## Chunk 3: Verify the Ledger Slice

### Task 4: Verify the seeded ledger and references

**Files:**
- Verify: `docs/slice-ledger.md`
- Verify: `docs/next-steps.md`
- Verify: `docs/focus-tracker.md`

- [ ] **Step 1: Verify the seeded row count mechanically**

Run:

```bash
rg -n '^\| S[0-9]+' docs/slice-ledger.md
```

Expected:
- one match per implementation slice row
- the number of matches equals the headline total in `docs/slice-ledger.md`

- [ ] **Step 2: Verify the canonical-ledger references**

Run:

```bash
rg -n 'docs/slice-ledger.md' docs/next-steps.md docs/focus-tracker.md
```

Expected:
- both files point to the ledger exactly once
- the wording treats it as the canonical slice-count source

- [ ] **Step 3: Verify there is no accidental doc-only counted row for the smoke-validation follow-up**

Run:

```bash
rg -n 'runtime smoke|smoke-validation|smoke validation' docs/slice-ledger.md
```

Expected:
- the runtime smoke-validation docs appear only as supporting evidence inside the runtime implementation row notes, not as a standalone counted row

- [ ] **Step 4: Review the final diff**

Run:

```bash
git diff -- docs/slice-ledger.md docs/next-steps.md docs/focus-tracker.md
```

Expected:
- only the ledger file and the two source-of-truth pointer notes changed
- no unrelated docs were modified

- [ ] **Step 5: Run the repo check if behavior wording changed materially**

Run:

```bash
npm run check
```

Expected:
- pass cleanly if the wording updates touched operator-facing repo behavior documentation enough to warrant the standard closing check

- [ ] **Step 6: Commit the verification-ready final state**

```bash
git add docs/slice-ledger.md docs/next-steps.md docs/focus-tracker.md
git commit -m "docs: seed slice ledger history"
```
