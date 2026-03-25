# Repo Workflow Milestone Proof Gate Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the minimal repo-local milestone proof gate so repo-workflow closeout cannot hand off to the next chunk without recorded proof tied to the current verified commit.

**Architecture:** Extend the existing repo-workflow chunk and attempt schemas with proof-gate fields, encode the new contract in RED validator tests first, then implement validator/type changes and migrate the canonical YAML control plane from the current `c-005 -> null` placeholder into the explicit `c-005 -> c-006 -> c-007 -> null` proof-gate chain. Keep proof repo-local, validator-enforced, and limited to closeout handoff only; do not bundle PR lifecycle or auto-merge behavior into this slice.

**Tech Stack:** TypeScript, Node.js, `yaml`, markdown docs, git CLI, npm scripts, existing Switchyard test harness

---

## Chunk 1: Encode The Proof-Gate Contract In Tests

### Task 1: Add RED validator coverage for proof-gate schema, snapshots, and immutability

**Files:**
- Modify: `src/repo-workflow/validator.test.ts`
- Modify: `src/repo-workflow/cli.test.ts`
- Verify: `docs/superpowers/specs/2026-03-25-repo-workflow-milestone-proof-gate-design.md`

- [ ] **Step 1: Update the happy-path repo-workflow fixture shape to include proof fields**

Add `proof_gate: not-required` to every non-closeout chunk in the validator and CLI test fixtures and add default proof fields to every non-proof-gated attempt:

```yaml
proof_gate: not-required
proof_status: not-required
proof_summary: ""
proof_verification_command: null
proof_commands: []
proof_head_commit: null
proof_recorded_at: null
```

- [ ] **Step 2: Add a failing test for the canonical migration chain**

Create a validator fixture assertion that the proof-gate slice manifest rewrites to:

```yaml
c-005 -> c-006 -> c-007 -> null
```

and that:
- `c-005` is the implementation chunk with `proof_gate: not-required`
- `c-006` is the proof-gated closeout chunk
- `c-007` is the later broad follow-up placeholder

- [ ] **Step 3: Add a failing test for a closeout attempt completed without proof**

Assert validation fails when a `proof_gate: required` chunk has an attempt row like:

```yaml
state: complete
proof_status: pending
proof_summary: ""
proof_verification_command: null
proof_commands: []
```

Expected failure:

```ts
assert.equal(result.ok, false);
assert.equal(result.code, "invalid_state");
assert.match(result.message, /complete without recorded milestone proof/i);
```

- [ ] **Step 4: Add a failing test for proof recorded without passed verification**

Use a proof-gated attempt with:

```yaml
proof_status: recorded
verification_result: not-run
```

Expected failure:

```ts
assert.match(result.message, /verification_result is 'passed'/i);
```

- [ ] **Step 5: Add a failing test for proof/verification commit mismatch**

Use a recorded proof row where:

```yaml
verification_result: passed
verification_head_commit: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
proof_head_commit: bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
```

Expected failure:

```ts
assert.match(result.message, /verification_head_commit.*proof_head_commit/i);
```

- [ ] **Step 6: Add a failing test for proof command snapshot mismatch on the active closeout attempt**

Cover:
- `proof_verification_command` missing
- `proof_verification_command` not matching the chunk `verification_command`
- `proof_commands` not containing `proof_verification_command`

Expected failures should assert on clear operator-facing messages.

- [ ] **Step 7: Add a failing test for proof-gate immutability**

Create a historical proof-gated attempt with:

```yaml
proof_status: recorded
proof_verification_command: npm run check
```

and then rewrite the current chunk row to:

```yaml
proof_gate: not-required
```

Expected failure:

```ts
assert.match(result.message, /cannot be rewritten to proof_gate: not-required/i);
```

- [ ] **Step 8: Add a failing test for active-HEAD reset behavior**

Create an active proof-gated closeout attempt with recorded proof, then advance `HEAD` and assert the validator rejects the stale proof snapshot unless the proof fields were reset to:

