# Repo Workflow State And Resume Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the first repo-workflow control-plane slice for building Switchyard itself: canonical YAML state under `docs/repo-workflow/`, a fail-closed validator, and startup-doc cutover that makes fresh-session resume deterministic without changing product merge policy or adding PR automation.

**Architecture:** Keep this slice repo-local, not product-facing. Introduce the committed YAML control plane at the start of the slice so it governs the work truthfully from Chunk 1 onward. Implement the validator as focused TypeScript modules under `src/repo-workflow/` plus one `npm` script entrypoint, and give repo-workflow validation its own strict dirty-worktree check instead of inheriting the product helper’s `.switchyard/` exception. The active spec is the source of truth; if RED tests expose any remaining ambiguity, fix the spec before validator code lands.

**Tech Stack:** TypeScript, Node.js, `yaml`, markdown docs, git CLI, npm scripts, existing Switchyard test harness

---

## Chunk 1: Freeze The Control-Plane Contract

### Task 1: Tighten the active spec and handoff so the implementation has one exact contract

**Files:**
- Modify: `docs/superpowers/specs/2026-03-24-repo-workflow-state-and-resume-design.md`
- Modify: `docs/session-handoffs/2026-03-24-repo-workflow-handoff.md`

- [ ] **Step 1: Collapse the startup marker to one literal**

Keep exactly one startup marker convention everywhere:

```text
repo-workflow-startup: repo-workflow-v1
```

Remove any alternative field names or examples that imply another startup marker shape.

- [ ] **Step 2: Remove any stale delimiter drift before implementation**

Confirm the spec and examples consistently use the exact delimited markdown blocks the validator will parse, for example:

```md
<!-- repo-workflow-projection:start -->
```yaml
repo_workflow_projection:
  schema_version: 1
  active_repo_campaign_id: rw-001
  active_bundle_id: repo-workflow-foundation
  active_chunk_id: c-001
  last_updated: 2026-03-24
```
<!-- repo-workflow-projection:end -->
```

Do the same for the milestone registry block in `docs/milestones.md`. If any stale non-delimited examples remain, remove them before code lands.

- [ ] **Step 3: Remove any stale scalar slice-ledger or empty-value examples**

Confirm the spec and plan both use:
- nested `slice_ledger` linkage with `disposition` and `row_ref`
- `""` only for fields whose schema explicitly allows empty strings

If any stale scalar `slice_ledger_mapping` or contradictory empty-value examples remain, remove them before code lands.

- [ ] **Step 4: Verify the current-HEAD currency rules are consistent**

Confirm the spec consistently uses:
- `branch_ref` plus the current checked-out `HEAD` for runtime currency checks
- current-`HEAD` review and verification comparisons
- explicit active-id linkage, doc-reconciliation transitions, and multi-file checkpoint validation

If any stale `head_commit` references or inconsistent transition language remain, remove them before code lands.

- [ ] **Step 5: Refresh the handoff doc so it matches the tightened contract**

Replace the stale blocker list in the handoff with the actual remaining implementation risks after the spec cleanup. The handoff should stop telling future sessions that the implementation basis is still blocked on the slice-ledger shape, `head_commit`, or block delimiters.

### Task 2: Write RED tests that encode the contract before implementation

**Files:**
- Create: `docs/repo-workflow/campaign.yaml`
- Create: `docs/repo-workflow/chunks.yaml`
- Create: `docs/repo-workflow/attempts.yaml`
- Create: `src/repo-workflow/validator.test.ts`
- Create: `src/repo-workflow/cli.test.ts`
- Test: `src/repo-workflow/validator.test.ts`
- Test: `src/repo-workflow/cli.test.ts`

- [ ] **Step 1: Create the initial canonical YAML control-plane files before code work starts**

Seed `docs/repo-workflow/campaign.yaml`, `docs/repo-workflow/chunks.yaml`, and `docs/repo-workflow/attempts.yaml` with the real first active chunk for this slice.

The initial state must already make these truths explicit:
- the active repo-workflow campaign exists now, not later
- the first active chunk is the contract-freeze and validator foundation work
- the active attempt row already exists for that chunk

Do not wait until a later chunk to backfill control-plane state for work that has already happened.

- [ ] **Step 2: Add fixture-driven validator tests for the happy path**

Create temporary repos in the test using the real tracked-doc layout and assert that validation succeeds only when all of these are true:

```ts
assert.equal(result.ok, true);
assert.equal(result.campaign.campaignId, "rw-001");
assert.equal(result.campaign.activeChunkId, "c-001");
assert.equal(result.activeAttempt.attemptId, "a-001");
```

- [ ] **Step 3: Add failing tests for startup-doc cutover validation**

