# Milestone Autopilot Repo Workflow Design

## Status

Active design for the repo workflow used to build Switchyard itself.

This design changes how future Switchyard development sessions should operate once a milestone bundle is approved:
- the default unit of autonomous execution becomes the active milestone bundle
- session boundaries become a transport detail, not a planning event
- subagent review becomes a required quality gate during implementation
- the default finish line becomes "milestone usable, PR opened, verification green, PR merged"

This design does not change Switchyard's product runtime behavior.
It changes the repo-local workflow and documentation contract used by Codex and the operator while building Switchyard.

## Summary

Switchyard should stop using a session-centric development loop that depends on the operator repeatedly naming the next tiny task.

The repo should instead adopt a milestone-autopilot workflow:
- one active milestone bundle at a time
- one controller campaign that may span multiple sessions
- many internal chunks executed without operator re-triage
- subagent implementation and review inside each chunk
- one milestone gate based on `npm run check` plus one milestone-specific smoke/demo proof recorded in docs
- one PR opened and merged automatically after the milestone gate passes

The workflow should resume from repo state files, not from chat memory.

## Problem

The current repo workflow is still optimized for short manual loops:
- start a session
- pick the next small task
- implement it
- open a PR
- start another session to review or continue

That pattern is too expensive for a project whose milestones already span many coherent slices.

The cost is not just typing. It also creates:
- planning churn between sessions
- repeated context rebuild
- delayed feedback because review is pushed into a later session
- unnecessary operator involvement in choosing the next tiny slice after the milestone direction is already clear

Switchyard's docs already think in milestone bundles, active rollout phases, and durable repo state.
The repo workflow should match that reality.

## Goals

- Make the active milestone bundle the default unit of autonomous execution
- Allow implementation to continue across multiple sessions without operator handholding
- Require honest subagent review before work advances to the next chunk or final PR
- Keep PRs in the workflow, but merge automatically only after the milestone gate passes
- Use repo-local docs as durable controller memory so a fresh session can resume correctly
- Preserve explicit stop points for real ambiguity, scope drift, or failed verification

## Non-Goals

- No change to Switchyard's product merge policy for bounded swarm runs
- No change to the current active product milestone or rollout order
- No claim that every project should merge directly without PRs
- No hidden automation that bypasses verification or review
- No replacement of milestone docs with a separate workflow database

## Recommended Approach

Adopt milestone autopilot as the default repo workflow for building Switchyard.

The controller should treat an approved milestone bundle as the unit it owns to completion.
It may split that milestone into internal chunks, but those chunks are execution details rather than new planning checkpoints for the operator.

The default controller behavior should be:
1. read repo state
2. identify the active milestone bundle and the next unfinished chunk
3. execute that chunk with required subagent review
4. update durable state docs
5. continue to the next unfinished chunk without asking for the next tiny task
6. stop only if a defined blocker occurs
7. once the milestone is usable, run the milestone gate
8. open the PR
9. merge automatically after the gate passes

This is the smallest honest shift because Switchyard already has:
- milestone-oriented planning docs
- current-state and next-step docs
- a slice ledger
- explicit scope guardrails

The repo does not need a new planning system.
It needs the existing planning system to become executable across sessions.

## Workflow Contract

### Migration and authority

This design changes Switchyard's repo-development workflow, not the product runtime contract.

Until implemented, older repo workflow guidance may still exist in `PLAN.md` or other docs.
The intended migration rule is:
- `PLAN.md` and adopted decision docs continue to govern product direction and product policies
- `AGENTS.md` and `docs/dev-workflow.md` become the authoritative repo-workflow docs once this milestone lands
- product `manual-ready` policy for bounded swarm runs does not constrain repo-development PR auto-merge for Switchyard itself

The implementation of this workflow should update repo docs in the same milestone so fresh sessions do not inherit contradictory repo-workflow guidance.

### Unit of autonomy

The default unit of autonomy should be:
- one active milestone bundle

It should not be:
- one tiny slice
- one single chat session
- one isolated PR unrelated to milestone completion

That means a session should not stop merely because:
- one chunk is complete
- one PR is open
- the controller wants the operator to pick the next small task

### Campaign model

Each active milestone should run as one controller campaign that may span many sessions.

The campaign should have:
- one milestone goal
- one evolving internal chunk list
- one durable campaign history in docs
- one milestone branch until the final PR is opened
- one finish line: milestone usable and merged