```yaml
proof_status: pending
proof_summary: ""
proof_verification_command: null
proof_commands: []
proof_head_commit: null
proof_recorded_at: null
```

- [ ] **Step 9: Add a passing test for historical proof on an older commit**

Assert a non-active historical proof-gated attempt remains valid when:
- `proof_head_commit` does not equal the current checked-out `HEAD`
- proof fields are internally consistent
- `proof_verification_command` matches the historical proof snapshot

- [ ] **Step 10: Run the targeted validator tests to verify RED**

Run: `node --import tsx --test src/repo-workflow/validator.test.ts src/repo-workflow/cli.test.ts`

Expected: FAIL on the new proof-gate tests before validator code changes land.

- [ ] **Step 11: Commit the RED test checkpoint**

```bash
git add src/repo-workflow/validator.test.ts src/repo-workflow/cli.test.ts
git commit -m "test: add repo workflow proof gate coverage"
```

## Chunk 2: Implement Proof-Gate Parsing And Validation

### Task 2: Extend repo-workflow types and validator logic for proof-gate enforcement

**Files:**
- Modify: `src/repo-workflow/types.ts`
- Modify: `src/repo-workflow/validator.ts`
- Test: `src/repo-workflow/validator.test.ts`
- Test: `src/repo-workflow/cli.test.ts`

- [ ] **Step 1: Extend chunk and attempt types with proof-gate fields**

Add the minimal new fields to the canonical types:

```ts
type ProofGate = "not-required" | "required";
type ProofStatus = "not-required" | "pending" | "recorded";

proofGate: ProofGate;
proofStatus: ProofStatus;
proofSummary: string;
proofVerificationCommand: string | null;
proofCommands: string[];
proofHeadCommit: string | null;
proofRecordedAt: string | null;
```

- [ ] **Step 2: Parse `proof_gate` on every chunk row**

In `src/repo-workflow/validator.ts`, extend chunk parsing so every chunk row requires:

```ts
proof_gate: "not-required" | "required"
```

and reject missing or illegal values with `invalid_yaml`.

- [ ] **Step 3: Parse the proof fields on every attempt row**

Require the new attempt fields on every row and enforce the schema-level defaults for non-proof-gated history:

```ts
proof_status: "not-required"
proof_summary: ""
proof_verification_command: null
proof_commands: []
proof_head_commit: null
proof_recorded_at: null
```

- [ ] **Step 4: Implement whole-document proof-gate immutability checks**

Add validator logic that scans all attempts and enforces:
- if any attempt for `chunk_id` has `proof_status: pending` or `proof_status: recorded`, that chunk must still have `proof_gate: required`
- rewriting that chunk to `proof_gate: not-required` fails with `invalid_state`

- [ ] **Step 5: Implement non-proof-gated attempt validation**

For chunks with `proof_gate: not-required`, require:

```ts
proofStatus === "not-required"
proofSummary === ""
proofVerificationCommand === null
proofCommands.length === 0
proofHeadCommit === null
proofRecordedAt === null
```

- [ ] **Step 6: Implement proof-gated closeout validation**

For chunks with `proof_gate: required`, enforce:
- `proof_status` may be `pending` while the attempt is incomplete
- `proof_status` must be `recorded` before `state: complete`
- `proof_verification_command` must be present when recorded
- `proof_commands` must include `proof_verification_command`
- `verification_result` must be `passed`
- `verification_head_commit === proof_head_commit`

- [ ] **Step 7: Implement active-attempt current-HEAD checks for proof**

When the proof-gated attempt is the active attempt, enforce:

```ts
proofHeadCommit === currentHeadCommit
proofVerificationCommand === activeChunk.verificationCommand
```

but keep historical proof-gated attempts valid against their recorded snapshot instead of current `HEAD`.

- [ ] **Step 8: Implement operator-facing failure messages**

