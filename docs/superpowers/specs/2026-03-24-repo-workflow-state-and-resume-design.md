# Repo Workflow State And Resume Design

## Status

Active design for the first repo-workflow migration slice.

This spec is the implementation basis for:
- repo-workflow authority split
- canonical YAML state for active repo-workflow campaigns
- deterministic session resume
- explicit chunk and review recovery
- separation between mutable campaign state and the historical slice ledger

This spec does not include:
- PR auto-merge
- smoke/demo proof gates
- GitHub landing automation

Those belong to later specs after the state layer is mechanically reliable.

## Summary

Switchyard cannot support low-handholding multi-session repo work until the repo has one canonical, machine-readable control plane.

The previous designs failed because they mixed machine state into too many Markdown docs.
That creates drift, tie-breakers, and resume ambiguity.

This design uses a stricter model:
- canonical machine state lives only in committed YAML files under `docs/repo-workflow/`
- startup Markdown docs are human-facing and carry one exact migration marker
- `docs/current-state.md`, `docs/next-steps.md`, and `docs/focus-tracker.md` are projections, not control-plane owners
- `docs/slice-ledger.md` remains the canonical historical ledger of landed implementation slices

Fresh sessions should resume from:
- `docs/repo-workflow/campaign.yaml`
- `docs/repo-workflow/chunks.yaml`
- `docs/repo-workflow/attempts.yaml`

## Goals

- Define an explicit split between product-policy docs and repo-workflow docs
- Make canonical repo-workflow state parseable without guessing
- Make startup cutover machine-verifiable
- Make resume fail closed on stale startup docs, invalid YAML, or dirty worktrees
- Define chunk, review, verification, and attempt transitions precisely enough for interruption and recovery
- Keep `docs/slice-ledger.md` aligned with its accepted historical purpose

## Review Framing

This spec intentionally enables larger autonomous repo-workflow campaigns across sessions.

Reviewers should judge:
- whether the state model is deterministic
- whether authority and migration are explicit
- whether interruption and recovery are specified tightly enough to implement

Reviewers should not reject it merely because it reduces human checkpoints.

## Non-Goals

- No change to Switchyard's product `manual-ready` merge policy
- No PR automation in this slice
- No smoke/demo proof gate in this slice
- No mutable controller state in `docs/slice-ledger.md`
- No resume from dirty worktrees in v1

## Authority Model

### Product-policy authority

These docs define what Switchyard the product should do:
- `PLAN.md`
- `docs/cli-contract.md`
- `docs/backlog.md`
- `docs/merge-workflow.md`
- `docs/milestones.md`
- `docs/roadmap.md`
- adopted decision docs under `docs/decisions/`

These docs control:
- product scope
- rollout order
- product merge policy such as `manual-ready`

### Repo-workflow authority

These docs define how Codex should build the Switchyard repository:
- `AGENTS.md`
- `docs/dev-workflow.md`
- `docs/current-state.md`
- `docs/next-steps.md`
- `docs/focus-tracker.md`
- canonical YAML files under `docs/repo-workflow/`

These docs control:
- active repo-workflow campaign
- active chunk and attempt
- repo-workflow scope control
- session resume behavior

### Precedence

Fresh sessions should use:
1. product-policy docs for product meaning
2. canonical YAML repo-workflow state for active development behavior
3. human-facing repo-workflow Markdown docs as projections and guidance
4. historical ledgers only as evidence

## Atomic Cutover

Resume must not use the new workflow until startup docs are migrated together.

Mandatory same-slice startup docs:
- `AGENTS.md`
- `PLAN.md`
- `docs/dev-workflow.md`
- `docs/current-state.md`
- `docs/next-steps.md`
- `docs/focus-tracker.md`
- `docs/backlog.md`
- `docs/roadmap.md`
- `docs/milestones.md`

Mandatory new YAML files:
- `docs/repo-workflow/campaign.yaml`
- `docs/repo-workflow/chunks.yaml`
- `docs/repo-workflow/attempts.yaml`

Every mandatory startup doc must contain the exact marker:

```text
repo-workflow-startup: repo-workflow-v1
```

Validation rule:
- if any mandatory startup doc lacks that exact marker, resume must stop
- partial cutover is invalid