Within the campaign, the controller may decide:
- whether one or several review-sized internal checkpoints are useful while the milestone is underway
- whether adjacent chunks should be batched
- whether internal refactors are justified by milestone delivery

But the controller should not ask the operator to re-authorize each chunk when the milestone intent is already clear.

Until the milestone gate passes, intermediate checkpoints should remain campaign-local rather than independently merged.
The workflow should optimize for one final milestone PR that represents the usable milestone outcome.

### Chunk boundary

A chunk should be the smallest independently reviewable and verifiable subset of the active milestone.

Each chunk should have:
- one clear objective
- one bounded file or behavior scope
- one explicit verification path
- one done artifact recorded in the slice ledger

Acceptable done artifacts include:
- a merged-ready code or docs diff plus verification evidence
- an updated repo-state or workflow artifact required by the milestone

A chunk is too large if:
- it spans multiple unrelated workflow steps
- it cannot be reviewed coherently in one pass
- it lacks one verification path that can be rerun after fixes

A chunk is too small if:
- finishing it does not produce a meaningful state change the ledger can record
- it exists only because the controller wants another operator checkpoint

### Default finish line

The default finish line for the campaign should be:
- the milestone is completed enough that the operator can start using the feature
- the milestone verification gate passes
- the PR is opened
- the PR is merged automatically
- repo state docs are updated to show the new reality and next milestone

This is intentionally stronger than "implemented locally" and stronger than "PR opened."

## Required Quality Gates

### Per-chunk subagent loop

Each implementation chunk should require three distinct roles:
- one implementer
- one spec-compliance reviewer
- one code-quality reviewer

The implementer owns the code changes for the chunk.

The spec-compliance reviewer checks:
- whether the chunk matches the current milestone intent
- whether any required behavior or docs updates are missing
- whether the chunk added unrequested scope

The code-quality reviewer checks:
- behavioral regressions
- weak or missing tests
- unclear interfaces or boundaries
- unnecessary complexity

The controller should fix material findings before moving to the next chunk.

Required reviewer interfaces:

Implementer input:
- current milestone intent
- chunk objective and done condition
- relevant file paths or modules
- chunk-specific verification to run
- scope constraints

Implementer output:
- status: `DONE`, `DONE_WITH_CONCERNS`, `NEEDS_CONTEXT`, or `BLOCKED`
- change summary
- files touched
- chunk verification result
- open concerns if any

Spec reviewer input:
- current milestone intent
- chunk objective and done condition
- changed files or diff summary
- relevant tests and docs touched by the chunk

Spec reviewer output:
- status: `APPROVED` or `ISSUES_FOUND`
- blocking issues with rationale
- optional advisory recommendations

Code-quality reviewer input:
- changed files or diff summary
- chunk verification result
- relevant tests and docs touched by the chunk

Code-quality reviewer output:
- status: `APPROVED` or `ISSUES_FOUND`
- issues ordered by severity
- optional advisory recommendations

The chunk counts as complete only when:
- implementer status is `DONE` or `DONE_WITH_CONCERNS`
- spec reviewer status is `APPROVED`
- code-quality reviewer status is `APPROVED`
- chunk verification has been rerun after material fixes

### Final milestone review

Before opening the final PR, the controller should run a fresh whole-milestone review with a reviewer subagent that did not implement any chunk in the campaign.

That review should focus on:
- milestone completeness
- coherence across chunks
- test and doc sufficiency
- leftover scope drift or integration risk

### Verification gate

Automatic merge should require both of these:
- `npm run check`
- one milestone-specific smoke/demo proof recorded in docs

The smoke/demo proof should be concrete enough to show that the newly completed milestone is usable, not just typechecked.

Minimum required proof shape:
- one named scenario tied to the milestone outcome
- exact commands or operator steps run
- the observed result or output summary
- the artifact or doc location where the proof was recorded
- the date of the proof run

Canonical proof location:
- one dedicated proof file under `docs/proofs/YYYY-MM-DD-<milestone-slug>-smoke-proof.md`

Canonical proof structure:
- `# <Milestone Name> Smoke Proof`
- `## Scenario`
- `## Preconditions`
- `## Commands`
- `## Observed Result`
- `## Outcome`
- `## Date`