Return compact failures such as:
- `closeout attempt 'a-006' is complete without recorded milestone proof`
- `proof_verification_command for active attempt 'a-006' does not match the chunk verification_command`
- `chunk 'c-006' cannot be rewritten to proof_gate: not-required because canonical attempt history already recorded milestone proof for that chunk`

- [ ] **Step 9: Run the targeted validator tests to verify GREEN**

Run: `node --import tsx --test src/repo-workflow/validator.test.ts src/repo-workflow/cli.test.ts`

Expected: PASS with the new proof-gate coverage included.

- [ ] **Step 10: Commit the validator implementation**

```bash
git add src/repo-workflow/types.ts src/repo-workflow/validator.ts src/repo-workflow/validator.test.ts src/repo-workflow/cli.test.ts
git commit -m "feat: enforce repo workflow milestone proof gate"
```

## Chunk 3: Migrate Canonical Repo-Workflow State And Planning Docs

### Task 3: Rewrite the canonical repo-workflow YAML to the explicit proof-gate chain

**Files:**
- Modify: `docs/repo-workflow/campaign.yaml`
- Modify: `docs/repo-workflow/chunks.yaml`
- Modify: `docs/repo-workflow/attempts.yaml`
- Verify: `docs/superpowers/specs/2026-03-25-repo-workflow-milestone-proof-gate-design.md`

- [ ] **Step 1: Rewrite `c-005` as the implementation chunk**

Update the live manifest row to:

```yaml
- chunk_id: c-005
  next_chunk_id: c-006
  objective: implement-milestone-proof-gate
  scope: repo-workflow-proof-gate
  done_condition: proof-gate-schema-validator-and-tests-landed
  verification_command: node --import tsx --test src/repo-workflow/validator.test.ts src/repo-workflow/cli.test.ts
  proof_gate: not-required
  owner_role: controller
```

- [ ] **Step 2: Add `c-006` as the non-terminal proof-gated closeout chunk**

Insert:

```yaml
- chunk_id: c-006
  next_chunk_id: c-007
  objective: verify-proof-gate-closeout
  scope: repo-workflow-proof-gate-closeout
  done_condition: milestone-proof-recorded-and-next-task-may-begin
  verification_command: npm run check
  proof_gate: required
  owner_role: controller
```

- [ ] **Step 3: Move the broad later follow-up placeholder to `c-007`**

Rewrite the old broad placeholder row to:

```yaml
- chunk_id: c-007
  next_chunk_id: null
  objective: add-pr-lifecycle-and-auto-merge-policy
  scope: repo-workflow-next-slice
  done_condition: next-repo-workflow-slice-is-specified-and-ready
  verification_command: npm run check
  proof_gate: not-required
  owner_role: controller
```

- [ ] **Step 4: Backfill `proof_gate: not-required` onto historical chunk rows**

Update `c-001` through `c-004` so every existing chunk row carries the new field explicitly.

- [ ] **Step 5: Keep the current campaign active on `c-005`**

Update `docs/repo-workflow/campaign.yaml` only as needed to keep:

```yaml
campaign_state: active
active_chunk_id: c-005
active_attempt_id: a-005
```

and refresh `last_updated`.

- [ ] **Step 6: Backfill proof defaults onto historical attempts and `a-005`**

Add to `a-001` through `a-005`:

```yaml
proof_status: not-required
proof_summary: ""
proof_verification_command: null
proof_commands: []
proof_head_commit: null
proof_recorded_at: null
```

Do not create `a-006` yet; that row should exist only when `c-006` becomes active.

- [ ] **Step 7: Validate the migrated canonical state with targeted tests**

Run: `node --import tsx --test src/repo-workflow/validator.test.ts src/repo-workflow/cli.test.ts`

Expected: PASS with the migrated YAML shape represented in fixtures and live docs.

- [ ] **Step 8: Commit the canonical-state migration**