Pre-cutover bootstrap rule:
- committed `docs/repo-workflow/*.yaml` files may exist before atomic cutover is finished
- those files are bootstrap inputs only and must not be treated as resumable canonical workflow state until every mandatory startup doc carries the startup marker
- a fresh session that finds bootstrap YAML without full startup-doc cutover must treat the repo as still pre-cutover and must not resume through the new validator-driven workflow

## Canonical YAML Files

Only these files own active repo-workflow state:
- `docs/repo-workflow/campaign.yaml`
- `docs/repo-workflow/chunks.yaml`
- `docs/repo-workflow/attempts.yaml`

All three must be valid YAML.

### Shared syntax rules

- top-level keys are fixed and case-sensitive
- repo-workflow ids match `[a-z0-9-]+`
- slice-ledger row refs match `S[0-9]+`
- dates use `YYYY-MM-DD`
- timestamps use ISO 8601 UTC
- git commits use full 40-character lowercase hex SHA
- enums use lowercase kebab-case
- `null` is the only legal empty value for nullable fields
- string fields may use `""` only when the field-specific schema explicitly allows it

## `docs/repo-workflow/campaign.yaml`

This file owns current campaign identity and current branch identity.

Required schema:

```yaml
repo_workflow_campaign:
  schema_version: 1
  campaign_id: rw-001
  bundle_id: repo-workflow-foundation
  product_milestone_id: m7
  campaign_state: active
  active_chunk_id: c-001
  active_attempt_id: a-001
  branch_ref: refs/heads/repo-workflow-foundation
  baseline_command: npm run check
  slice_ledger:
    disposition: pending
    row_ref: null
  last_updated: 2026-03-24
```

Required keys:
- `schema_version`
- `campaign_id`
- `bundle_id`
- `product_milestone_id`
- `campaign_state`
- `active_chunk_id`
- `active_attempt_id`
- `branch_ref`
- `baseline_command`
- `slice_ledger`
- `last_updated`

Allowed `campaign_state` values:
- `active`
- `blocked`
- `complete`
- `abandoned`
- `superseded`

Allowed `slice_ledger.disposition` values:
- `pending`
- `new-row`
- `folded-into-existing-row`

`slice_ledger` rules:
- `row_ref` is `null` when `disposition` is `pending`
- `row_ref` must match an existing stable slice id such as `S09` when `disposition` is `new-row` or `folded-into-existing-row`

Ownership rules:
- current `branch_ref` lives only here
- in landed repo state, `branch_ref` must name the canonical long-lived branch the repo-workflow validator should resume on after merge, not a short-lived review branch
- repo baseline command lives only here
- canonical slice-ledger linkage lives only here

## `docs/repo-workflow/chunks.yaml`

This file owns chunk ordering and chunk contracts.

Required schema:

```yaml
repo_workflow_chunks:
  schema_version: 1
  campaign_id: rw-001
  bundle_id: repo-workflow-foundation
  manifest_state: active
  chunks:
    - chunk_id: c-001
      next_chunk_id: c-002
      objective: define-authority-split
      scope: repo-workflow-docs
      done_condition: authority-split-documented
      verification_command: npm run check
      owner_role: controller
    - chunk_id: c-002
      next_chunk_id: null
      objective: add-canonical-campaign-state
      scope: repo-workflow-yaml
      done_condition: campaign-state-documented
      verification_command: npm run check
      owner_role: controller
  last_updated: 2026-03-24
```

Required top-level keys:
- `schema_version`
- `campaign_id`
- `bundle_id`
- `manifest_state`
- `chunks`
- `last_updated`

Allowed `manifest_state` values:
- `active`
- `complete`
- `superseded`

Required keys per chunk:
- `chunk_id`
- `next_chunk_id`
- `objective`
- `scope`
- `done_condition`
- `verification_command`
- `owner_role`

Rules:
- `chunks` is an ordered list
- `chunk_id` values are unique
- `next_chunk_id` must reference another chunk id or be `null`
- exactly one terminal chunk may use `next_chunk_id: null`
- chunk verification command lives only here

## `docs/repo-workflow/attempts.yaml`

This file owns active and historical attempt state for chunks in the current campaign.

Required schema:

```yaml
repo_workflow_attempts:
  schema_version: 1
  campaign_id: rw-001
  attempts:
    - attempt_id: a-001
      chunk_id: c-001
      attempt_number: 1
      state: ready
      blocked_reason: none
      implementer_status: not-started
      spec_review_status: not-started
      spec_reviewed_commit: null
      quality_review_status: not-started
      quality_reviewed_commit: null
      verification_result: not-run
      verification_head_commit: null
      verified_at: null
      docs_reconciled: false
      summary: ""
      notes: ""
  last_updated: 2026-03-24
```

Required top-level keys:
- `schema_version`
- `campaign_id`
- `attempts`
- `last_updated`

Required keys per attempt:
- `attempt_id`
- `chunk_id`
- `attempt_number`
- `state`
- `blocked_reason`
- `implementer_status`
- `spec_review_status`
- `spec_reviewed_commit`
- `quality_review_status`
- `quality_reviewed_commit`
- `verification_result`
- `verification_head_commit`
- `verified_at`
- `docs_reconciled`
- `summary`
- `notes`

Allowed `state` values:
- `ready`
- `implementing`
- `awaiting-spec-review`
- `awaiting-quality-review`
- `review-failed`
- `awaiting-verification`
- `blocked`
- `complete`
- `abandoned`

Allowed `blocked_reason` values:
- `none`
- `operator-input`
- `doc-reconciliation`
- `execution-failure`

Allowed `implementer_status` values:
- `not-started`
- `done`
- `done-with-concerns`
- `needs-context`
- `blocked`

Allowed `spec_review_status` values:
- `not-started`
- `approved`
- `issues-found`

Allowed `quality_review_status` values:
- `not-started`
- `approved`
- `issues-found`

Allowed `verification_result` values:
- `not-run`
- `passed`
- `failed`

Rules:
- `attempt_id` values are unique
- `attempt_number` is integer `>= 1`
- `spec_reviewed_commit` is `null` unless `spec_review_status` is not `not-started`
- `quality_reviewed_commit` is `null` unless `quality_review_status` is not `not-started`
- `verification_head_commit` is `null` unless `verification_result` is not `not-run`
- `verified_at` is `null` unless `verification_result` is not `not-run`
- `summary` and `notes` are single-line YAML strings and may be empty strings

## Cross-File Invariants

- when `campaign_state` is `active` or `blocked`, `active_chunk_id` and `active_attempt_id` must both be non-`null`
- when `campaign_state` is `complete`, `abandoned`, or `superseded`, `active_chunk_id` and `active_attempt_id` must both be `null`
- `active_chunk_id` must reference one chunk row in `chunks.yaml` when it is non-`null`
- `active_attempt_id` must reference one attempt row in `attempts.yaml` when it is non-`null`
- the active attempt's `chunk_id` must equal `active_chunk_id`
- `campaign_state: blocked` requires the active attempt `state` to be `blocked`
- `campaign_state: active` allows active attempt `state` values `ready`, `implementing`, `awaiting-spec-review`, `awaiting-quality-review`, `awaiting-verification`, `review-failed`, `blocked`, or `complete`
- only the attempt referenced by `active_attempt_id` is treated as the resumable current attempt; all other attempt rows are historical context

## Projection Markdown Docs

These docs remain human-facing:
- `docs/current-state.md`
- `docs/next-steps.md`
- `docs/focus-tracker.md`

Each must contain exactly one delimited projection block near the top:

````md
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
````

Rules:
- the validator reads only the YAML content between the exact start and end markers
- `docs/current-state.md` and `docs/next-steps.md` must include `active_chunk_id`
- `docs/focus-tracker.md` may omit `active_chunk_id`
- projection ids must match canonical YAML exactly
- the three projection docs plus the milestone registry block form one current-`HEAD` checkpoint; any mismatch at the checked-out `HEAD` is invalid

Per-chunk doc reconciliation requires:
- `docs/current-state.md`
- `docs/next-steps.md`

## Dirty Worktree Rule

V1 does not resume from a dirty worktree.

Resume rule:
- if the current git worktree has uncommitted changes, stop and ask the operator before continuing

## Review And Verification Currency

Attempt state is always evaluated against the current checked-out `HEAD` commit on canonical `branch_ref`.
No canonical YAML field stores an authoritative "current head" value for resume decisions; currency is always derived from the checked-out repo state on `branch_ref`.