The controller should treat the gate as insufficient if any of those proof fields are missing.
Sufficiency is not subjective once the template is defined: the controller should only merge when the required proof fields and `npm run check` evidence both exist.

The slice ledger should record the proof file path for each milestone completion.

The proof location should be recorded in the campaign log so future sessions can audit it.

If a milestone cannot produce a practical smoke proof, that should be treated as a stop condition for the workflow design rather than waived silently.
The controller should not invent a weaker gate for that milestone without an explicit repo-doc change.

The smoke-proof gate is universal for milestone-autopilot work.
For documentation-heavy or workflow-only milestones, the proof should still take the canonical proof-file form, but the scenario may be a repo-workflow walkthrough rather than a product runtime walkthrough.

For that case, the proof should record:
- the exact docs or workflow entrypoints used
- the operator/controller path exercised
- the observed decision or outcome
- why that walkthrough is the practical usage proof for the milestone

### PR and merge behavior

The repo workflow should keep PRs as the merge vehicle.

This workflow governs how Codex develops the Switchyard repository itself.
It does not change Switchyard's product runtime policy for swarm runs.

That means:
- Switchyard the product may still keep `manual-ready` as the adopted merge policy for bounded swarm execution
- Codex the repo-development controller may still open and merge a GitHub PR automatically after the repo-development milestone gate passes

Those are different layers:
- product policy answers how `sy` should handle operator-visible run completion
- repo workflow answers how development work in the Switchyard repository should be landed

No product-policy flip is required for the repo-development workflow to auto-merge its own milestone PR once verification passes.

The intended auto-merge mechanism for repo-development milestones should be:
- push the milestone branch
- create or update a GitHub PR
- merge the PR through GitHub after the milestone gate passes

This workflow should not use the product's `sy merge` path for repo-development milestone landing.
It should not perform an unreviewable local merge to bypass GitHub state.

Branch and PR lifecycle:
- one active milestone branch per milestone campaign
- zero or one active PR for that branch at a time
- if early visibility is useful, open one draft PR from the milestone branch
- if a draft PR already exists, keep updating that same PR rather than opening parallel PRs
- when the milestone gate passes, promote the same PR to the landing PR
- after merge, the PR becomes the durable landing record and the branch may be deleted

After the milestone gate passes, the default controller path should be:
1. push the branch
2. open the PR
3. update durable repo-state docs on the milestone branch so the PR already contains the truthful post-milestone state
4. include milestone summary, verification evidence, and smoke/demo proof reference
5. merge automatically
6. advance next-milestone docs only if that state was already prepared and verified in the same landing PR

This is different from the product's `manual-ready` swarm policy.
It is a repo-development workflow for building Switchyard itself.

Before the gate passes, the controller may open draft or checkpoint PRs if needed for visibility, but they should not count as milestone completion and should not be auto-merged unless they already satisfy the full milestone gate.

If `npm run check` fails or the smoke/demo proof is missing or weak, the controller should treat that as a failed milestone gate rather than a mergeable partial success.
The controller should:
1. fix the issue if the path is clear and local
2. rerun the gate
3. stop and ask the operator only if the failure appears to require a product or scope decision

If the PR cannot be merged after the gate passes because of merge conflicts, remote rejection, or branch-protection requirements, the controller should:
1. treat the milestone as not yet landed
2. fix the merge blocker on the milestone branch if the resolution path is clear
3. rerun the milestone gate after any conflict-resolution change
4. retry the GitHub merge
5. stop and ask the operator only if the blocker is not safely resolvable within the current milestone scope

If the merge is blocked by GitHub auth failure, API failure, network outage, or stale branch state, the controller should:
1. record the landing failure in the slice ledger
2. retry when the failure appears transient and no code changes are required
3. refresh the milestone branch and rerun the gate if stale-branch reconciliation changed code
4. stop and ask the operator only when the landing path cannot be completed safely from the current session

The canonical rule is:
- milestone-completion state docs must land in the same PR as the milestone work
- a fresh session should trust merged repo docs over unmerged chat state
- no post-merge catch-up edit should be required to make the repo truthful about the completed milestone

## Durable Repo Memory

The controller should treat a small set of docs as durable memory that survives session loss.

For this workflow, the controller owns keeping these files mutually consistent whenever milestone state changes materially.
If the files disagree, the controller should resolve the disagreement before continuing implementation.