Cover at least:
- one mandatory startup doc missing `repo-workflow-startup: repo-workflow-v1`
- missing projection sentinel block
- `docs/milestones.md` missing the machine-readable registry block
- projection ids not matching canonical YAML ids

Expected failures should assert on clear operator-facing messages such as:

```ts
assert.match(error.message, /missing startup marker/i);
assert.match(error.message, /projection ids do not match canonical repo-workflow state/i);
```

- [ ] **Step 4: Add failing tests for canonical-YAML invariants**

Cover:
- `campaign.active_attempt_id` points at a missing attempt
- `attempt.chunk_id` does not match the active chunk
- illegal enum values
- `verification_command` defined in the wrong file
- a reviewed or verified commit does not equal the current checked-out `HEAD` on canonical `branch_ref`

- [ ] **Step 5: Add failing tests for dirty-worktree fail-closed behavior**

Reuse real git temp repos and assert the validator rejects any uncommitted change, including `.switchyard/` changes, because repo-workflow resume is fail-closed on a dirty worktree.

- [ ] **Step 6: Add failing CLI tests for machine-readable validation exit behavior**

The repo-local entrypoint should:
- print one success summary on stdout and exit `0` when valid
- print one specific validation failure on stderr and exit `1` when invalid

- [ ] **Step 7: Run the targeted tests to verify RED**

Run: `node --import tsx --test src/repo-workflow/validator.test.ts src/repo-workflow/cli.test.ts`

Expected: FAIL because the validator modules and CLI entrypoint do not exist yet.

- [ ] **Step 8: Make an early clean checkpoint commit**

After the initial YAML files and RED tests exist, make one local checkpoint commit so the control plane is actually committed before later chunks depend on it.

```bash
git add docs/repo-workflow/campaign.yaml docs/repo-workflow/chunks.yaml docs/repo-workflow/attempts.yaml \
  src/repo-workflow/validator.test.ts src/repo-workflow/cli.test.ts \
  docs/superpowers/specs/2026-03-24-repo-workflow-state-and-resume-design.md \
  docs/session-handoffs/2026-03-24-repo-workflow-handoff.md
git commit -m "docs: bootstrap repo workflow control plane"
```

## Chunk 2: Implement The Repo-Workflow Validator

### Task 3: Implement the canonical types, document loaders, and cross-file validator

**Files:**
- Create: `src/repo-workflow/types.ts`
- Create: `src/repo-workflow/documents.ts`
- Create: `src/repo-workflow/git.ts`
- Create: `src/repo-workflow/validator.ts`
- Test: `src/repo-workflow/validator.test.ts`

- [ ] **Step 1: Define the canonical repo-workflow TypeScript types**

Model the three YAML files and the embedded markdown blocks directly, for example:

```ts
type SliceLedgerRowRef = `S${number}` | null;

export interface RepoWorkflowCampaignDocument {
  repo_workflow_campaign: {
    schema_version: 1;
    campaign_id: string;
    product_milestone_id: string;
    campaign_state: "active" | "blocked" | "complete" | "abandoned" | "superseded";
    active_chunk_id: string | null;
    active_attempt_id: string | null;
    branch_ref: string;
    baseline_command: string;
    slice_ledger: {
      disposition: "pending" | "new-row" | "folded-into-existing-row";
      row_ref: SliceLedgerRowRef;
    };
    last_updated: string;
  };
}
```

- [ ] **Step 2: Implement YAML and markdown-block loaders**

`src/repo-workflow/documents.ts` should provide small focused helpers:
- read and parse `docs/repo-workflow/campaign.yaml`
- read and parse `docs/repo-workflow/chunks.yaml`
- read and parse `docs/repo-workflow/attempts.yaml`
- extract the projection block from `docs/current-state.md`, `docs/next-steps.md`, and `docs/focus-tracker.md`
- extract the milestone registry block from `docs/milestones.md`
- report parse failures with the exact file path and block kind

- [ ] **Step 3: Implement the fail-closed validator**

`src/repo-workflow/validator.ts` should validate, in order:
1. mandatory startup markers
2. clean worktree
3. canonical YAML parsing
4. cross-file id equality
5. milestone registry match
6. projection-block equality
7. active attempt/chunk linkage
8. legal state and transition invariants
9. current checked-out `HEAD` versus canonical `branch_ref` and review currency

Return a structured result object instead of only throwing strings, for example:

```ts
type RepoWorkflowValidationResult =
  | { ok: true; campaign: LoadedCampaign; activeAttempt: LoadedAttempt }
  | { ok: false; code: "invalid_projection" | "dirty_worktree" | "invalid_state"; message: string };
```

- [ ] **Step 4: Implement a strict repo-workflow dirty-worktree check**

Do not reuse the product helper's `.switchyard/` ignore behavior for this slice.