Completion conditions for a chunk:
- active attempt `state` is `complete`
- `spec_review_status` is `approved`
- `quality_review_status` is `approved`
- `spec_reviewed_commit` equals the current checked-out `HEAD`
- `quality_reviewed_commit` equals the current checked-out `HEAD`
- `verification_result` is `passed`
- `verification_head_commit` equals the current checked-out `HEAD`
- `docs_reconciled` is `true`

Reset rules when the checked-out `HEAD` commit changes:
- `spec_review_status` resets to `not-started`
- `spec_reviewed_commit` resets to `null`
- `quality_review_status` resets to `not-started`
- `quality_reviewed_commit` resets to `null`
- `verification_result` resets to `not-run`
- `verification_head_commit` resets to `null`
- `verified_at` resets to `null`
- `docs_reconciled` resets to `false`

## Attempt Lifecycle

Initial rule:
- when a chunk becomes active, an attempt with `attempt_number: 1` and `state: ready` must already exist in `attempts.yaml`

New attempt rule:
- a new attempt row is created only when implementation resumes after a `review-failed`, `blocked`, or `abandoned` attempt and new code changes are about to begin

If fixes have started but no new commit exists yet:
- resume must stop and ask the operator because v1 does not model dirty worktree progress

## State Transition Table

| Current attempt state | Trigger | Next attempt state | Required updates |
| --- | --- | --- | --- |
| `ready` | implementation starts | `implementing` | set `implementer_status: not-started` |
| `implementing` | implementer returns `done` or `done-with-concerns` | `awaiting-spec-review` | update `implementer_status` |
| `implementing` | implementer returns `needs-context` | `blocked` | set `blocked_reason: operator-input` |
| `implementing` | implementer returns `blocked` | `blocked` | set `blocked_reason` appropriately |
| `awaiting-spec-review` | spec review approved | `awaiting-quality-review` | set `spec_review_status: approved`, set `spec_reviewed_commit` |
| `awaiting-spec-review` | spec review issues found | `review-failed` | set `spec_review_status: issues-found` |
| `awaiting-quality-review` | quality review approved and verification/docs not current | `awaiting-verification` | set `quality_review_status: approved`, set `quality_reviewed_commit` |
| `awaiting-quality-review` | quality review approved and verification/docs already current | `complete` | set `quality_review_status: approved`, set `quality_reviewed_commit` |
| `awaiting-quality-review` | quality review issues found | `review-failed` | set `quality_review_status: issues-found` |
| `review-failed` | operator or controller begins new coded fix attempt | new row with incremented `attempt_number`, state `implementing` | append new attempt row |
| `blocked` | block resolved and new coded fix attempt begins | new row with incremented `attempt_number`, state `implementing` | append new attempt row |
| `awaiting-verification` | verification passed for the current checked-out `HEAD` but docs are not yet reconciled | `blocked` | set verification fields, set `blocked_reason: doc-reconciliation` |
| `awaiting-verification` | verification passed for the current checked-out `HEAD` and docs reconciled | `complete` | set verification fields |
| `awaiting-verification` | verification failed | `blocked` | set `blocked_reason: execution-failure` |
| `blocked` | block resolved by doc reconciliation only and review/verification state is still current | `complete` | set `blocked_reason: none`, set `docs_reconciled: true` |
| `blocked` | block resolved by doc reconciliation only and review or verification is stale | `awaiting-spec-review`, `awaiting-quality-review`, or `awaiting-verification` based on prior statuses | set `blocked_reason: none`, update existing row |
| `blocked` | execution environment fixed and verification can be retried without code changes | `awaiting-verification` | set `blocked_reason: none` |
| `complete` | successor chunk exists | successor attempt `ready` | update canonical `active_chunk_id`, `active_attempt_id`, append successor attempt |
| `complete` | terminal chunk | campaign `complete` | update `campaign.yaml`, update `chunks.yaml` |

## Resume Rules