### `docs/current-state.md`

This file should remain the truth source for:
- the active milestone
- what is materially real already
- what gap still blocks milestone completion

It should be updated whenever milestone reality changes materially.

Minimum required content:
- active milestone name
- active milestone id
- active bundle id
- implemented milestone progress summary
- current blocking gap to milestone completion
- recommended next bundle

### `docs/next-steps.md`

This file should act as the controller's near-term execution guide.

It should state:
- the current milestone bundle
- the next unfinished chunk
- the current milestone gate and what still blocks it

Minimum required content:
- current milestone name
- active milestone id
- active bundle name
- active bundle id
- active chunk id
- next unfinished chunk
- milestone-gate checklist status

### `docs/focus-tracker.md`

This file should remain the scope guardrail for the active campaign.

It should make it easy for a fresh session to reject drift into:
- dashboards
- broader runtime expansion
- speculative automation
- policy flips not yet adopted

Minimum required content:
- current target statement
- current in-scope categories
- current out-of-scope categories
- explicit session gate questions or scope checks

### `docs/slice-ledger.md`

This file should act as the durable campaign log.

Each completed chunk should append:
- what landed
- which reviews ran
- what verification passed
- where smoke/demo proof lives
- PR reference
- merge result

The slice ledger is the key file that lets a new session continue the campaign without reconstructing work from git history alone.

Minimum required entry content:
- date
- milestone and chunk name
- milestone id
- bundle id
- chunk id
- implementation summary
- review summary
- verification summary
- PR state
- merge state

## Session Resume Rules

At the start of a new Switchyard development session, the controller should:
1. read `AGENTS.md`
2. read `PLAN.md`
3. read the relevant adopted decision docs for the active milestone when behavior or policy is involved
4. read `docs/current-state.md`
5. read `docs/next-steps.md`
6. read `docs/backlog.md`
7. read `docs/focus-tracker.md`
8. inspect the latest `docs/slice-ledger.md` entries if the milestone is already in progress

After that, the controller should resume the next unfinished chunk automatically.

The controller should not ask "what should I work on next?" if:
- the active milestone is already clear
- the next chunk can be derived from repo state
- no real ambiguity blocks execution

If one of the required docs is missing, stale, or contradictory, the controller should use this order:
1. stop implementation work
2. reconcile repo docs first
3. record the reconciliation in the slice ledger if it changes milestone meaning
4. resume implementation only after the durable state is coherent again

For conflict resolution, the intended precedence should be:
1. `PLAN.md` and adopted decision docs for product direction
2. `docs/current-state.md` for implemented reality
3. `docs/next-steps.md` for the active bundle and next chunk
4. `docs/focus-tracker.md` for scope control
5. `docs/backlog.md` as advisory ordering only when it does not conflict with the active milestone and next-steps files
6. `docs/slice-ledger.md` for campaign history and verification evidence

If precedence does not resolve the conflict cleanly, that is a valid stop condition.

`docs/backlog.md` should not override an already active milestone campaign.
Its role is to help choose the next milestone or next bundle when `docs/next-steps.md` is intentionally advanced, not to replace the current controller plan mid-campaign.

An approved milestone bundle should mean one of these:
- `docs/next-steps.md` explicitly names it as the active bundle and that state is consistent with `docs/current-state.md`
- or the operator explicitly approves a new bundle and the repo docs are updated before execution starts

If neither is true, the controller should stop before implementation and reconcile planning docs first.

To derive the next unfinished chunk deterministically, the controller should use:
- `docs/next-steps.md` for the current `active bundle id` and `active chunk id`
- `docs/slice-ledger.md` to confirm whether that `chunk id` is already complete
- `docs/current-state.md` to confirm the bundle still belongs to the active milestone

If those identifiers do not line up, the controller should stop and reconcile docs before continuing.

## Stop Conditions

The workflow should define a short explicit list of valid reasons to stop and ask the operator for input.

Valid stop conditions:
- a real product ambiguity changes expected behavior
- repo docs conflict in a way that changes milestone intent
- required verification fails repeatedly without a safe local fix
- continuing would cross an explicit scope boundary in repo docs

Invalid reasons to stop:
- one chunk is done
- the controller wants confirmation for the next tiny task
- a PR exists but the milestone is not yet usable
- the controller wants a second session to review its own work

## Documentation Changes