Instead, implement `src/repo-workflow/git.ts` so the validator fails on any uncommitted tracked or untracked entry in the repo worktree.

- [ ] **Step 5: Run the validator tests to verify GREEN**

Run: `node --import tsx --test src/repo-workflow/validator.test.ts`

Expected: PASS with both valid and invalid repo-workflow fixtures covered.

### Task 4: Add the repo-local validation entrypoint

**Files:**
- Create: `src/repo-workflow/cli.ts`
- Modify: `package.json`
- Test: `src/repo-workflow/cli.test.ts`

- [ ] **Step 1: Implement the CLI wrapper**

The CLI should:
- default to validating the current repo root
- print one compact success line such as `repo-workflow: valid campaign rw-001 chunk c-001 attempt a-001`
- print one compact failure line with the validation code and message
- exit non-zero on validation failure

- [ ] **Step 2: Add the npm script entrypoint**

Add:

```json
"repo-workflow:validate": "tsx src/repo-workflow/cli.ts"
```

Do not wire this into the product `sy` command surface in this slice.

- [ ] **Step 3: Run the CLI tests to verify GREEN**

Run: `node --import tsx --test src/repo-workflow/cli.test.ts`

Expected: PASS with exit-code and stdout/stderr assertions.

## Chunk 3: Cut Over The Tracked Repo Workflow Docs

### Task 5: Refresh the canonical YAML control-plane files to landed truth

**Files:**
- Modify: `docs/repo-workflow/campaign.yaml`
- Modify: `docs/repo-workflow/chunks.yaml`
- Modify: `docs/repo-workflow/attempts.yaml`
- Modify: `docs/superpowers/specs/2026-03-24-repo-workflow-state-and-resume-design.md`

- [ ] **Step 1: Sync `docs/repo-workflow/campaign.yaml` to the state after the slice lands**

Update it so the landed repo does not ship stale campaign truth. The document must reflect:
- the final active-or-terminal campaign state
- the final active ids or explicit `null` values if the contract now requires terminal nulling
- the canonical `branch_ref`
- the final slice-ledger linkage shape chosen in Task 1

- [ ] **Step 2: Sync `docs/repo-workflow/chunks.yaml` to the executed chunk order**

Update chunk rows so they reflect the actual executed chunks and verification commands used in this slice.

Use one `verification_command` per chunk and make `chunks.yaml` the only owner of that field.

- [ ] **Step 3: Sync `docs/repo-workflow/attempts.yaml` to the final attempt state**

Update attempt rows so the landed repo reflects the final review, verification, and reconciliation state for each executed chunk.

- [ ] **Step 4: Keep the spec examples aligned with the files you actually created**

After the YAML files exist, re-read the spec and fix any example drift so the spec still describes the landed format exactly.

### Task 6: Migrate the startup docs and projection docs atomically

**Files:**
- Modify: `AGENTS.md`
- Modify: `PLAN.md`
- Modify: `docs/dev-workflow.md`
- Modify: `docs/current-state.md`
- Modify: `docs/next-steps.md`
- Modify: `docs/focus-tracker.md`
- Modify: `docs/backlog.md`
- Modify: `docs/roadmap.md`
- Modify: `docs/milestones.md`
- Verify: `docs/slice-ledger.md`

- [ ] **Step 1: Add the startup marker to every mandatory startup doc**

Each of these must contain the exact literal:

```text
repo-workflow-startup: repo-workflow-v1
```

Do this in a consistent, easy-to-parse location near the top of each file.

- [ ] **Step 2: Add deterministic projection blocks to the human-facing repo-workflow docs**

Add the projection block to:
- `docs/current-state.md`
- `docs/next-steps.md`
- `docs/focus-tracker.md`

The ids in those blocks must match the canonical YAML files exactly.

- [ ] **Step 3: Add the machine-readable milestone registry block**

Add the registry block near the top of `docs/milestones.md` using the exact sentinel format the validator expects.

- [ ] **Step 4: Remove stale or conflicting startup guidance**

This is the important migration step. Do not only add markers. Also remove or rewrite text that still tells fresh sessions to derive active workflow state from prose paragraphs instead of the canonical YAML files.

Specifically rework:
- `AGENTS.md`
- `PLAN.md`
- `docs/dev-workflow.md`
- `docs/current-state.md`
- `docs/next-steps.md`
- `docs/focus-tracker.md`

so they describe the new control-plane precedence truthfully.

For `docs/backlog.md` and `docs/roadmap.md`, add the startup marker and a short note that they remain product-policy context, not repo-workflow state owners.

- [ ] **Step 5: Preserve the slice-ledger boundary**

Do not turn `docs/slice-ledger.md` into mutable campaign state.