At session start:
1. read `AGENTS.md`
2. read `docs/dev-workflow.md`
3. verify every mandatory startup doc contains `repo-workflow-startup: repo-workflow-v1`
4. verify git worktree is clean
5. parse `docs/repo-workflow/campaign.yaml`
6. parse `docs/repo-workflow/chunks.yaml`
7. parse `docs/repo-workflow/attempts.yaml`
8. verify the checked-out symbolic branch ref equals canonical `branch_ref`
9. verify the checked-out `HEAD` resolves to a commit on that branch
10. verify canonical ids match across the three YAML files
11. parse projection blocks from `docs/current-state.md`, `docs/next-steps.md`, and `docs/focus-tracker.md`
12. verify required projection ids match canonical ids
13. read product-policy docs for canonical `product_milestone_id`
14. locate the canonical active attempt by `active_attempt_id`

Fail-closed rule:
- if any step above fails, stop and reconcile before implementation

Campaign-state behavior:
- `active`: continue
- `blocked`: stop and resolve block
- `complete`: do not resume implementation
- `abandoned`: do not resume implementation
- `superseded`: do not resume implementation

Attempt-state behavior:
- `ready`: start implementation
- `implementing`: continue implementation
- `awaiting-spec-review`: run spec review
- `awaiting-quality-review`: run quality review
- `review-failed`: begin new fix attempt
- `awaiting-verification`: run chunk verification command from `chunks.yaml`
- `blocked`: reconcile docs when `blocked_reason` is `doc-reconciliation`, rerun verification when `blocked_reason` is `execution-failure` and the external blocker is cleared, otherwise stop
- `complete`: advance to successor or finish campaign

## Baseline Verification

Repo baseline check comes only from canonical `baseline_command` in `campaign.yaml`.

Chunk verification comes only from canonical `verification_command` in `chunks.yaml`.

Baseline rule:
- if baseline has not passed for the current checked-out `HEAD`, run `baseline_command` before continuing

## Product Milestone Registry

`docs/milestones.md` must gain exactly one delimited machine-readable registry block near the top:

````md
<!-- repo-workflow-milestones:start -->
```yaml
repo_workflow_milestones:
  - milestone_id: m7
    title: lead-host-recovery-and-stop-policy
```
<!-- repo-workflow-milestones:end -->
````

Rules:
- the validator reads only the YAML content between the exact start and end markers
- `product_milestone_id` in `campaign.yaml` must match one registry entry exactly
- registry ids use the same lowercase format as canonical repo-workflow state

## Slice Ledger Boundary

`docs/slice-ledger.md` remains the historical ledger of landed implementation slices.

Mapping rules:
- internal chunks do not get slice-ledger rows by default
- one landed repo-workflow bundle gets one slice-ledger row only if it materially changed the operator loop
- if no truthful existing slice-ledger row is the right fold target, canonical `slice_ledger.disposition` may remain `pending` until a later explicit mapping decision is recorded
- otherwise canonical `slice_ledger.disposition` may use `folded-into-existing-row`
- canonical `slice_ledger.row_ref` points at the existing or new slice row when `disposition` is not `pending`
- when a ledger row exists, the same mapping decision is recorded in that row's notes

## Supersession

[2026-03-24-milestone-autopilot-repo-workflow-design.md](/Users/shakilakram/projects/switchyard/docs/superpowers/specs/2026-03-24-milestone-autopilot-repo-workflow-design.md) is superseded as the implementation basis for active repo-workflow state and resume behavior.

For active repo-workflow state:
- this spec owns `docs/repo-workflow/campaign.yaml`
- this spec owns `docs/repo-workflow/chunks.yaml`
- this spec owns `docs/repo-workflow/attempts.yaml`
- this spec forbids using `docs/slice-ledger.md` as mutable controller state

## Validator Requirement

This slice must include a repo-local validator that checks:
- startup markers on mandatory startup docs
- YAML schema shape
- cross-file id equality
- milestone registry match
- active attempt existence
- transition legality

Resume must fail closed if the validator fails.

## Acceptance

This design is complete when:
- repo-workflow authority is explicitly separated from product-policy authority
- canonical repo-workflow state lives only in dedicated YAML files
- startup cutover is machine-verifiable
- fresh sessions can derive active campaign, chunk, and attempt without guessing
- dirty worktrees stop resume in v1
- `docs/slice-ledger.md` remains the canonical historical slice ledger and is not used as mutable controller state
- the repo is ready for a later spec that adds proof gates and PR/merge automation on top of this state layer