### `AGENTS.md`

This file should define milestone autopilot as the default repo workflow for building Switchyard itself.

It should state:
- the unit of autonomy is the active milestone bundle
- subagent review is required for each chunk
- the default finish line is "milestone usable, PR opened, verification green, PR merged"
- the controller should resume from repo docs rather than asking for the next tiny task
- the valid stop conditions are limited and explicit

### `docs/dev-workflow.md`

This file should shift from session-oriented guidance to campaign-oriented guidance.

It should explain:
- how a fresh session resumes the active campaign
- how chunks are executed inside a milestone
- how subagent review fits into the default loop
- how the milestone verification gate works
- how PR opening and auto-merge happen after proof and verification

### `docs/current-state.md`, `docs/next-steps.md`, `docs/focus-tracker.md`

These files already exist and should remain authoritative.

This workflow change should tighten their role so they can serve as controller memory rather than only human-readable notes.

### `docs/slice-ledger.md`

This file should become the durable implementation ledger for campaign progress.

It should be updated at chunk completion and milestone completion, not only occasionally.

### Migration list

The implementation should also review and reconcile other repo docs that can carry conflicting workflow guidance.

Docs that should be updated in the same rollout if they mention repo workflow behavior:
- `AGENTS.md`
- `docs/dev-workflow.md`
- `docs/current-state.md`
- `docs/next-steps.md`
- `docs/focus-tracker.md`
- `docs/slice-ledger.md`
- `docs/roadmap.md`
- `docs/merge-workflow.md`

Docs that should be checked and either updated or explicitly left unchanged with rationale:
- `README.md`
- `CONTRIBUTING.md`
- `PLAN.md`

The goal is that no merged repo doc should continue telling future sessions to use the old handholding-heavy loop once this workflow milestone lands.

## Implementation Phasing

This design describes one coherent repo workflow, but it should not be implemented as one undifferentiated change set.

The implementation plan should split it into phases such as:
- Phase 1: repo-state doc contract and session-resume rules
  Deliverables:
  - explicit ids and state fields in the durable repo-memory docs
  - deterministic resume and reconciliation rules
  - conflicting repo docs identified
- Phase 2: per-chunk subagent review protocol and ledger updates
  Deliverables:
  - explicit implementer/spec-review/code-quality-review contracts
  - ledger entries that capture chunk completion and review state
  - docs updated to require the review loop
- Phase 3: smoke-proof artifact convention and milestone gate wiring
  Deliverables:
  - canonical `docs/proofs/...` artifact format
  - milestone-gate checklist fields in repo docs
  - docs-only/workflow-only proof path defined without weakening the gate
- Phase 4: GitHub PR lifecycle and auto-merge behavior
  Deliverables:
  - one-branch/one-PR lifecycle rules
  - landing-failure handling
  - migration of remaining repo workflow docs that still conflict

Those phases may land as separate chunks or separate PRs, but they should still compose toward the same milestone-autopilot workflow.
The planning step should choose the smallest coherent sequence that keeps the repo usable after each landing.

Dependencies:
- Phase 1 must land before any automated resume behavior is trusted
- Phase 2 depends on the chunk identity introduced in Phase 1
- Phase 3 depends on Phase 1 and Phase 2 because the gate must be attached to known chunks and milestone state
- Phase 4 depends on the milestone gate from Phase 3 and the repo-doc migration work from earlier phases

## Risks

- If the docs say "milestone autopilot" but do not define stop conditions, the controller may still fall back to handholding
- If subagent review is described as optional, review will drift back to a later manual session
- If the smoke/demo proof is not required, the controller may merge work that passes checks but is not actually usable
- If the slice ledger is too vague, new sessions will still ask for context
- If the workflow is described as "auto-merge everything," it may be confused with the product's separate `manual-ready` policy

## Acceptance

This design is complete when the repo docs establish all of these:
- Switchyard's repo workflow uses milestone autopilot by default
- the active milestone bundle is the unit of autonomous execution
- fresh sessions resume from repo docs instead of operator re-triage
- subagent implementation and review are required during chunk execution
- the milestone gate requires `npm run check` plus a recorded smoke/demo proof
- the default repo-development path is PR open then automatic merge after the gate passes
- the valid stop conditions are explicit and narrow
- the workflow is clearly separated from the product's `manual-ready` bounded-swarm merge policy