Only update `docs/slice-ledger.md` if this slice truly qualifies as a new implementation row under the accepted ledger rules. If it does not materially change the product operator loop, leave the ledger count unchanged and record the mapping only in the repo-workflow campaign files.

- [ ] **Step 6: Run the validator against the migrated docs**

Do this from a clean checkpoint, not from a dirty in-progress worktree. Use one of these paths:
- commit the cutover files first, then run `npm run repo-workflow:validate`
- or validate from a temporary clean checkout of the staged result

Run: `npm run repo-workflow:validate`

Expected: PASS with the current tracked repo state.

## Chunk 4: Full Verification And Closeout

### Task 7: Verify the slice and update planning state truthfully

**Files:**
- Modify: `docs/current-state.md`
- Modify: `docs/next-steps.md`
- Modify: `docs/focus-tracker.md`
- Modify: `docs/repo-workflow/campaign.yaml`
- Modify: `docs/repo-workflow/chunks.yaml`
- Modify: `docs/repo-workflow/attempts.yaml`

- [ ] **Step 1: Update planning prose to describe the landed repo-workflow slice**

Once the validator and YAML control plane are real, make the planning docs say that clearly without pretending the later proof-gate or PR/auto-merge slice exists already.

- [ ] **Step 2: Advance the next recommended repo-workflow slice**

Set the next repo-workflow work to the later spec area:
- smoke/demo proof gate
- PR lifecycle
- auto-merge policy for building Switchyard itself

Do not change the product-policy `manual-ready` contract in the same edit.

- [ ] **Step 3: Do one final canonical-state sync before clean validation**

Immediately before the clean validation pass, re-read:
- `docs/repo-workflow/campaign.yaml`
- `docs/repo-workflow/chunks.yaml`
- `docs/repo-workflow/attempts.yaml`

and update any fields that still lag the landed slice state. Do not assume the earlier YAML edits stayed current while later tasks changed the repo.

- [ ] **Step 4: Run the targeted repo-workflow checks**

Run:
- `node --import tsx --test src/repo-workflow/validator.test.ts src/repo-workflow/cli.test.ts`
- `npm run repo-workflow:validate` from a clean checkpoint or a temporary clean checkout of the staged result

Expected: PASS.

- [ ] **Step 5: Run the full repo check suite**

Run: `npm run check`

Expected: PASS.

- [ ] **Step 6: Review the final diff for the intended boundaries**

Confirm:
- product CLI behavior did not broaden
- `docs/slice-ledger.md` was not turned into mutable controller state
- the only new automation is the repo-local validator and its npm entrypoint
- the startup docs all point at the same canonical YAML state

- [ ] **Step 7: Commit the slice**

```bash
git add AGENTS.md PLAN.md package.json \
  docs/dev-workflow.md docs/current-state.md docs/next-steps.md docs/focus-tracker.md docs/backlog.md docs/roadmap.md docs/milestones.md docs/slice-ledger.md \
  docs/repo-workflow/campaign.yaml docs/repo-workflow/chunks.yaml docs/repo-workflow/attempts.yaml \
  docs/session-handoffs/2026-03-24-repo-workflow-handoff.md \
  docs/superpowers/specs/2026-03-24-repo-workflow-state-and-resume-design.md \
  docs/superpowers/plans/2026-03-24-repo-workflow-state-and-resume.md \
  src/repo-workflow/types.ts src/repo-workflow/documents.ts src/repo-workflow/git.ts src/repo-workflow/validator.ts src/repo-workflow/validator.test.ts src/repo-workflow/cli.ts src/repo-workflow/cli.test.ts
git commit -m "feat: add repo workflow state validator"
```

### Task 8: Review the plan execution boundary before opening the implementation PR

**Files:**
- Verify: `docs/superpowers/specs/2026-03-24-repo-workflow-state-and-resume-design.md`
- Verify: `docs/superpowers/plans/2026-03-24-repo-workflow-state-and-resume.md`

- [ ] **Step 1: Confirm the implementation stayed inside the first slice**

Reject any stray work that adds:
- PR creation automation
- auto-merge behavior
- smoke/demo proof recording
- product merge-policy changes

- [ ] **Step 2: Prepare the PR summary around repo-workflow migration**

Call out:
- canonical YAML files added under `docs/repo-workflow/`
- repo-local validator and npm script
- startup-doc cutover and milestone registry
- example output from `npm run repo-workflow:validate`
- any remaining follow-up reserved for the proof-gate/PR-lifecycle slice

- [ ] **Step 3: Send the milestone PR**

Push the branch and open or update the PR so this milestone bundle is not left only in a local commit.

The PR body must include:
- the repo-workflow migration summary
- the verification evidence
- example output for the new operator-facing validation command