```bash
git add docs/repo-workflow/campaign.yaml docs/repo-workflow/chunks.yaml docs/repo-workflow/attempts.yaml
git commit -m "docs: migrate repo workflow to proof gate chain"
```

### Task 4: Update human-facing planning docs to reflect the narrowed next slice

**Files:**
- Modify: `docs/current-state.md`
- Modify: `docs/next-steps.md`
- Modify: `docs/focus-tracker.md`
- Modify: `docs/session-handoffs/2026-03-24-repo-workflow-handoff.md`

- [ ] **Step 1: Update `docs/current-state.md`**

Replace the broad “proof gate, PR lifecycle, auto-merge” wording with the narrower truth:
- proof gate is the active next repo-workflow slice
- PR lifecycle and explicit auto-merge policy remain later follow-up work

- [ ] **Step 2: Update `docs/next-steps.md`**

Make the repo-workflow next step explicit:
- implement the proof-gate slice first
- keep PR lifecycle and auto-merge deferred to the later follow-up placeholder

- [ ] **Step 3: Update `docs/focus-tracker.md`**

Keep the focus tracker aligned with the narrowed proof-gate-first sequencing and the unchanged product `manual-ready` boundary.

- [ ] **Step 4: Refresh the historical handoff to mention the proof-gate narrowing**

Add one short note to the historical handoff that the former broad `c-005` follow-up has been narrowed in canonical state to a proof-gate-first chain.

- [ ] **Step 5: Commit the planning-doc reconciliation**

```bash
git add docs/current-state.md docs/next-steps.md docs/focus-tracker.md docs/session-handoffs/2026-03-24-repo-workflow-handoff.md
git commit -m "docs: narrow repo workflow follow-up to proof gate"
```

## Chunk 4: Full Verification And Closeout

### Task 5: Verify the proof-gate slice end to end

**Files:**
- Verify: `src/repo-workflow/validator.test.ts`
- Verify: `docs/repo-workflow/campaign.yaml`
- Verify: `docs/repo-workflow/chunks.yaml`
- Verify: `docs/repo-workflow/attempts.yaml`
- Verify: `docs/current-state.md`
- Verify: `docs/next-steps.md`
- Verify: `docs/focus-tracker.md`

- [ ] **Step 1: Run targeted proof-gate validation coverage**

Run: `node --import tsx --test src/repo-workflow/validator.test.ts src/repo-workflow/cli.test.ts`

Expected: PASS.

- [ ] **Step 2: Run the full repo check suite**

Run: `npm run check`

Expected: PASS.

- [ ] **Step 3: Run repo-workflow validation from a clean checkpoint**

Do not run this from the current dirty working tree if `.switchyard/` is still untracked locally.
Use one of:
- a temporary clean worktree
- a temporary clean checkout
- or a commit-only checkpoint with the canonical `branch_ref` checked out

Run: `npm run repo-workflow:validate`

Expected: PASS against the tracked repo state.

- [ ] **Step 4: Review the final diff boundaries**

Confirm:
- the only new behavior is the repo-local milestone proof gate
- proof is still repo-local and validator-enforced
- PR lifecycle and auto-merge remain out of scope
- product `manual-ready` policy did not change

- [ ] **Step 5: Commit the verified slice**

```bash
git add docs/repo-workflow/campaign.yaml docs/repo-workflow/chunks.yaml docs/repo-workflow/attempts.yaml \
  docs/current-state.md docs/next-steps.md docs/focus-tracker.md docs/session-handoffs/2026-03-24-repo-workflow-handoff.md \
  docs/superpowers/specs/2026-03-25-repo-workflow-milestone-proof-gate-design.md \
  docs/superpowers/plans/2026-03-25-repo-workflow-milestone-proof-gate.md \
  src/repo-workflow/types.ts src/repo-workflow/validator.ts src/repo-workflow/validator.test.ts
git commit -m "feat: add repo workflow milestone proof gate"
```
