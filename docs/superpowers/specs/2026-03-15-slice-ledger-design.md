# Slice Ledger Design

## Summary

This slice adds one canonical source-of-truth ledger for Switchyard implementation slices.

The ledger answers a simple operator and maintainer question without ambiguity:
- how many implementation slices has this repo run so far?

The design keeps the count meaningful by counting only implementation slices that materially changed the operator loop. Spec-only and doc-only follow-ups remain visible, but they are folded into the implementation slice they support instead of inflating the canonical slice count.

## Problem

Switchyard currently has multiple ways to infer progress, but no single canonical slice count.

Today the repo has:
- milestone-level history in `docs/focus-tracker.md`
- slice-specific planning docs in `docs/plans/`
- older plan and spec docs in `docs/plans/` and `docs/specs/`
- git history with merges, fixes, docs follow-ups, and implementation commits intermixed

That makes "how many slices have we run?" answerable only with caveats:
- milestone count is not the same as slice count
- plan-file count includes doc-only work
- git commit count is noisy and not one-to-one with slices

The result is unnecessary ambiguity in a repo that is otherwise trying to stay explicit and operator-readable.

## Goals

- Add one canonical place to count completed Switchyard slices
- Make the headline count mean implemented vertical slices, not paperwork volume
- Preserve traceability to plans, specs, PRs, and follow-up docs
- Seed the ledger with a best-effort historical view without pretending old history is perfectly reconstructable
- Keep the maintenance burden small enough that it remains current

## Non-Goals

- No automated slice detection from git history in this slice
- No attempt to reconstruct every historical micro-slice with perfect fidelity
- No separate counted ledger for spec-only or doc-only follow-up work
- No changes to the current milestone or roadmap structure beyond pointing to the new ledger

## Canonical Rule

The canonical slice count should mean:
- completed implementation slices that materially changed the current operator loop

That means:
- count implementation slices
- do not count spec-only slices
- do not count doc-only validation or alignment follow-ups as separate slices
- fold those supporting artifacts into the implementation slice they document or validate

This keeps the count aligned with the practical question the ledger is meant to answer:
- how many shipped workflow slices has this repo actually completed?

## Proposed Structure

Add a dedicated file:
- `docs/slice-ledger.md`

This file becomes the canonical answer for slice counts.

It should start with:
- a short definition of what a counted slice is
- a note that older rows are best-effort reconstructions when exact slice boundaries are unclear
- a summary count derived from the rows in the file

The main body should be a compact table or ordered list with one row per implementation slice.

Recommended fields per row:
- `seq`: stable slice id such as `S01`
- `date`: completion date
- `slug`: short machine-readable label
- `summary`: one-line operator-facing description of the slice
- `artifacts`: links to the main plan/spec/PR/commit
- `notes`: supporting follow-up docs or caveats

## Counting Rules

The ledger should follow these rules:

1. A counted row must represent an implementation slice.
2. A doc-only or spec-only follow-up should be recorded inside the implementation row it supports, not as a new counted row.
3. A later docs change gets its own counted row only if it actually introduced a separate operator-visible behavior change, not if it merely validated, clarified, or aligned an existing slice.
4. If historical evidence is ambiguous, prefer one truthful coarse row over many speculative fine-grained rows.

Example implication for the current repo:
- the runtime smoke-validation docs do not become a separate counted slice
- they are linked as supporting evidence for the bounded Codex runtime slice

## Seeding Historical Rows

Historical seeding should be best-effort, not performative precision.

Recommended approach:
- seed rows from clearly implemented milestone-era slices and the more recent explicit runtime slices
- use existing docs, plans, specs, and git history to choose reasonable slice boundaries
- mark the ledger as canonical from the moment it lands, with older entries treated as reconstructed

This avoids a bad failure mode where the repo claims false certainty about earlier slice boundaries.

## Doc Integration

Do not overload `docs/focus-tracker.md` with canonical ledger duties.

Instead:
- keep `docs/focus-tracker.md` focused on target, scope, and planning state
- keep `docs/next-steps.md` focused on current execution guidance
- add a short note in those files pointing readers to `docs/slice-ledger.md` for the canonical slice count

That keeps each source-of-truth doc doing one job.

## Maintenance Rule

Going forward:
- every implementation slice should update the ledger in the same session as the slice work
- supporting doc/spec updates should be linked in the matching row when relevant
- the ledger should remain manually curated rather than inferred automatically

Manual curation is the smaller and safer choice here because slice boundaries are product decisions, not raw repository facts.

## Risks

- historical rows may still involve judgment calls, so the ledger needs an explicit reconstructed-versus-canonical note
- if maintainers forget to update the ledger during future slice work, the count will drift
- over-detailed rows would turn the ledger into a changelog and make it harder to maintain

## Acceptance

This design is complete when:
- `docs/slice-ledger.md` exists as the canonical slice ledger
- the file defines implementation-only counting
- the file includes a best-effort seeded history for existing slices
- the runtime smoke-validation docs are folded into the runtime implementation slice instead of counted separately
- `docs/focus-tracker.md` and `docs/next-steps.md` point readers to the ledger for slice counts
