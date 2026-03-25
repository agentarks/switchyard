# Repo Workflow Milestone Proof Gate Design

## Status

Active design for the next repo-workflow slice after the state-and-resume foundation.

This spec is the implementation basis for:
- a minimal repo-local milestone proof gate
- validator-enforced closeout proof before the repo-workflow campaign advances
- explicit proof recording in canonical repo-workflow state

This spec does not include:
- PR lifecycle automation
- auto-merge policy
- screenshots, demos, or external proof systems
- product merge-policy changes

Those remain later repo-local follow-up work.

## Summary

The repo now has canonical state, deterministic resume, and a fail-closed validator.
What it still lacks is one canonical answer to:

`Was this milestone bundle tested enough that the repo can start the next task?`

The smallest honest answer is a validator-enforced proof gate on milestone closeout only.

This design keeps the proof gate intentionally narrow:
- proof is required only for the milestone-closeout chunk
- proof is recorded in `docs/repo-workflow/attempts.yaml`
- proof is repo-local and command-based
- proof exists only to show that the milestone was tested enough to advance

The proof gate should not introduce a second artifact system or a richer review workflow.

## Goals

- Record one minimal proof checkpoint before a milestone-closeout attempt is complete
- Keep the "ready to start the next task?" answer inside canonical repo-workflow state
- Make the proof gate validator-enforced rather than advisory
- Keep proof repo-local, explicit, and easy to read in one pass
- Avoid broadening this slice into PR automation or demo tooling

## Non-Goals

- No proof requirement for every chunk
- No screenshots, video capture, browser traces, or external links
- No GitHub, PR, or merge automation in this slice
- No new standalone proof files
- No change to Switchyard's product `manual-ready` policy

## Recommended Approach

Treat proof as two related but distinct facts:
- whether a chunk contract requires milestone-closeout proof
- what proof was actually recorded for one execution attempt

Keep the requirement in the chunk contract and the evidence in the attempt record.

That yields the smallest coherent model:
- `docs/repo-workflow/chunks.yaml` says whether a chunk is proof-gated
- `docs/repo-workflow/attempts.yaml` records the actual proof for the current closeout attempt
- the validator enforces that a proof-gated closeout attempt cannot be complete without recorded proof on the current checked-out `HEAD`

This keeps proof in the existing control plane and avoids introducing a separate proof artifact type.

## Schema Changes

### `docs/repo-workflow/chunks.yaml`

Add one new required field to each chunk row:

```yaml
proof_gate: not-required
```

Allowed values:
- `not-required`
- `required`

Rules:
- normal implementation chunks use `proof_gate: not-required`
- the milestone-closeout chunk uses `proof_gate: required`
- only the chunk contract owns whether proof is required

Example closeout row:

```yaml
- chunk_id: c-003
  next_chunk_id: null
  objective: milestone-closeout
  scope: repo-workflow-proof-gate-closeout
  done_condition: proof-recorded-and-next-task-may-begin
  verification_command: npm run check
  proof_gate: required
  owner_role: controller
```

### `docs/repo-workflow/attempts.yaml`

Add these fields to every attempt row:

```yaml
proof_status: not-required
proof_summary: ""
proof_commands: []
proof_head_commit: null
proof_recorded_at: null
```

Allowed `proof_status` values:
- `not-required`
- `pending`
- `recorded`

Field rules:
- `proof_summary` may use `""` only when proof is not recorded
- `proof_commands` is an empty list when proof is not recorded
- `proof_head_commit` is `null` when proof is not recorded
- `proof_recorded_at` is `null` when proof is not recorded
- when proof is recorded:
  - `proof_summary` must be non-empty
  - `proof_commands` must contain at least one command
  - `proof_head_commit` must be a full 40-character lowercase SHA
  - `proof_recorded_at` must be an ISO 8601 UTC timestamp

Example closeout attempt after proof:

```yaml
- attempt_id: a-009
  chunk_id: c-003
  attempt_number: 1
  state: complete
  blocked_reason: none
  implementer_status: done
  spec_review_status: approved
  spec_reviewed_commit: 0123456789abcdef0123456789abcdef01234567
  quality_review_status: approved
  quality_reviewed_commit: 0123456789abcdef0123456789abcdef01234567
  verification_result: passed
  verification_head_commit: 0123456789abcdef0123456789abcdef01234567
  verified_at: 2026-03-25T19:00:00.000Z
  docs_reconciled: true
  proof_status: recorded
  proof_summary: "Ran the milestone closeout checks and confirmed the bundle is ready for the next task."
  proof_commands:
    - npm run check
  proof_head_commit: 0123456789abcdef0123456789abcdef01234567
  proof_recorded_at: 2026-03-25T19:05:00.000Z
  summary: "Milestone closeout completed with proof recorded."
  notes: "Ready to start the next repo-workflow task."
```

## Validator Rules

The validator must enforce proof only when `attempt.chunk_id` points at a chunk with `proof_gate: required`.

### Non-proof-gated attempts

If the chunk contract says `proof_gate: not-required`, then:
- `proof_status` must be `not-required`
- `proof_summary` must be `""`
- `proof_commands` must be `[]`
- `proof_head_commit` must be `null`
- `proof_recorded_at` must be `null`

This keeps normal chunks from carrying stray proof state.

### Proof-gated closeout attempts

If the chunk contract says `proof_gate: required`, then:
- `proof_status` may be `pending` while the attempt is not complete
- `proof_status` must be `recorded` before the attempt may be `complete`
- `proof_status: not-required` is invalid

If `proof_status: recorded`, then:
- `proof_summary` must be non-empty
- `proof_commands` must list at least one executed command
- `proof_head_commit` must equal the current checked-out `HEAD`
- `proof_recorded_at` must be present

If a proof-gated attempt is `complete` without recorded proof, validation must fail.

Example operator-facing failures:
- `closeout attempt 'a-005' is complete without recorded milestone proof`
- `proof_head_commit for attempt 'a-005' does not match the current checked-out HEAD`
- `proof_commands for attempt 'a-005' must list at least one executed verification command`

## Workflow Contract

Proof applies only at milestone closeout.
It is not a per-chunk burden on normal implementation work.

Expected closeout flow:
1. implementation chunks land without proof requirements
2. the milestone-closeout chunk becomes active
3. the operator or controller runs the final closeout verification command or commands
4. the closeout attempt row is updated with recorded proof
5. the validator accepts the closeout attempt as complete
6. the campaign may advance to the next task or next repo-workflow slice

The purpose of the proof gate is not to prove everything imaginable.
Its purpose is to prevent the repo from silently claiming milestone closeout without any explicit record of what was tested.

## Migration And Scope Boundary

This spec intentionally narrows the already-declared `c-005` follow-up area.

Implement this first:
- milestone-closeout proof gate
- validator enforcement
- canonical state and docs updates needed to record proof

Do not implement in the same slice:
- PR creation or PR state tracking
- auto-merge behavior
- GitHub landing automation
- richer proof artifacts beyond explicit commands and a short summary

If those later concerns need canonical state, they should land in separate follow-on specs after the proof gate is mechanically reliable.

## Testing

Add validator coverage for at least these cases:
- proof-gated closeout attempt marked `complete` without proof
- proof-gated closeout attempt with `proof_status: recorded` but missing summary
- proof-gated closeout attempt with an empty `proof_commands` list
- proof-gated closeout attempt with stale `proof_head_commit`
- non-proof-gated attempt carrying proof data
- valid proof-gated closeout attempt recorded on the current `HEAD`

Add CLI coverage if the repo-workflow validation output needs to call out proof-gate failures distinctly.

## Review Framing

Reviewers should judge this design on:
- whether it keeps proof small and deterministic
- whether the validator rules are precise enough to fail closed
- whether the state model avoids unnecessary new artifact types
- whether the slice boundary stays narrow

Reviewers should not reject it merely because:
- it does not add screenshots or richer demo artifacts
- it does not bundle PR lifecycle or auto-merge behavior into the same slice
