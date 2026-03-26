import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { parse, stringify } from "yaml";
import { createTempGitRepo, git, removeTempDir } from "../test-helpers/git.js";
import { validateRepoWorkflow } from "./validator.js";

const CAMPAIGN_ID = "rw-001";
const BUNDLE_ID = "repo-workflow-foundation";
const ACTIVE_CHUNK_ID = "c-005";
const ACTIVE_ATTEMPT_ID = "a-005";
const CLOSEOUT_CHUNK_ID = "c-006";
const FOLLOW_UP_CHUNK_ID = "c-007";
const CLOSEOUT_ATTEMPT_ID = "a-006";
const FOLLOW_UP_ATTEMPT_ID = "a-007";
const PRODUCT_MILESTONE_ID = "m7";
const STARTUP_MARKER = "repo-workflow-startup: repo-workflow-v1";

test("validateRepoWorkflow accepts a clean repo with matching startup docs, canonical YAML, projections, milestone registry, and proof-gate chain", async () => {
  const repoDir = await createValidRepoWorkflowRepo();

  try {
    const chunksPath = join(repoDir, "docs", "repo-workflow", "chunks.yaml");
    const chunkManifest = parse(await readFile(chunksPath, "utf8")) as {
      repo_workflow_chunks: { chunks: Array<Record<string, unknown>> };
    };
    assert.deepEqual(
      chunkManifest.repo_workflow_chunks.chunks.map((chunk) => ({
        chunk_id: chunk.chunk_id,
        next_chunk_id: chunk.next_chunk_id,
        objective: chunk.objective,
        proof_gate: chunk.proof_gate
      })),
      [
        {
          chunk_id: ACTIVE_CHUNK_ID,
          next_chunk_id: CLOSEOUT_CHUNK_ID,
          objective: "implement-milestone-proof-gate",
          proof_gate: "not-required"
        },
        {
          chunk_id: CLOSEOUT_CHUNK_ID,
          next_chunk_id: FOLLOW_UP_CHUNK_ID,
          objective: "verify-proof-gate-closeout",
          proof_gate: "required"
        },
        {
          chunk_id: FOLLOW_UP_CHUNK_ID,
          next_chunk_id: null,
          objective: "add-pr-lifecycle-and-auto-merge-policy",
          proof_gate: "not-required"
        }
      ]
    );

    const result = await validateRepoWorkflow(repoDir);

    if (!result.ok) {
      assert.fail(`expected validation success, got ${result.code}: ${result.message}`);
    }

    assert.equal(result.ok, true);
    assert.equal(result.campaign.campaignId, CAMPAIGN_ID);
    assert.equal(result.campaign.activeChunkId, ACTIVE_CHUNK_ID);
    const { activeAttempt } = result;
    if (activeAttempt === null) {
      assert.fail("expected an active attempt for an active campaign fixture");
    }
    assert.equal(activeAttempt.attemptId, ACTIVE_ATTEMPT_ID);
  } finally {
    await removeTempDir(repoDir);
  }
});

test("validateRepoWorkflow fails when a proof-gated closeout attempt completes without recorded milestone proof", async () => {
  const repoDir = await createValidRepoWorkflowRepo();

  try {
    const currentHead = await git(repoDir, ["rev-parse", "HEAD"]);
    await switchActiveChunk(repoDir, CLOSEOUT_CHUNK_ID, CLOSEOUT_ATTEMPT_ID);

    const attemptsPath = join(repoDir, "docs", "repo-workflow", "attempts.yaml");
    const attempts = parse(await readFile(attemptsPath, "utf8")) as {
      repo_workflow_attempts: { attempts: Array<Record<string, unknown>> };
    };
    attempts.repo_workflow_attempts.attempts.push({
      attempt_id: CLOSEOUT_ATTEMPT_ID,
      chunk_id: CLOSEOUT_CHUNK_ID,
      attempt_number: 1,
      state: "complete",
      blocked_reason: "none",
      implementer_status: "done",
      spec_review_status: "approved",
      spec_reviewed_commit: currentHead,
      quality_review_status: "approved",
      quality_reviewed_commit: currentHead,
      verification_result: "passed",
      verification_head_commit: currentHead,
      verified_at: "2026-03-25T19:00:00.000Z",
      docs_reconciled: true,
      proof_status: "pending",
      proof_summary: "",
      proof_verification_command: null,
      proof_commands: [],
      proof_head_commit: null,
      proof_recorded_at: null,
      summary: "Closeout finished without proof.",
      notes: ""
    });
    await writeFile(attemptsPath, stringify(attempts), "utf8");
    await git(repoDir, ["add", "docs/repo-workflow/campaign.yaml", "docs/repo-workflow/attempts.yaml", "docs/current-state.md", "docs/next-steps.md"]);
    await git(repoDir, ["commit", "-m", "Add invalid proof-gated closeout completion"]);

    const result = await validateRepoWorkflow(repoDir);

    assert.equal(result.ok, false);
    assert.equal(result.code, "invalid_state");
    assert.match(result.message, /complete without recorded milestone proof/i);
  } finally {
    await removeTempDir(repoDir);
  }
});

test("validateRepoWorkflow fails when recorded proof does not have passed verification", async () => {
  const repoDir = await createValidRepoWorkflowRepo();

  try {
    const currentHead = await git(repoDir, ["rev-parse", "HEAD"]);
    await switchActiveChunk(repoDir, CLOSEOUT_CHUNK_ID, CLOSEOUT_ATTEMPT_ID);

    const attemptsPath = join(repoDir, "docs", "repo-workflow", "attempts.yaml");
    const attempts = parse(await readFile(attemptsPath, "utf8")) as {
      repo_workflow_attempts: { attempts: Array<Record<string, unknown>> };
    };
    attempts.repo_workflow_attempts.attempts.push({
      attempt_id: CLOSEOUT_ATTEMPT_ID,
      chunk_id: CLOSEOUT_CHUNK_ID,
      attempt_number: 1,
      state: "awaiting-verification",
      blocked_reason: "none",
      implementer_status: "done",
      spec_review_status: "approved",
      spec_reviewed_commit: currentHead,
      quality_review_status: "approved",
      quality_reviewed_commit: currentHead,
      verification_result: "not-run",
      verification_head_commit: null,
      verified_at: null,
      docs_reconciled: false,
      proof_status: "recorded",
      proof_summary: "Recorded milestone proof before verification completed.",
      proof_verification_command: "npm run check",
      proof_commands: ["npm run check"],
      proof_head_commit: currentHead,
      proof_recorded_at: "2026-03-25T19:05:00.000Z",
      summary: "Waiting for verification despite recorded proof.",
      notes: ""
    });
    await writeFile(attemptsPath, stringify(attempts), "utf8");
    await git(repoDir, ["add", "docs/repo-workflow/campaign.yaml", "docs/repo-workflow/attempts.yaml", "docs/current-state.md", "docs/next-steps.md"]);
    await git(repoDir, ["commit", "-m", "Add proof recorded without verification"]);

    const result = await validateRepoWorkflow(repoDir);

    assert.equal(result.ok, false);
    assert.equal(result.code, "invalid_state");
    assert.match(result.message, /verification_result is 'passed'/i);
  } finally {
    await removeTempDir(repoDir);
  }
});

test("validateRepoWorkflow fails when recorded proof omits proof_summary", async () => {
  const repoDir = await createValidRepoWorkflowRepo();

  try {
    const attemptsPath = join(repoDir, "docs", "repo-workflow", "attempts.yaml");
    const attempts = parse(await readFile(attemptsPath, "utf8")) as {
      repo_workflow_attempts: { attempts: Array<Record<string, unknown>> };
    };
    attempts.repo_workflow_attempts.attempts.push({
      attempt_id: CLOSEOUT_ATTEMPT_ID,
      chunk_id: CLOSEOUT_CHUNK_ID,
      attempt_number: 1,
      state: "complete",
      blocked_reason: "none",
      implementer_status: "done",
      spec_review_status: "approved",
      spec_reviewed_commit: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      quality_review_status: "approved",
      quality_reviewed_commit: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      verification_result: "passed",
      verification_head_commit: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      verified_at: "2026-03-25T19:00:00.000Z",
      docs_reconciled: true,
      proof_status: "recorded",
      proof_summary: "",
      proof_verification_command: "npm run check",
      proof_commands: ["npm run check"],
      proof_head_commit: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      proof_recorded_at: "2026-03-25T19:05:00.000Z",
      summary: "Historical proof is missing its summary.",
      notes: ""
    });
    await writeFile(attemptsPath, stringify(attempts), "utf8");
    await git(repoDir, ["add", "docs/repo-workflow/attempts.yaml"]);
    await git(repoDir, ["commit", "-m", "Add recorded proof without summary"]);

    const result = await validateRepoWorkflow(repoDir);

    assert.equal(result.ok, false);
    assert.equal(result.code, "invalid_state");
    assert.match(result.message, /proof_summary.*non-empty/i);
  } finally {
    await removeTempDir(repoDir);
  }
});

test("validateRepoWorkflow fails when recorded proof uses a different commit than verification", async () => {
  const repoDir = await createValidRepoWorkflowRepo();

  try {
    const attemptsPath = join(repoDir, "docs", "repo-workflow", "attempts.yaml");
    const attempts = parse(await readFile(attemptsPath, "utf8")) as {
      repo_workflow_attempts: { attempts: Array<Record<string, unknown>> };
    };
    attempts.repo_workflow_attempts.attempts.push({
      attempt_id: CLOSEOUT_ATTEMPT_ID,
      chunk_id: CLOSEOUT_CHUNK_ID,
      attempt_number: 1,
      state: "complete",
      blocked_reason: "none",
      implementer_status: "done",
      spec_review_status: "approved",
      spec_reviewed_commit: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      quality_review_status: "approved",
      quality_reviewed_commit: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      verification_result: "passed",
      verification_head_commit: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      verified_at: "2026-03-25T19:00:00.000Z",
      docs_reconciled: true,
      proof_status: "recorded",
      proof_summary: "Proof points at a different commit than verification.",
      proof_verification_command: "npm run check",
      proof_commands: ["npm run check"],
      proof_head_commit: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      proof_recorded_at: "2026-03-25T19:05:00.000Z",
      summary: "Historical proof snapshot uses mismatched commits.",
      notes: ""
    });
    await writeFile(attemptsPath, stringify(attempts), "utf8");
    await git(repoDir, ["add", "docs/repo-workflow/attempts.yaml"]);
    await git(repoDir, ["commit", "-m", "Add proof and verification commit mismatch"]);

    const result = await validateRepoWorkflow(repoDir);

    assert.equal(result.ok, false);
    assert.equal(result.code, "invalid_state");
    assert.match(result.message, /verification_head_commit.*proof_head_commit/i);
  } finally {
    await removeTempDir(repoDir);
  }
});

test("validateRepoWorkflow fails when recorded proof omits proof_verification_command", async () => {
  const repoDir = await createValidRepoWorkflowRepo();

  try {
    const currentHead = await git(repoDir, ["rev-parse", "HEAD"]);
    await switchActiveChunk(repoDir, CLOSEOUT_CHUNK_ID, CLOSEOUT_ATTEMPT_ID);

    const attemptsPath = join(repoDir, "docs", "repo-workflow", "attempts.yaml");
    const attempts = parse(await readFile(attemptsPath, "utf8")) as {
      repo_workflow_attempts: { attempts: Array<Record<string, unknown>> };
    };
    attempts.repo_workflow_attempts.attempts.push({
      attempt_id: CLOSEOUT_ATTEMPT_ID,
      chunk_id: CLOSEOUT_CHUNK_ID,
      attempt_number: 1,
      state: "complete",
      blocked_reason: "none",
      implementer_status: "done",
      spec_review_status: "approved",
      spec_reviewed_commit: currentHead,
      quality_review_status: "approved",
      quality_reviewed_commit: currentHead,
      verification_result: "passed",
      verification_head_commit: currentHead,
      verified_at: "2026-03-25T19:00:00.000Z",
      docs_reconciled: true,
      proof_status: "recorded",
      proof_summary: "Recorded proof omitted the verification command snapshot.",
      proof_verification_command: null,
      proof_commands: ["npm run check"],
      proof_head_commit: currentHead,
      proof_recorded_at: "2026-03-25T19:05:00.000Z",
      summary: "Closeout proof is missing the command snapshot.",
      notes: ""
    });
    await writeFile(attemptsPath, stringify(attempts), "utf8");
    await git(repoDir, ["add", "docs/repo-workflow/campaign.yaml", "docs/repo-workflow/attempts.yaml", "docs/current-state.md", "docs/next-steps.md"]);
    await git(repoDir, ["commit", "-m", "Add recorded proof without verification command"]);

    const result = await validateRepoWorkflow(repoDir);

    assert.equal(result.ok, false);
    assert.equal(result.code, "invalid_state");
    assert.match(result.message, /proof_verification_command/i);
  } finally {
    await removeTempDir(repoDir);
  }
});

test("validateRepoWorkflow fails when active recorded proof does not match the chunk verification command", async () => {
  const repoDir = await createValidRepoWorkflowRepo();

  try {
    const currentHead = await git(repoDir, ["rev-parse", "HEAD"]);
    await switchActiveChunk(repoDir, CLOSEOUT_CHUNK_ID, CLOSEOUT_ATTEMPT_ID);

    const attemptsPath = join(repoDir, "docs", "repo-workflow", "attempts.yaml");
    const attempts = parse(await readFile(attemptsPath, "utf8")) as {
      repo_workflow_attempts: { attempts: Array<Record<string, unknown>> };
    };
    attempts.repo_workflow_attempts.attempts.push({
      attempt_id: CLOSEOUT_ATTEMPT_ID,
      chunk_id: CLOSEOUT_CHUNK_ID,
      attempt_number: 1,
      state: "complete",
      blocked_reason: "none",
      implementer_status: "done",
      spec_review_status: "approved",
      spec_reviewed_commit: currentHead,
      quality_review_status: "approved",
      quality_reviewed_commit: currentHead,
      verification_result: "passed",
      verification_head_commit: currentHead,
      verified_at: "2026-03-25T19:00:00.000Z",
      docs_reconciled: true,
      proof_status: "recorded",
      proof_summary: "Recorded proof snapshot does not match the live closeout command.",
      proof_verification_command: "npm run check --proof",
      proof_commands: ["npm run check --proof"],
      proof_head_commit: currentHead,
      proof_recorded_at: "2026-03-25T19:05:00.000Z",
      summary: "Closeout proof snapshot drifted from the chunk command.",
      notes: ""
    });
    await writeFile(attemptsPath, stringify(attempts), "utf8");
    await git(repoDir, ["add", "docs/repo-workflow/campaign.yaml", "docs/repo-workflow/attempts.yaml", "docs/current-state.md", "docs/next-steps.md"]);
    await git(repoDir, ["commit", "-m", "Add mismatched active proof verification command"]);

    const result = await validateRepoWorkflow(repoDir);

    assert.equal(result.ok, false);
    assert.equal(result.code, "invalid_state");
    assert.match(result.message, /does not match the chunk verification_command/i);
  } finally {
    await removeTempDir(repoDir);
  }
});

test("validateRepoWorkflow fails when recorded proof uses an empty proof verification command snapshot", async () => {
  const repoDir = await createValidRepoWorkflowRepo();

  try {
    const attemptsPath = join(repoDir, "docs", "repo-workflow", "attempts.yaml");
    const attempts = parse(await readFile(attemptsPath, "utf8")) as {
      repo_workflow_attempts: { attempts: Array<Record<string, unknown>> };
    };
    attempts.repo_workflow_attempts.attempts.push({
      attempt_id: CLOSEOUT_ATTEMPT_ID,
      chunk_id: CLOSEOUT_CHUNK_ID,
      attempt_number: 1,
      state: "complete",
      blocked_reason: "none",
      implementer_status: "done",
      spec_review_status: "approved",
      spec_reviewed_commit: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      quality_review_status: "approved",
      quality_reviewed_commit: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      verification_result: "passed",
      verification_head_commit: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      verified_at: "2026-03-25T19:00:00.000Z",
      docs_reconciled: true,
      proof_status: "recorded",
      proof_summary: "Historical proof snapshot should reject blank commands.",
      proof_verification_command: "",
      proof_commands: [""],
      proof_head_commit: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      proof_recorded_at: "2026-03-25T19:05:00.000Z",
      summary: "Historical proof carries blank command snapshots.",
      notes: ""
    });
    await writeFile(attemptsPath, stringify(attempts), "utf8");
    await git(repoDir, ["add", "docs/repo-workflow/attempts.yaml"]);
    await git(repoDir, ["commit", "-m", "Add blank proof command snapshot"]);

    const result = await validateRepoWorkflow(repoDir);

    assert.equal(result.ok, false);
    assert.equal(result.code, "invalid_state");
    assert.match(result.message, /proof_verification_command.*non-empty/i);
  } finally {
    await removeTempDir(repoDir);
  }
});

test("validateRepoWorkflow fails when recorded proof omits proof_commands", async () => {
  const repoDir = await createValidRepoWorkflowRepo();

  try {
    const attemptsPath = join(repoDir, "docs", "repo-workflow", "attempts.yaml");
    const attempts = parse(await readFile(attemptsPath, "utf8")) as {
      repo_workflow_attempts: { attempts: Array<Record<string, unknown>> };
    };
    attempts.repo_workflow_attempts.attempts.push({
      attempt_id: CLOSEOUT_ATTEMPT_ID,
      chunk_id: CLOSEOUT_CHUNK_ID,
      attempt_number: 1,
      state: "complete",
      blocked_reason: "none",
      implementer_status: "done",
      spec_review_status: "approved",
      spec_reviewed_commit: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      quality_review_status: "approved",
      quality_reviewed_commit: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      verification_result: "passed",
      verification_head_commit: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      verified_at: "2026-03-25T19:00:00.000Z",
      docs_reconciled: true,
      proof_status: "recorded",
      proof_summary: "Historical proof snapshot should require proof_commands.",
      proof_verification_command: "npm run check",
      proof_commands: [],
      proof_head_commit: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      proof_recorded_at: "2026-03-25T19:05:00.000Z",
      summary: "Historical proof omits its command list.",
      notes: ""
    });
    await writeFile(attemptsPath, stringify(attempts), "utf8");
    await git(repoDir, ["add", "docs/repo-workflow/attempts.yaml"]);
    await git(repoDir, ["commit", "-m", "Add recorded proof without proof commands"]);

    const result = await validateRepoWorkflow(repoDir);

    assert.equal(result.ok, false);
    assert.equal(result.code, "invalid_state");
    assert.match(result.message, /proof_commands.*proof_verification_command/i);
  } finally {
    await removeTempDir(repoDir);
  }
});

test("validateRepoWorkflow fails when recorded proof includes blank proof_commands entries", async () => {
  const repoDir = await createValidRepoWorkflowRepo();

  try {
    const attemptsPath = join(repoDir, "docs", "repo-workflow", "attempts.yaml");
    const attempts = parse(await readFile(attemptsPath, "utf8")) as {
      repo_workflow_attempts: { attempts: Array<Record<string, unknown>> };
    };
    attempts.repo_workflow_attempts.attempts.push({
      attempt_id: CLOSEOUT_ATTEMPT_ID,
      chunk_id: CLOSEOUT_CHUNK_ID,
      attempt_number: 1,
      state: "complete",
      blocked_reason: "none",
      implementer_status: "done",
      spec_review_status: "approved",
      spec_reviewed_commit: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      quality_review_status: "approved",
      quality_reviewed_commit: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      verification_result: "passed",
      verification_head_commit: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      verified_at: "2026-03-25T19:00:00.000Z",
      docs_reconciled: true,
      proof_status: "recorded",
      proof_summary: "Historical proof snapshot should reject blank command entries.",
      proof_verification_command: "npm run check",
      proof_commands: ["", "npm run check"],
      proof_head_commit: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      proof_recorded_at: "2026-03-25T19:05:00.000Z",
      summary: "Historical proof includes a blank command entry.",
      notes: ""
    });
    await writeFile(attemptsPath, stringify(attempts), "utf8");
    await git(repoDir, ["add", "docs/repo-workflow/attempts.yaml"]);
    await git(repoDir, ["commit", "-m", "Add blank proof_commands entry"]);

    const result = await validateRepoWorkflow(repoDir);

    assert.equal(result.ok, false);
    assert.equal(result.code, "invalid_state");
    assert.match(result.message, /proof_commands.*non-empty/i);
  } finally {
    await removeTempDir(repoDir);
  }
});

test("validateRepoWorkflow fails when non-proof-gated history carries proof data", async () => {
  const repoDir = await createValidRepoWorkflowRepo();

  try {
    const attemptsPath = join(repoDir, "docs", "repo-workflow", "attempts.yaml");
    const attempts = parse(await readFile(attemptsPath, "utf8")) as {
      repo_workflow_attempts: { attempts: Array<Record<string, unknown>> };
    };
    const activeAttempt = attempts.repo_workflow_attempts.attempts[0]!;
    activeAttempt.proof_status = "recorded";
    activeAttempt.proof_summary = "Non-proof-gated chunk should not carry proof.";
    activeAttempt.proof_verification_command = "npm run check";
    activeAttempt.proof_commands = ["npm run check"];
    activeAttempt.proof_head_commit = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    activeAttempt.proof_recorded_at = "2026-03-25T19:05:00.000Z";
    await writeFile(attemptsPath, stringify(attempts), "utf8");
    await git(repoDir, ["add", "docs/repo-workflow/attempts.yaml"]);
    await git(repoDir, ["commit", "-m", "Add proof to a non-proof-gated attempt"]);

    const result = await validateRepoWorkflow(repoDir);

    assert.equal(result.ok, false);
    assert.equal(result.code, "invalid_state");
    assert.match(result.message, /proof_gate: not-required|cannot record proof/i);
  } finally {
    await removeTempDir(repoDir);
  }
});

test("validateRepoWorkflow fails when proof_commands does not include proof_verification_command", async () => {
  const repoDir = await createValidRepoWorkflowRepo();

  try {
    const currentHead = await git(repoDir, ["rev-parse", "HEAD"]);
    await switchActiveChunk(repoDir, CLOSEOUT_CHUNK_ID, CLOSEOUT_ATTEMPT_ID);

    const attemptsPath = join(repoDir, "docs", "repo-workflow", "attempts.yaml");
    const attempts = parse(await readFile(attemptsPath, "utf8")) as {
      repo_workflow_attempts: { attempts: Array<Record<string, unknown>> };
    };
    attempts.repo_workflow_attempts.attempts.push({
      attempt_id: CLOSEOUT_ATTEMPT_ID,
      chunk_id: CLOSEOUT_CHUNK_ID,
      attempt_number: 1,
      state: "complete",
      blocked_reason: "none",
      implementer_status: "done",
      spec_review_status: "approved",
      spec_reviewed_commit: currentHead,
      quality_review_status: "approved",
      quality_reviewed_commit: currentHead,
      verification_result: "passed",
      verification_head_commit: currentHead,
      verified_at: "2026-03-25T19:00:00.000Z",
      docs_reconciled: true,
      proof_status: "recorded",
      proof_summary: "Proof commands omitted the required verification command.",
      proof_verification_command: "npm run check",
      proof_commands: ["npm run lint"],
      proof_head_commit: currentHead,
      proof_recorded_at: "2026-03-25T19:05:00.000Z",
      summary: "Closeout proof commands omitted the required command.",
      notes: ""
    });
    await writeFile(attemptsPath, stringify(attempts), "utf8");
    await git(repoDir, ["add", "docs/repo-workflow/campaign.yaml", "docs/repo-workflow/attempts.yaml", "docs/current-state.md", "docs/next-steps.md"]);
    await git(repoDir, ["commit", "-m", "Add proof commands snapshot mismatch"]);

    const result = await validateRepoWorkflow(repoDir);

    assert.equal(result.ok, false);
    assert.equal(result.code, "invalid_state");
    assert.match(result.message, /proof_commands.*proof_verification_command/i);
  } finally {
    await removeTempDir(repoDir);
  }
});

test("validateRepoWorkflow fails when a proof-gated closeout attempt remains active after completion", async () => {
  const repoDir = await createValidRepoWorkflowRepo();

  try {
    const currentHead = await git(repoDir, ["rev-parse", "HEAD"]);
    await switchActiveChunk(repoDir, CLOSEOUT_CHUNK_ID, CLOSEOUT_ATTEMPT_ID);

    const attemptsPath = join(repoDir, "docs", "repo-workflow", "attempts.yaml");
    const attempts = parse(await readFile(attemptsPath, "utf8")) as {
      repo_workflow_attempts: { attempts: Array<Record<string, unknown>> };
    };
    attempts.repo_workflow_attempts.attempts.push({
      attempt_id: CLOSEOUT_ATTEMPT_ID,
      chunk_id: CLOSEOUT_CHUNK_ID,
      attempt_number: 1,
      state: "complete",
      blocked_reason: "none",
      implementer_status: "done",
      spec_review_status: "approved",
      spec_reviewed_commit: currentHead,
      quality_review_status: "approved",
      quality_reviewed_commit: currentHead,
      verification_result: "passed",
      verification_head_commit: currentHead,
      verified_at: "2026-03-25T19:00:00.000Z",
      docs_reconciled: true,
      proof_status: "recorded",
      proof_summary: "Proof was recorded but campaign state did not advance.",
      proof_verification_command: "npm run check",
      proof_commands: ["npm run check"],
      proof_head_commit: currentHead,
      proof_recorded_at: "2026-03-25T19:05:00.000Z",
      summary: "Closeout proof stayed active after completion.",
      notes: ""
    });
    await writeFile(attemptsPath, stringify(attempts), "utf8");
    await git(repoDir, ["add", "docs/repo-workflow/campaign.yaml", "docs/repo-workflow/attempts.yaml", "docs/current-state.md", "docs/next-steps.md"]);
    await git(repoDir, ["commit", "-m", "Leave proof-gated closeout active after completion"]);

    const result = await validateRepoWorkflow(repoDir);

    assert.equal(result.ok, false);
    assert.equal(result.code, "invalid_state");
    assert.match(result.message, /advance to the next chunk/i);
  } finally {
    await removeTempDir(repoDir);
  }
});

test("validateRepoWorkflow fails when campaign advances past a proof-gated closeout without a recorded handoff attempt", async () => {
  const repoDir = await createValidRepoWorkflowRepo();

  try {
    await switchActiveChunk(repoDir, FOLLOW_UP_CHUNK_ID, FOLLOW_UP_ATTEMPT_ID);

    const attemptsPath = join(repoDir, "docs", "repo-workflow", "attempts.yaml");
    const attempts = parse(await readFile(attemptsPath, "utf8")) as {
      repo_workflow_attempts: { attempts: Array<Record<string, unknown>> };
    };
    attempts.repo_workflow_attempts.attempts.push({
      attempt_id: FOLLOW_UP_ATTEMPT_ID,
      chunk_id: FOLLOW_UP_CHUNK_ID,
      attempt_number: 1,
      state: "ready",
      blocked_reason: "none",
      implementer_status: "not-started",
      spec_review_status: "not-started",
      spec_reviewed_commit: null,
      quality_review_status: "not-started",
      quality_reviewed_commit: null,
      verification_result: "not-run",
      verification_head_commit: null,
      verified_at: null,
      docs_reconciled: false,
      proof_status: "not-required",
      proof_summary: "",
      proof_verification_command: null,
      proof_commands: [],
      proof_head_commit: null,
      proof_recorded_at: null,
      summary: "Follow-up chunk started without closeout proof.",
      notes: ""
    });
    await writeFile(attemptsPath, stringify(attempts), "utf8");
    await git(repoDir, ["add", "docs/repo-workflow/campaign.yaml", "docs/repo-workflow/attempts.yaml", "docs/current-state.md", "docs/next-steps.md"]);
    await git(repoDir, ["commit", "-m", "Advance past proof-gated closeout without proof"]);

    const result = await validateRepoWorkflow(repoDir);

    assert.equal(result.ok, false);
    assert.equal(result.code, "invalid_state");
    assert.match(result.message, /cannot advance to chunk 'c-007'.*chunk 'c-006'/i);
  } finally {
    await removeTempDir(repoDir);
  }
});

test("validateRepoWorkflow fails when canonical history rewrites a proof-gated chunk to not-required", async () => {
  const repoDir = await createValidRepoWorkflowRepo();

  try {
    const attemptsPath = join(repoDir, "docs", "repo-workflow", "attempts.yaml");
    const attempts = parse(await readFile(attemptsPath, "utf8")) as {
      repo_workflow_attempts: { attempts: Array<Record<string, unknown>> };
    };
    attempts.repo_workflow_attempts.attempts.push({
      attempt_id: CLOSEOUT_ATTEMPT_ID,
      chunk_id: CLOSEOUT_CHUNK_ID,
      attempt_number: 1,
      state: "complete",
      blocked_reason: "none",
      implementer_status: "done",
      spec_review_status: "approved",
      spec_reviewed_commit: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      quality_review_status: "approved",
      quality_reviewed_commit: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      verification_result: "passed",
      verification_head_commit: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      verified_at: "2026-03-25T19:00:00.000Z",
      docs_reconciled: true,
      proof_status: "recorded",
      proof_summary: "Historical closeout proof was already recorded.",
      proof_verification_command: "npm run check",
      proof_commands: ["npm run check"],
      proof_head_commit: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      proof_recorded_at: "2026-03-25T19:05:00.000Z",
      summary: "Historical closeout proof exists.",
      notes: ""
    });
    await writeFile(attemptsPath, stringify(attempts), "utf8");

    const chunksPath = join(repoDir, "docs", "repo-workflow", "chunks.yaml");
    const chunks = parse(await readFile(chunksPath, "utf8")) as {
      repo_workflow_chunks: { chunks: Array<Record<string, unknown>> };
    };
    const closeoutChunk = chunks.repo_workflow_chunks.chunks.find((chunk) => chunk.chunk_id === CLOSEOUT_CHUNK_ID);
    if (!closeoutChunk) {
      assert.fail(`expected fixture chunk ${CLOSEOUT_CHUNK_ID}`);
    }
    closeoutChunk.proof_gate = "not-required";
    await writeFile(chunksPath, stringify(chunks), "utf8");

    await git(repoDir, ["add", "docs/repo-workflow/chunks.yaml", "docs/repo-workflow/attempts.yaml"]);
    await git(repoDir, ["commit", "-m", "Rewrite proof-gated chunk to not-required"]);

    const result = await validateRepoWorkflow(repoDir);

    assert.equal(result.ok, false);
    assert.equal(result.code, "invalid_state");
    assert.match(result.message, /cannot be rewritten to proof_gate: not-required/i);
  } finally {
    await removeTempDir(repoDir);
  }
});

test("validateRepoWorkflow fails when proof_recorded_at is not a strict UTC timestamp", async () => {
  const repoDir = await createValidRepoWorkflowRepo();

  try {
    const attemptsPath = join(repoDir, "docs", "repo-workflow", "attempts.yaml");
    const attempts = parse(await readFile(attemptsPath, "utf8")) as {
      repo_workflow_attempts: { attempts: Array<Record<string, unknown>> };
    };
    attempts.repo_workflow_attempts.attempts.push({
      attempt_id: CLOSEOUT_ATTEMPT_ID,
      chunk_id: CLOSEOUT_CHUNK_ID,
      attempt_number: 1,
      state: "complete",
      blocked_reason: "none",
      implementer_status: "done",
      spec_review_status: "approved",
      spec_reviewed_commit: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      quality_review_status: "approved",
      quality_reviewed_commit: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      verification_result: "passed",
      verification_head_commit: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      verified_at: "2026-03-25T19:00:00.000Z",
      docs_reconciled: true,
      proof_status: "recorded",
      proof_summary: "Historical proof uses a non-UTC timestamp format.",
      proof_verification_command: "npm run check",
      proof_commands: ["npm run check"],
      proof_head_commit: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      proof_recorded_at: "2026-03-25T19:05:00+00:00",
      summary: "Historical proof should reject non-UTC timestamp formatting.",
      notes: ""
    });
    await writeFile(attemptsPath, stringify(attempts), "utf8");
    await git(repoDir, ["add", "docs/repo-workflow/attempts.yaml"]);
    await git(repoDir, ["commit", "-m", "Add non-UTC proof_recorded_at"]);

    const result = await validateRepoWorkflow(repoDir);

    assert.equal(result.ok, false);
    assert.equal(result.code, "invalid_yaml");
    assert.match(result.message, /proof_recorded_at.*UTC/i);
  } finally {
    await removeTempDir(repoDir);
  }
});

test("validateRepoWorkflow fails when active closeout proof was not reset after HEAD advanced", async () => {
  const repoDir = await createValidRepoWorkflowRepo();

  try {
    const proofHead = await git(repoDir, ["rev-parse", "HEAD"]);
    await switchActiveChunk(repoDir, CLOSEOUT_CHUNK_ID, CLOSEOUT_ATTEMPT_ID);

    const attemptsPath = join(repoDir, "docs", "repo-workflow", "attempts.yaml");
    const attempts = parse(await readFile(attemptsPath, "utf8")) as {
      repo_workflow_attempts: { attempts: Array<Record<string, unknown>> };
    };
    attempts.repo_workflow_attempts.attempts.push({
      attempt_id: CLOSEOUT_ATTEMPT_ID,
      chunk_id: CLOSEOUT_CHUNK_ID,
      attempt_number: 1,
      state: "blocked",
      blocked_reason: "doc-reconciliation",
      implementer_status: "done",
      spec_review_status: "not-started",
      spec_reviewed_commit: null,
      quality_review_status: "not-started",
      quality_reviewed_commit: null,
      verification_result: "not-run",
      verification_head_commit: null,
      verified_at: null,
      docs_reconciled: false,
      proof_status: "recorded",
      proof_summary: "Proof remained recorded after the active HEAD changed.",
      proof_verification_command: "npm run check",
      proof_commands: ["npm run check"],
      proof_head_commit: proofHead,
      proof_recorded_at: "2026-03-25T19:05:00.000Z",
      summary: "Active closeout proof was not reset after HEAD changed.",
      notes: ""
    });
    await writeFile(attemptsPath, stringify(attempts), "utf8");
    await git(repoDir, ["add", "docs/repo-workflow/campaign.yaml", "docs/repo-workflow/attempts.yaml", "docs/current-state.md", "docs/next-steps.md"]);
    await git(repoDir, ["commit", "-m", "Record stale active closeout proof snapshot"]);

    const backlogPath = join(repoDir, "docs", "backlog.md");
    const backlog = await readFile(backlogPath, "utf8");
    await writeFile(backlogPath, `${backlog.trimEnd()}\n\nFollow-up note that advances HEAD.\n`, "utf8");
    await git(repoDir, ["add", "docs/backlog.md"]);
    await git(repoDir, ["commit", "-m", "Advance HEAD after recording stale proof"]);

    const result = await validateRepoWorkflow(repoDir);

    assert.equal(result.ok, false);
    assert.equal(result.code, "invalid_state");
    assert.match(result.message, /reset to pending/i);
  } finally {
    await removeTempDir(repoDir);
  }
});

test("validateRepoWorkflow accepts historical proof recorded on an older commit", async () => {
  const repoDir = await createValidRepoWorkflowRepo();

  try {
    const attemptsPath = join(repoDir, "docs", "repo-workflow", "attempts.yaml");
    const attempts = parse(await readFile(attemptsPath, "utf8")) as {
      repo_workflow_attempts: { attempts: Array<Record<string, unknown>> };
    };
    attempts.repo_workflow_attempts.attempts.push({
      attempt_id: CLOSEOUT_ATTEMPT_ID,
      chunk_id: CLOSEOUT_CHUNK_ID,
      attempt_number: 1,
      state: "complete",
      blocked_reason: "none",
      implementer_status: "done",
      spec_review_status: "approved",
      spec_reviewed_commit: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      quality_review_status: "approved",
      quality_reviewed_commit: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      verification_result: "passed",
      verification_head_commit: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      verified_at: "2026-03-25T19:00:00.000Z",
      docs_reconciled: true,
      proof_status: "recorded",
      proof_summary: "Historical milestone proof stays valid on its recorded commit.",
      proof_verification_command: "npm run check",
      proof_commands: ["npm run check", "node --version"],
      proof_head_commit: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      proof_recorded_at: "2026-03-25T19:05:00.000Z",
      summary: "Historical closeout proof was recorded on an older commit.",
      notes: ""
    });
    await writeFile(attemptsPath, stringify(attempts), "utf8");
    await git(repoDir, ["add", "docs/repo-workflow/attempts.yaml"]);
    await git(repoDir, ["commit", "-m", "Add historical proof snapshot"]);

    const result = await validateRepoWorkflow(repoDir);

    if (!result.ok) {
      assert.fail(`expected validation success, got ${result.code}: ${result.message}`);
    }
  } finally {
    await removeTempDir(repoDir);
  }
});

test("validateRepoWorkflow accepts campaign handoff after a proof-gated closeout records proof", async () => {
  const repoDir = await createValidRepoWorkflowRepo();

  try {
    await switchActiveChunk(repoDir, FOLLOW_UP_CHUNK_ID, FOLLOW_UP_ATTEMPT_ID);

    const attemptsPath = join(repoDir, "docs", "repo-workflow", "attempts.yaml");
    const attempts = parse(await readFile(attemptsPath, "utf8")) as {
      repo_workflow_attempts: { attempts: Array<Record<string, unknown>> };
    };
    attempts.repo_workflow_attempts.attempts.push({
      attempt_id: CLOSEOUT_ATTEMPT_ID,
      chunk_id: CLOSEOUT_CHUNK_ID,
      attempt_number: 1,
      state: "complete",
      blocked_reason: "none",
      implementer_status: "done",
      spec_review_status: "approved",
      spec_reviewed_commit: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      quality_review_status: "approved",
      quality_reviewed_commit: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      verification_result: "passed",
      verification_head_commit: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      verified_at: "2026-03-25T19:00:00.000Z",
      docs_reconciled: true,
      proof_status: "recorded",
      proof_summary: "Milestone closeout proof was recorded before the campaign advanced.",
      proof_verification_command: "npm run check",
      proof_commands: ["npm run check"],
      proof_head_commit: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      proof_recorded_at: "2026-03-25T19:05:00.000Z",
      summary: "Closeout proof completed before the next chunk started.",
      notes: ""
    });
    attempts.repo_workflow_attempts.attempts.push({
      attempt_id: FOLLOW_UP_ATTEMPT_ID,
      chunk_id: FOLLOW_UP_CHUNK_ID,
      attempt_number: 1,
      state: "ready",
      blocked_reason: "none",
      implementer_status: "not-started",
      spec_review_status: "not-started",
      spec_reviewed_commit: null,
      quality_review_status: "not-started",
      quality_reviewed_commit: null,
      verification_result: "not-run",
      verification_head_commit: null,
      verified_at: null,
      docs_reconciled: false,
      proof_status: "not-required",
      proof_summary: "",
      proof_verification_command: null,
      proof_commands: [],
      proof_head_commit: null,
      proof_recorded_at: null,
      summary: "Follow-up chunk started after proof-gated closeout.",
      notes: ""
    });
    await writeFile(attemptsPath, stringify(attempts), "utf8");
    await git(repoDir, ["add", "docs/repo-workflow/campaign.yaml", "docs/repo-workflow/attempts.yaml", "docs/current-state.md", "docs/next-steps.md"]);
    await git(repoDir, ["commit", "-m", "Advance after recording proof-gated closeout"]);

    const result = await validateRepoWorkflow(repoDir);

    if (!result.ok) {
      assert.fail(`expected validation success, got ${result.code}: ${result.message}`);
    }

    assert.equal(result.activeAttempt?.attemptId, FOLLOW_UP_ATTEMPT_ID);
  } finally {
    await removeTempDir(repoDir);
  }
});

test("validateRepoWorkflow accepts historical closeout proof after the chunk verification command changes", async () => {
  const repoDir = await createValidRepoWorkflowRepo();

  try {
    await switchActiveChunk(repoDir, FOLLOW_UP_CHUNK_ID, FOLLOW_UP_ATTEMPT_ID);

    const attemptsPath = join(repoDir, "docs", "repo-workflow", "attempts.yaml");
    const attempts = parse(await readFile(attemptsPath, "utf8")) as {
      repo_workflow_attempts: { attempts: Array<Record<string, unknown>> };
    };
    attempts.repo_workflow_attempts.attempts.push({
      attempt_id: CLOSEOUT_ATTEMPT_ID,
      chunk_id: CLOSEOUT_CHUNK_ID,
      attempt_number: 1,
      state: "complete",
      blocked_reason: "none",
      implementer_status: "done",
      spec_review_status: "approved",
      spec_reviewed_commit: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      quality_review_status: "approved",
      quality_reviewed_commit: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      verification_result: "passed",
      verification_head_commit: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      verified_at: "2026-03-25T19:00:00.000Z",
      docs_reconciled: true,
      proof_status: "recorded",
      proof_summary: "Historical proof keeps its own command snapshot.",
      proof_verification_command: "npm run check",
      proof_commands: ["npm run check"],
      proof_head_commit: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      proof_recorded_at: "2026-03-25T19:05:00.000Z",
      summary: "Closeout proof snapshot predates a later chunk command edit.",
      notes: ""
    });
    attempts.repo_workflow_attempts.attempts.push({
      attempt_id: FOLLOW_UP_ATTEMPT_ID,
      chunk_id: FOLLOW_UP_CHUNK_ID,
      attempt_number: 1,
      state: "ready",
      blocked_reason: "none",
      implementer_status: "not-started",
      spec_review_status: "not-started",
      spec_reviewed_commit: null,
      quality_review_status: "not-started",
      quality_reviewed_commit: null,
      verification_result: "not-run",
      verification_head_commit: null,
      verified_at: null,
      docs_reconciled: false,
      proof_status: "not-required",
      proof_summary: "",
      proof_verification_command: null,
      proof_commands: [],
      proof_head_commit: null,
      proof_recorded_at: null,
      summary: "Follow-up chunk started after proof-gated closeout.",
      notes: ""
    });
    await writeFile(attemptsPath, stringify(attempts), "utf8");

    const chunksPath = join(repoDir, "docs", "repo-workflow", "chunks.yaml");
    const chunks = parse(await readFile(chunksPath, "utf8")) as {
      repo_workflow_chunks: { chunks: Array<Record<string, unknown>> };
    };
    const closeoutChunk = chunks.repo_workflow_chunks.chunks.find((chunk) => chunk.chunk_id === CLOSEOUT_CHUNK_ID);
    if (!closeoutChunk) {
      assert.fail(`expected fixture chunk ${CLOSEOUT_CHUNK_ID}`);
    }
    closeoutChunk.verification_command = "npm run check --proof-gate-v2";
    await writeFile(chunksPath, stringify(chunks), "utf8");

    await git(
      repoDir,
      ["add", "docs/repo-workflow/campaign.yaml", "docs/repo-workflow/chunks.yaml", "docs/repo-workflow/attempts.yaml", "docs/current-state.md", "docs/next-steps.md"]
    );
    await git(repoDir, ["commit", "-m", "Change historical closeout command after handoff"]);

    const result = await validateRepoWorkflow(repoDir);

    if (!result.ok) {
      assert.fail(`expected validation success, got ${result.code}: ${result.message}`);
    }

    assert.equal(result.activeAttempt?.attemptId, FOLLOW_UP_ATTEMPT_ID);
  } finally {
    await removeTempDir(repoDir);
  }
});

test("validateRepoWorkflow accepts an active proof-gated closeout after proof reset to pending following HEAD advance", async () => {
  const repoDir = await createValidRepoWorkflowRepo();

  try {
    const proofHeadCommit = await git(repoDir, ["rev-parse", "HEAD"]);
    await switchActiveChunk(repoDir, CLOSEOUT_CHUNK_ID, CLOSEOUT_ATTEMPT_ID);

    const attemptsPath = join(repoDir, "docs", "repo-workflow", "attempts.yaml");
    const attempts = parse(await readFile(attemptsPath, "utf8")) as {
      repo_workflow_attempts: { attempts: Array<Record<string, unknown>> };
    };
    attempts.repo_workflow_attempts.attempts.push({
      attempt_id: CLOSEOUT_ATTEMPT_ID,
      chunk_id: CLOSEOUT_CHUNK_ID,
      attempt_number: 1,
      state: "blocked",
      blocked_reason: "doc-reconciliation",
      implementer_status: "done",
      spec_review_status: "not-started",
      spec_reviewed_commit: null,
      quality_review_status: "not-started",
      quality_reviewed_commit: null,
      verification_result: "not-run",
      verification_head_commit: null,
      verified_at: null,
      docs_reconciled: false,
      proof_status: "recorded",
      proof_summary: "Closeout proof was recorded before HEAD advanced.",
      proof_verification_command: "npm run check",
      proof_commands: ["npm run check"],
      proof_head_commit: proofHeadCommit,
      proof_recorded_at: "2026-03-25T19:05:00.000Z",
      summary: "Active closeout proof was recorded before docs changed.",
      notes: ""
    });
    await writeFile(attemptsPath, stringify(attempts), "utf8");
    await git(repoDir, ["add", "docs/repo-workflow/campaign.yaml", "docs/repo-workflow/attempts.yaml", "docs/current-state.md", "docs/next-steps.md"]);
    await git(repoDir, ["commit", "-m", "Record active closeout proof before head advance"]);

    const backlogPath = join(repoDir, "docs", "backlog.md");
    const backlog = await readFile(backlogPath, "utf8");
    await writeFile(backlogPath, `${backlog.trimEnd()}\n\nFollow-up note that advances HEAD.\n`, "utf8");

    const resetAttempts = parse(await readFile(attemptsPath, "utf8")) as {
      repo_workflow_attempts: { attempts: Array<Record<string, unknown>> };
    };
    const activeCloseout = resetAttempts.repo_workflow_attempts.attempts.find((attempt) => attempt.attempt_id === CLOSEOUT_ATTEMPT_ID);
    if (!activeCloseout) {
      assert.fail(`expected active attempt ${CLOSEOUT_ATTEMPT_ID}`);
    }
    activeCloseout.proof_status = "pending";
    activeCloseout.proof_summary = "";
    activeCloseout.proof_verification_command = null;
    activeCloseout.proof_commands = [];
    activeCloseout.proof_head_commit = null;
    activeCloseout.proof_recorded_at = null;
    await writeFile(attemptsPath, stringify(resetAttempts), "utf8");

    await git(repoDir, ["add", "docs/backlog.md", "docs/repo-workflow/attempts.yaml"]);
    await git(repoDir, ["commit", "-m", "Reset active closeout proof after head advance"]);

    const result = await validateRepoWorkflow(repoDir);

    if (!result.ok) {
      assert.fail(`expected validation success, got ${result.code}: ${result.message}`);
    }

    assert.equal(result.activeAttempt?.attemptId, CLOSEOUT_ATTEMPT_ID);
  } finally {
    await removeTempDir(repoDir);
  }
});

test("validateRepoWorkflow fails when a proof-gated closeout attempt uses proof_status not-required", async () => {
  const repoDir = await createValidRepoWorkflowRepo();

  try {
    await switchActiveChunk(repoDir, CLOSEOUT_CHUNK_ID, CLOSEOUT_ATTEMPT_ID);

    const attemptsPath = join(repoDir, "docs", "repo-workflow", "attempts.yaml");
    const attempts = parse(await readFile(attemptsPath, "utf8")) as {
      repo_workflow_attempts: { attempts: Array<Record<string, unknown>> };
    };
    attempts.repo_workflow_attempts.attempts.push({
      attempt_id: CLOSEOUT_ATTEMPT_ID,
      chunk_id: CLOSEOUT_CHUNK_ID,
      attempt_number: 1,
      state: "blocked",
      blocked_reason: "operator-input",
      implementer_status: "needs-context",
      spec_review_status: "not-started",
      spec_reviewed_commit: null,
      quality_review_status: "not-started",
      quality_reviewed_commit: null,
      verification_result: "not-run",
      verification_head_commit: null,
      verified_at: null,
      docs_reconciled: false,
      proof_status: "not-required",
      proof_summary: "",
      proof_verification_command: null,
      proof_commands: [],
      proof_head_commit: null,
      proof_recorded_at: null,
      summary: "Closeout chunk incorrectly marked proof as not required.",
      notes: ""
    });
    await writeFile(attemptsPath, stringify(attempts), "utf8");
    await git(repoDir, ["add", "docs/repo-workflow/campaign.yaml", "docs/repo-workflow/attempts.yaml", "docs/current-state.md", "docs/next-steps.md"]);
    await git(repoDir, ["commit", "-m", "Use not-required proof status on closeout chunk"]);

    const result = await validateRepoWorkflow(repoDir);

    assert.equal(result.ok, false);
    assert.equal(result.code, "invalid_state");
    assert.match(result.message, /cannot use proof_status 'not-required'/i);
  } finally {
    await removeTempDir(repoDir);
  }
});

test("validateRepoWorkflow fails when a proof-gated chunk is terminal", async () => {
  const repoDir = await createValidRepoWorkflowRepo();

  try {
    const chunksPath = join(repoDir, "docs", "repo-workflow", "chunks.yaml");
    const chunks = parse(await readFile(chunksPath, "utf8")) as {
      repo_workflow_chunks: { chunks: Array<Record<string, unknown>> };
    };
    const activeChunk = chunks.repo_workflow_chunks.chunks.find((chunk) => chunk.chunk_id === ACTIVE_CHUNK_ID);
    const closeoutChunk = chunks.repo_workflow_chunks.chunks.find((chunk) => chunk.chunk_id === CLOSEOUT_CHUNK_ID);
    const followUpChunk = chunks.repo_workflow_chunks.chunks.find((chunk) => chunk.chunk_id === FOLLOW_UP_CHUNK_ID);
    if (!activeChunk) {
      assert.fail(`expected fixture chunk ${ACTIVE_CHUNK_ID}`);
    }
    if (!closeoutChunk) {
      assert.fail(`expected fixture chunk ${CLOSEOUT_CHUNK_ID}`);
    }
    if (!followUpChunk) {
      assert.fail(`expected fixture chunk ${FOLLOW_UP_CHUNK_ID}`);
    }
    activeChunk.next_chunk_id = FOLLOW_UP_CHUNK_ID;
    closeoutChunk.next_chunk_id = null;
    followUpChunk.next_chunk_id = CLOSEOUT_CHUNK_ID;
    await writeFile(chunksPath, stringify(chunks), "utf8");
    await git(repoDir, ["add", "docs/repo-workflow/chunks.yaml"]);
    await git(repoDir, ["commit", "-m", "Make proof-gated chunk terminal"]);

    const result = await validateRepoWorkflow(repoDir);

    assert.equal(result.ok, false);
    assert.equal(result.code, "invalid_state");
    assert.match(result.message, /cannot use proof_gate: required as a terminal chunk/i);
  } finally {
    await removeTempDir(repoDir);
  }
});

test("validateRepoWorkflow fails when chunks.yaml gives one successor multiple predecessors", async () => {
  const repoDir = await createValidRepoWorkflowRepo();

  try {
    const chunksPath = join(repoDir, "docs", "repo-workflow", "chunks.yaml");
    const chunks = parse(await readFile(chunksPath, "utf8")) as {
      repo_workflow_chunks: { chunks: Array<Record<string, unknown>> };
    };
    chunks.repo_workflow_chunks.chunks.push({
      chunk_id: "c-008",
      next_chunk_id: FOLLOW_UP_CHUNK_ID,
      objective: "duplicate-predecessor",
      scope: "repo-workflow-proof-gate-regression",
      done_condition: "should-never-validate",
      verification_command: "npm run check",
      proof_gate: "not-required",
      owner_role: "controller"
    });
    await writeFile(chunksPath, stringify(chunks), "utf8");
    await git(repoDir, ["add", "docs/repo-workflow/chunks.yaml"]);
    await git(repoDir, ["commit", "-m", "Add duplicate predecessor chunk"]);

    const result = await validateRepoWorkflow(repoDir);

    assert.equal(result.ok, false);
    assert.equal(result.code, "invalid_yaml");
    assert.match(result.message, /multiple predecessors|single connected chain/i);
  } finally {
    await removeTempDir(repoDir);
  }
});

test("validateRepoWorkflow fails when chunks.yaml is not a single connected chain", async () => {
  const repoDir = await createValidRepoWorkflowRepo();

  try {
    const chunksPath = join(repoDir, "docs", "repo-workflow", "chunks.yaml");
    const chunks = parse(await readFile(chunksPath, "utf8")) as {
      repo_workflow_chunks: { chunks: Array<Record<string, unknown>> };
    };
    const activeChunk = chunks.repo_workflow_chunks.chunks.find((chunk) => chunk.chunk_id === ACTIVE_CHUNK_ID);
    const closeoutChunk = chunks.repo_workflow_chunks.chunks.find((chunk) => chunk.chunk_id === CLOSEOUT_CHUNK_ID);
    if (!activeChunk) {
      assert.fail(`expected fixture chunk ${ACTIVE_CHUNK_ID}`);
    }
    if (!closeoutChunk) {
      assert.fail(`expected fixture chunk ${CLOSEOUT_CHUNK_ID}`);
    }
    activeChunk.next_chunk_id = CLOSEOUT_CHUNK_ID;
    closeoutChunk.next_chunk_id = ACTIVE_CHUNK_ID;
    await writeFile(chunksPath, stringify(chunks), "utf8");
    await git(repoDir, ["add", "docs/repo-workflow/chunks.yaml"]);
    await git(repoDir, ["commit", "-m", "Introduce disconnected cycle in chunk chain"]);

    const result = await validateRepoWorkflow(repoDir);

    assert.equal(result.ok, false);
    assert.equal(result.code, "invalid_yaml");
    assert.match(result.message, /single connected chain|cycles/i);
  } finally {
    await removeTempDir(repoDir);
  }
});

test("validateRepoWorkflow fails when a proof-gated chunk reuses an attempt_number", async () => {
  const repoDir = await createValidRepoWorkflowRepo();

  try {
    await switchActiveChunk(repoDir, FOLLOW_UP_CHUNK_ID, FOLLOW_UP_ATTEMPT_ID);

    const attemptsPath = join(repoDir, "docs", "repo-workflow", "attempts.yaml");
    const attempts = parse(await readFile(attemptsPath, "utf8")) as {
      repo_workflow_attempts: { attempts: Array<Record<string, unknown>> };
    };
    attempts.repo_workflow_attempts.attempts.push({
      attempt_id: CLOSEOUT_ATTEMPT_ID,
      chunk_id: CLOSEOUT_CHUNK_ID,
      attempt_number: 1,
      state: "complete",
      blocked_reason: "none",
      implementer_status: "done",
      spec_review_status: "approved",
      spec_reviewed_commit: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      quality_review_status: "approved",
      quality_reviewed_commit: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      verification_result: "passed",
      verification_head_commit: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      verified_at: "2026-03-25T19:00:00.000Z",
      docs_reconciled: true,
      proof_status: "recorded",
      proof_summary: "Original closeout proof attempt.",
      proof_verification_command: "npm run check",
      proof_commands: ["npm run check"],
      proof_head_commit: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      proof_recorded_at: "2026-03-25T19:05:00.000Z",
      summary: "First closeout attempt completed with proof.",
      notes: ""
    });
    attempts.repo_workflow_attempts.attempts.push({
      attempt_id: "a-006b",
      chunk_id: CLOSEOUT_CHUNK_ID,
      attempt_number: 1,
      state: "blocked",
      blocked_reason: "operator-input",
      implementer_status: "needs-context",
      spec_review_status: "not-started",
      spec_reviewed_commit: null,
      quality_review_status: "not-started",
      quality_reviewed_commit: null,
      verification_result: "not-run",
      verification_head_commit: null,
      verified_at: null,
      docs_reconciled: false,
      proof_status: "pending",
      proof_summary: "",
      proof_verification_command: null,
      proof_commands: [],
      proof_head_commit: null,
      proof_recorded_at: null,
      summary: "A later closeout attempt reused the attempt number.",
      notes: ""
    });
    attempts.repo_workflow_attempts.attempts.push({
      attempt_id: FOLLOW_UP_ATTEMPT_ID,
      chunk_id: FOLLOW_UP_CHUNK_ID,
      attempt_number: 1,
      state: "ready",
      blocked_reason: "none",
      implementer_status: "not-started",
      spec_review_status: "not-started",
      spec_reviewed_commit: null,
      quality_review_status: "not-started",
      quality_reviewed_commit: null,
      verification_result: "not-run",
      verification_head_commit: null,
      verified_at: null,
      docs_reconciled: false,
      proof_status: "not-required",
      proof_summary: "",
      proof_verification_command: null,
      proof_commands: [],
      proof_head_commit: null,
      proof_recorded_at: null,
      summary: "Follow-up chunk started after duplicate closeout numbering.",
      notes: ""
    });
    await writeFile(attemptsPath, stringify(attempts), "utf8");
    await git(repoDir, ["add", "docs/repo-workflow/campaign.yaml", "docs/repo-workflow/attempts.yaml", "docs/current-state.md", "docs/next-steps.md"]);
    await git(repoDir, ["commit", "-m", "Reuse proof-gated attempt number"]);

    const result = await validateRepoWorkflow(repoDir);

    assert.equal(result.ok, false);
    assert.equal(result.code, "invalid_yaml");
    assert.match(result.message, /duplicate attempt_number.*c-006/i);
  } finally {
    await removeTempDir(repoDir);
  }
});

test("validateRepoWorkflow fails when a mandatory startup doc is missing the startup marker", async () => {
  const repoDir = await createValidRepoWorkflowRepo();

  try {
    await writeFile(join(repoDir, "AGENTS.md"), "# AGENTS\n\nstartup guidance without marker\n", "utf8");
    await git(repoDir, ["add", "AGENTS.md"]);
    await git(repoDir, ["commit", "-m", "Remove startup marker"]);

    const result = await validateRepoWorkflow(repoDir);

    assert.equal(result.ok, false);
    assert.equal(result.code, "invalid_startup_doc");
    assert.match(result.message, /missing startup marker/i);
    assert.match(result.message, /AGENTS\.md/);
  } finally {
    await removeTempDir(repoDir);
  }
});

test("validateRepoWorkflow fails when a required projection block is missing", async () => {
  const repoDir = await createValidRepoWorkflowRepo();

  try {
    await writeFile(
      join(repoDir, "docs", "current-state.md"),
      ["# Current State", "", STARTUP_MARKER, "", "projection removed"].join("\n"),
      "utf8"
    );
    await git(repoDir, ["add", "docs/current-state.md"]);
    await git(repoDir, ["commit", "-m", "Remove projection block"]);

    const result = await validateRepoWorkflow(repoDir);

    assert.equal(result.ok, false);
    assert.equal(result.code, "invalid_projection");
    assert.match(result.message, /missing projection/i);
  } finally {
    await removeTempDir(repoDir);
  }
});

test("validateRepoWorkflow fails when docs/milestones.md is missing the registry block", async () => {
  const repoDir = await createValidRepoWorkflowRepo();

  try {
    await writeFile(join(repoDir, "docs", "milestones.md"), ["# Milestones", "", STARTUP_MARKER, ""].join("\n"), "utf8");
    await git(repoDir, ["add", "docs/milestones.md"]);
    await git(repoDir, ["commit", "-m", "Remove milestone registry"]);

    const result = await validateRepoWorkflow(repoDir);

    assert.equal(result.ok, false);
    assert.equal(result.code, "invalid_milestone_registry");
    assert.match(result.message, /milestone registry/i);
  } finally {
    await removeTempDir(repoDir);
  }
});

test("validateRepoWorkflow fails when projection ids do not match canonical repo-workflow state", async () => {
  const repoDir = await createValidRepoWorkflowRepo();

  try {
    const currentStatePath = join(repoDir, "docs", "current-state.md");
    const currentState = await readFile(currentStatePath, "utf8");
    await writeFile(currentStatePath, currentState.replace(`active_chunk_id: ${ACTIVE_CHUNK_ID}`, "active_chunk_id: c-099"), "utf8");
    await git(repoDir, ["add", "docs/current-state.md"]);
    await git(repoDir, ["commit", "-m", "Break projection ids"]);

    const result = await validateRepoWorkflow(repoDir);

    assert.equal(result.ok, false);
    assert.equal(result.code, "invalid_projection");
    assert.match(result.message, /projection ids do not match canonical repo-workflow state/i);
  } finally {
    await removeTempDir(repoDir);
  }
});

test("validateRepoWorkflow fails when campaign.active_attempt_id points at a missing attempt", async () => {
  const repoDir = await createValidRepoWorkflowRepo();

  try {
    const campaignPath = join(repoDir, "docs", "repo-workflow", "campaign.yaml");
    const campaign = parse(await readFile(campaignPath, "utf8")) as {
      repo_workflow_campaign: Record<string, unknown>;
    };
    campaign.repo_workflow_campaign.active_attempt_id = "a-099";
    await writeFile(campaignPath, stringify(campaign), "utf8");
    await git(repoDir, ["add", "docs/repo-workflow/campaign.yaml"]);
    await git(repoDir, ["commit", "-m", "Break active attempt linkage"]);

    const result = await validateRepoWorkflow(repoDir);

    assert.equal(result.ok, false);
    assert.equal(result.code, "invalid_state");
    assert.match(result.message, /active attempt/i);
    assert.match(result.message, /a-099/);
  } finally {
    await removeTempDir(repoDir);
  }
});

test("validateRepoWorkflow fails when the active attempt chunk does not match the active chunk", async () => {
  const repoDir = await createValidRepoWorkflowRepo();

  try {
    const attemptsPath = join(repoDir, "docs", "repo-workflow", "attempts.yaml");
    const attempts = parse(await readFile(attemptsPath, "utf8")) as {
      repo_workflow_attempts: { attempts: Array<Record<string, unknown>> };
    };
    attempts.repo_workflow_attempts.attempts[0]!.chunk_id = "c-002";
    await writeFile(attemptsPath, stringify(attempts), "utf8");
    await git(repoDir, ["add", "docs/repo-workflow/attempts.yaml"]);
    await git(repoDir, ["commit", "-m", "Break attempt chunk linkage"]);

    const result = await validateRepoWorkflow(repoDir);

    assert.equal(result.ok, false);
    assert.equal(result.code, "invalid_state");
    assert.match(result.message, /active attempt/i);
    assert.match(result.message, /chunk/i);
  } finally {
    await removeTempDir(repoDir);
  }
});

test("validateRepoWorkflow fails when canonical YAML contains an illegal enum value", async () => {
  const repoDir = await createValidRepoWorkflowRepo();

  try {
    const attemptsPath = join(repoDir, "docs", "repo-workflow", "attempts.yaml");
    const attempts = parse(await readFile(attemptsPath, "utf8")) as {
      repo_workflow_attempts: { attempts: Array<Record<string, unknown>> };
    };
    attempts.repo_workflow_attempts.attempts[0]!.state = "flying";
    await writeFile(attemptsPath, stringify(attempts), "utf8");
    await git(repoDir, ["add", "docs/repo-workflow/attempts.yaml"]);
    await git(repoDir, ["commit", "-m", "Use invalid enum value"]);

    const result = await validateRepoWorkflow(repoDir);

    assert.equal(result.ok, false);
    assert.equal(result.code, "invalid_yaml");
    assert.match(result.message, /illegal enum/i);
    assert.match(result.message, /state/i);
  } finally {
    await removeTempDir(repoDir);
  }
});

test("validateRepoWorkflow fails when verification_command appears outside chunks.yaml", async () => {
  const repoDir = await createValidRepoWorkflowRepo();

  try {
    const campaignPath = join(repoDir, "docs", "repo-workflow", "campaign.yaml");
    const campaign = parse(await readFile(campaignPath, "utf8")) as {
      repo_workflow_campaign: Record<string, unknown>;
    };
    campaign.repo_workflow_campaign.verification_command = "npm run check";
    await writeFile(campaignPath, stringify(campaign), "utf8");
    await git(repoDir, ["add", "docs/repo-workflow/campaign.yaml"]);
    await git(repoDir, ["commit", "-m", "Add misplaced verification command"]);

    const result = await validateRepoWorkflow(repoDir);

    assert.equal(result.ok, false);
    assert.equal(result.code, "invalid_yaml");
    assert.match(result.message, /verification_command/i);
    assert.match(result.message, /chunks\.yaml/i);
  } finally {
    await removeTempDir(repoDir);
  }
});

test("validateRepoWorkflow fails when review or verification commits are stale relative to the current checked-out HEAD", async () => {
  const repoDir = await createValidRepoWorkflowRepo();

  try {
    const staleCommit = await git(repoDir, ["rev-parse", "HEAD"]);

    const attemptsPath = join(repoDir, "docs", "repo-workflow", "attempts.yaml");
    const attempts = parse(await readFile(attemptsPath, "utf8")) as {
      repo_workflow_attempts: { attempts: Array<Record<string, unknown>> };
    };
    const activeAttempt = attempts.repo_workflow_attempts.attempts[0]!;
    activeAttempt.state = "complete";
    activeAttempt.implementer_status = "done";
    activeAttempt.spec_review_status = "approved";
    activeAttempt.spec_reviewed_commit = staleCommit;
    activeAttempt.quality_review_status = "approved";
    activeAttempt.quality_reviewed_commit = staleCommit;
    activeAttempt.verification_result = "passed";
    activeAttempt.verification_head_commit = staleCommit;
    activeAttempt.verified_at = "2026-03-25T12:00:00.000Z";
    activeAttempt.docs_reconciled = true;
    activeAttempt.summary = "Chunk finished on an older head.";
    await writeFile(attemptsPath, stringify(attempts), "utf8");
    await git(repoDir, ["add", "docs/repo-workflow/attempts.yaml"]);
    await git(repoDir, ["commit", "-m", "Record stale review currency"]);

    const result = await validateRepoWorkflow(repoDir);

    assert.equal(result.ok, false);
    assert.equal(result.code, "invalid_state");
    assert.match(result.message, /current checked-out HEAD/i);
  } finally {
    await removeTempDir(repoDir);
  }
});

test("validateRepoWorkflow fails closed on dirty worktrees, including .switchyard changes", async () => {
  const repoDir = await createValidRepoWorkflowRepo();

  try {
    await mkdir(join(repoDir, ".switchyard"), { recursive: true });
    await writeFile(join(repoDir, ".switchyard", "config.yaml"), "runtime:\n  default: codex\n", "utf8");

    const result = await validateRepoWorkflow(repoDir);

    assert.equal(result.ok, false);
    assert.equal(result.code, "dirty_worktree");
    assert.match(result.message, /dirty worktree/i);
    assert.match(result.message, /\.switchyard\/config\.yaml/);
  } finally {
    await removeTempDir(repoDir);
  }
});

test("validateRepoWorkflow fails closed on ignored .switchyard artifacts", async () => {
  const repoDir = await createValidRepoWorkflowRepo();

  try {
    await mkdir(join(repoDir, ".switchyard", "logs"), { recursive: true });
    await writeFile(join(repoDir, ".switchyard", "events.db"), "sqlite placeholder\n", "utf8");

    const result = await validateRepoWorkflow(repoDir);

    assert.equal(result.ok, false);
    assert.equal(result.code, "dirty_worktree");
    assert.match(result.message, /\.switchyard\/events\.db/);
  } finally {
    await removeTempDir(repoDir);
  }
});

test("validateRepoWorkflow fails when slice_ledger.row_ref does not exist in docs/slice-ledger.md", async () => {
  const repoDir = await createValidRepoWorkflowRepo();

  try {
    const campaignPath = join(repoDir, "docs", "repo-workflow", "campaign.yaml");
    const campaign = parse(await readFile(campaignPath, "utf8")) as {
      repo_workflow_campaign: { slice_ledger: { disposition: string; row_ref: string | null } };
    };
    campaign.repo_workflow_campaign.slice_ledger.disposition = "folded-into-existing-row";
    campaign.repo_workflow_campaign.slice_ledger.row_ref = "S999";
    await writeFile(campaignPath, stringify(campaign), "utf8");
    await git(repoDir, ["add", "docs/repo-workflow/campaign.yaml"]);
    await git(repoDir, ["commit", "-m", "Use missing slice ledger row ref"]);

    const result = await validateRepoWorkflow(repoDir);

    assert.equal(result.ok, false);
    assert.equal(result.code, "invalid_state");
    assert.match(result.message, /docs\/slice-ledger\.md/);
    assert.match(result.message, /S999/);
  } finally {
    await removeTempDir(repoDir);
  }
});

test("validateRepoWorkflow fails when the startup marker is buried away from the startup-doc header", async () => {
  const repoDir = await createValidRepoWorkflowRepo();

  try {
    await writeFile(
      join(repoDir, "AGENTS.md"),
      ["# AGENTS", "", "line 1", "line 2", "line 3", "line 4", "line 5", "line 6", "", STARTUP_MARKER].join("\n"),
      "utf8"
    );
    await git(repoDir, ["add", "AGENTS.md"]);
    await git(repoDir, ["commit", "-m", "Bury startup marker"]);

    const result = await validateRepoWorkflow(repoDir);

    assert.equal(result.ok, false);
    assert.equal(result.code, "invalid_startup_doc");
    assert.match(result.message, /required startup-doc position/i);
  } finally {
    await removeTempDir(repoDir);
  }
});

test("validateRepoWorkflow fails when a projection doc contains duplicate projection blocks", async () => {
  const repoDir = await createValidRepoWorkflowRepo();

  try {
    const currentStatePath = join(repoDir, "docs", "current-state.md");
    const currentState = await readFile(currentStatePath, "utf8");
    await writeFile(currentStatePath, `${currentState.trim()}\n\n${projectionBlock({ includeActiveChunkId: true })}\n`, "utf8");
    await git(repoDir, ["add", "docs/current-state.md"]);
    await git(repoDir, ["commit", "-m", "Duplicate projection block"]);

    const result = await validateRepoWorkflow(repoDir);

    assert.equal(result.ok, false);
    assert.equal(result.code, "invalid_projection");
    assert.match(result.message, /projection block delimiters/i);
  } finally {
    await removeTempDir(repoDir);
  }
});

test("validateRepoWorkflow fails when the active attempt is complete without docs reconciliation", async () => {
  const repoDir = await createValidRepoWorkflowRepo();

  try {
    const currentHead = await git(repoDir, ["rev-parse", "HEAD"]);
    const attemptsPath = join(repoDir, "docs", "repo-workflow", "attempts.yaml");
    const attempts = parse(await readFile(attemptsPath, "utf8")) as {
      repo_workflow_attempts: { attempts: Array<Record<string, unknown>> };
    };
    const activeAttempt = attempts.repo_workflow_attempts.attempts[0]!;
    activeAttempt.state = "complete";
    activeAttempt.implementer_status = "done";
    activeAttempt.spec_review_status = "approved";
    activeAttempt.spec_reviewed_commit = currentHead;
    activeAttempt.quality_review_status = "approved";
    activeAttempt.quality_reviewed_commit = currentHead;
    activeAttempt.verification_result = "passed";
    activeAttempt.verification_head_commit = currentHead;
    activeAttempt.verified_at = "2026-03-25T15:00:00.000Z";
    activeAttempt.docs_reconciled = false;
    await writeFile(attemptsPath, stringify(attempts), "utf8");
    await git(repoDir, ["add", "docs/repo-workflow/attempts.yaml"]);
    await git(repoDir, ["commit", "-m", "Leave complete attempt unreconciled"]);

    const result = await validateRepoWorkflow(repoDir);

    assert.equal(result.ok, false);
    assert.equal(result.code, "invalid_state");
    assert.match(result.message, /docs_reconciled: true/i);
  } finally {
    await removeTempDir(repoDir);
  }
});

test("validateRepoWorkflow fails when the active attempt snapshot is impossible for its state", async () => {
  const repoDir = await createValidRepoWorkflowRepo();

  try {
    const attemptsPath = join(repoDir, "docs", "repo-workflow", "attempts.yaml");
    const attempts = parse(await readFile(attemptsPath, "utf8")) as {
      repo_workflow_attempts: { attempts: Array<Record<string, unknown>> };
    };
    const activeAttempt = attempts.repo_workflow_attempts.attempts[0]!;
    activeAttempt.state = "ready";
    activeAttempt.implementer_status = "done";
    await writeFile(attemptsPath, stringify(attempts), "utf8");
    await git(repoDir, ["add", "docs/repo-workflow/attempts.yaml"]);
    await git(repoDir, ["commit", "-m", "Use impossible active attempt snapshot"]);

    const result = await validateRepoWorkflow(repoDir);

    assert.equal(result.ok, false);
    assert.equal(result.code, "invalid_state");
    assert.match(result.message, /state 'ready'/i);
    assert.match(result.message, /implementer_status 'done'/i);
  } finally {
    await removeTempDir(repoDir);
  }
});

test("validateRepoWorkflow accepts a terminal complete campaign with null active ids", async () => {
  const repoDir = await createValidRepoWorkflowRepo();

  try {
    const campaignPath = join(repoDir, "docs", "repo-workflow", "campaign.yaml");
    const chunksPath = join(repoDir, "docs", "repo-workflow", "chunks.yaml");
    const currentStatePath = join(repoDir, "docs", "current-state.md");
    const nextStepsPath = join(repoDir, "docs", "next-steps.md");
    const attemptsPath = join(repoDir, "docs", "repo-workflow", "attempts.yaml");

    const campaign = parse(await readFile(campaignPath, "utf8")) as {
      repo_workflow_campaign: Record<string, unknown>;
    };
    campaign.repo_workflow_campaign.campaign_state = "complete";
    campaign.repo_workflow_campaign.active_chunk_id = null;
    campaign.repo_workflow_campaign.active_attempt_id = null;
    await writeFile(campaignPath, stringify(campaign), "utf8");

    const chunks = parse(await readFile(chunksPath, "utf8")) as {
      repo_workflow_chunks: Record<string, unknown>;
    };
    chunks.repo_workflow_chunks.manifest_state = "complete";
    await writeFile(chunksPath, stringify(chunks), "utf8");

    const attempts = parse(await readFile(attemptsPath, "utf8")) as {
      repo_workflow_attempts: { attempts: Array<Record<string, unknown>> };
    };
    attempts.repo_workflow_attempts.attempts.push({
      attempt_id: CLOSEOUT_ATTEMPT_ID,
      chunk_id: CLOSEOUT_CHUNK_ID,
      attempt_number: 1,
      state: "complete",
      blocked_reason: "none",
      implementer_status: "done",
      spec_review_status: "approved",
      spec_reviewed_commit: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      quality_review_status: "approved",
      quality_reviewed_commit: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      verification_result: "passed",
      verification_head_commit: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      verified_at: "2026-03-25T19:00:00.000Z",
      docs_reconciled: true,
      proof_status: "recorded",
      proof_summary: "Closeout proof was recorded before campaign completion.",
      proof_verification_command: "npm run check",
      proof_commands: ["npm run check"],
      proof_head_commit: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      proof_recorded_at: "2026-03-25T19:05:00.000Z",
      summary: "Historical closeout proof exists before campaign completion.",
      notes: ""
    });
    await writeFile(attemptsPath, stringify(attempts), "utf8");

    const currentState = await readFile(currentStatePath, "utf8");
    await writeFile(currentStatePath, currentState.replace(`  active_chunk_id: ${ACTIVE_CHUNK_ID}\n`, ""), "utf8");

    const nextSteps = await readFile(nextStepsPath, "utf8");
    await writeFile(nextStepsPath, nextSteps.replace(`  active_chunk_id: ${ACTIVE_CHUNK_ID}\n`, ""), "utf8");

    await git(
      repoDir,
      ["add", "docs/repo-workflow/campaign.yaml", "docs/repo-workflow/chunks.yaml", "docs/repo-workflow/attempts.yaml", "docs/current-state.md", "docs/next-steps.md"]
    );
    await git(repoDir, ["commit", "-m", "Complete terminal campaign fixture"]);

    const result = await validateRepoWorkflow(repoDir);

    if (!result.ok) {
      assert.fail(`expected validation success, got ${result.code}: ${result.message}`);
    }

    assert.equal(result.campaign.campaignState, "complete");
    assert.equal(result.campaign.activeChunkId, null);
    assert.equal(result.activeAttempt, null);
  } finally {
    await removeTempDir(repoDir);
  }
});

test("validateRepoWorkflow accepts a blocked doc-reconciliation attempt after HEAD-reset review currency", async () => {
  const repoDir = await createValidRepoWorkflowRepo();

  try {
    const attemptsPath = join(repoDir, "docs", "repo-workflow", "attempts.yaml");
    const attempts = parse(await readFile(attemptsPath, "utf8")) as {
      repo_workflow_attempts: { attempts: Array<Record<string, unknown>> };
    };
    const activeAttempt = attempts.repo_workflow_attempts.attempts[0]!;
    activeAttempt.state = "blocked";
    activeAttempt.blocked_reason = "doc-reconciliation";
    activeAttempt.implementer_status = "done";
    activeAttempt.spec_review_status = "not-started";
    activeAttempt.spec_reviewed_commit = null;
    activeAttempt.quality_review_status = "not-started";
    activeAttempt.quality_reviewed_commit = null;
    activeAttempt.verification_result = "not-run";
    activeAttempt.verification_head_commit = null;
    activeAttempt.verified_at = null;
    activeAttempt.docs_reconciled = false;
    await writeFile(attemptsPath, stringify(attempts), "utf8");
    await git(repoDir, ["add", "docs/repo-workflow/attempts.yaml"]);
    await git(repoDir, ["commit", "-m", "Use stale blocked doc reconciliation attempt"]);

    const result = await validateRepoWorkflow(repoDir);

    if (!result.ok) {
      assert.fail(`expected validation success, got ${result.code}: ${result.message}`);
    }

    const resultAttempt = result.activeAttempt;
    if (resultAttempt === null) {
      assert.fail("expected an active attempt for blocked campaign state");
    }
    assert.equal(resultAttempt.state, "blocked");
    assert.equal(resultAttempt.blockedReason, "doc-reconciliation");
  } finally {
    await removeTempDir(repoDir);
  }
});

test("validateRepoWorkflow fails when a terminal chunk remains active after its attempt completes", async () => {
  const repoDir = await createValidRepoWorkflowRepo();

  try {
    const currentHead = await git(repoDir, ["rev-parse", "HEAD"]);
    const chunksPath = join(repoDir, "docs", "repo-workflow", "chunks.yaml");
    const chunks = parse(await readFile(chunksPath, "utf8")) as {
      repo_workflow_chunks: { chunks: Array<Record<string, unknown>> };
    };
    chunks.repo_workflow_chunks.chunks = [
      {
        chunk_id: ACTIVE_CHUNK_ID,
        next_chunk_id: null,
        objective: "implement-milestone-proof-gate",
        scope: "repo-workflow-proof-gate",
        done_condition: "proof-gate-schema-validator-and-tests-landed",
        verification_command: "node --import tsx --test src/repo-workflow/validator.test.ts src/repo-workflow/cli.test.ts",
        proof_gate: "not-required",
        owner_role: "controller"
      }
    ];
    await writeFile(chunksPath, stringify(chunks), "utf8");

    const attemptsPath = join(repoDir, "docs", "repo-workflow", "attempts.yaml");
    const attempts = parse(await readFile(attemptsPath, "utf8")) as {
      repo_workflow_attempts: { attempts: Array<Record<string, unknown>> };
    };
    const activeAttempt = attempts.repo_workflow_attempts.attempts[0]!;
    activeAttempt.state = "complete";
    activeAttempt.implementer_status = "done";
    activeAttempt.spec_review_status = "approved";
    activeAttempt.spec_reviewed_commit = currentHead;
    activeAttempt.quality_review_status = "approved";
    activeAttempt.quality_reviewed_commit = currentHead;
    activeAttempt.verification_result = "passed";
    activeAttempt.verification_head_commit = currentHead;
    activeAttempt.verified_at = "2026-03-25T16:00:00.000Z";
    activeAttempt.docs_reconciled = true;
    await writeFile(attemptsPath, stringify(attempts), "utf8");
    await git(repoDir, ["add", "docs/repo-workflow/chunks.yaml", "docs/repo-workflow/attempts.yaml"]);
    await git(repoDir, ["commit", "-m", "Leave terminal chunk active after completion"]);

    const result = await validateRepoWorkflow(repoDir);

    assert.equal(result.ok, false);
    assert.equal(result.code, "invalid_state");
    assert.match(result.message, /terminal chunk/i);
    assert.match(result.message, /advance campaign_state to 'complete'/i);
  } finally {
    await removeTempDir(repoDir);
  }
});

test("validateRepoWorkflow accepts an execution-failure block before review starts", async () => {
  const repoDir = await createValidRepoWorkflowRepo();

  try {
    const attemptsPath = join(repoDir, "docs", "repo-workflow", "attempts.yaml");
    const attempts = parse(await readFile(attemptsPath, "utf8")) as {
      repo_workflow_attempts: { attempts: Array<Record<string, unknown>> };
    };
    const activeAttempt = attempts.repo_workflow_attempts.attempts[0]!;
    activeAttempt.state = "blocked";
    activeAttempt.blocked_reason = "execution-failure";
    activeAttempt.implementer_status = "blocked";
    activeAttempt.spec_review_status = "not-started";
    activeAttempt.spec_reviewed_commit = null;
    activeAttempt.quality_review_status = "not-started";
    activeAttempt.quality_reviewed_commit = null;
    activeAttempt.verification_result = "not-run";
    activeAttempt.verification_head_commit = null;
    activeAttempt.verified_at = null;
    activeAttempt.docs_reconciled = false;
    await writeFile(attemptsPath, stringify(attempts), "utf8");
    await git(repoDir, ["add", "docs/repo-workflow/attempts.yaml"]);
    await git(repoDir, ["commit", "-m", "Use pre-review execution failure block"]);

    const result = await validateRepoWorkflow(repoDir);

    if (!result.ok) {
      assert.fail(`expected validation success, got ${result.code}: ${result.message}`);
    }

    const resultAttempt = result.activeAttempt;
    if (resultAttempt === null) {
      assert.fail("expected an active attempt for blocked campaign state");
    }
    assert.equal(resultAttempt.state, "blocked");
    assert.equal(resultAttempt.blockedReason, "execution-failure");
  } finally {
    await removeTempDir(repoDir);
  }
});

async function createValidRepoWorkflowRepo(): Promise<string> {
  const repoDir = await createTempGitRepo("switchyard-repo-workflow-");

  await writeFixtureFiles(repoDir);
  await git(repoDir, ["add", "."]);
  await git(repoDir, ["commit", "-m", "Add repo workflow fixture"]);

  return repoDir;
}

async function writeFixtureFiles(repoDir: string): Promise<void> {
  const docsDir = join(repoDir, "docs");
  const repoWorkflowDir = join(docsDir, "repo-workflow");
  await mkdir(repoWorkflowDir, { recursive: true });

  const startupDocs = new Map<string, string>([
    [
      "AGENTS.md",
      ["# AGENTS", "", STARTUP_MARKER, "", "Use canonical repo-workflow YAML for active development state."].join("\n")
    ],
    [
      "PLAN.md",
      ["# Plan", "", STARTUP_MARKER, "", "Product policy lives here; active repo workflow state lives in docs/repo-workflow/."].join(
        "\n"
      )
    ],
    [
      "docs/dev-workflow.md",
      ["# Dev Workflow", "", STARTUP_MARKER, "", "Read startup docs, then validate canonical repo-workflow state before resuming work."].join(
        "\n"
      )
    ],
    [
      "docs/current-state.md",
      [
        "# Current State",
        "",
        STARTUP_MARKER,
        "",
        projectionBlock({ includeActiveChunkId: true }),
        "",
        "Human-facing projection of the canonical repo-workflow state."
      ].join("\n")
    ],
    [
      "docs/next-steps.md",
      [
        "# Next Steps",
        "",
        STARTUP_MARKER,
        "",
        projectionBlock({ includeActiveChunkId: true }),
        "",
        "Next repo-workflow bundle is whatever the canonical chunk manifest marks active."
      ].join("\n")
    ],
    [
      "docs/focus-tracker.md",
      [
        "# Focus Tracker",
        "",
        STARTUP_MARKER,
        "",
        projectionBlock({ includeActiveChunkId: false }),
        "",
        "Repo-workflow focus is derived from the canonical YAML control plane."
      ].join("\n")
    ],
    [
      "docs/backlog.md",
      ["# Backlog", "", STARTUP_MARKER, "", "Product-policy context only; not a repo-workflow state owner."].join("\n")
    ],
    [
      "docs/roadmap.md",
      ["# Roadmap", "", STARTUP_MARKER, "", "Product-policy context only; not a repo-workflow state owner."].join("\n")
    ],
    [
      "docs/milestones.md",
      ["# Milestones", "", STARTUP_MARKER, "", milestonesBlock(), "", "## Active Milestone", "", "M7"].join("\n")
    ]
  ]);

  for (const [relativePath, contents] of startupDocs) {
    const absolutePath = join(repoDir, relativePath);
    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, `${contents}\n`, "utf8");
  }

  await writeFile(
    join(repoWorkflowDir, "campaign.yaml"),
    stringify({
      repo_workflow_campaign: {
        schema_version: 1,
        campaign_id: CAMPAIGN_ID,
        bundle_id: BUNDLE_ID,
        product_milestone_id: PRODUCT_MILESTONE_ID,
        campaign_state: "active",
        active_chunk_id: ACTIVE_CHUNK_ID,
        active_attempt_id: ACTIVE_ATTEMPT_ID,
        branch_ref: "refs/heads/main",
        baseline_command: "npm run check",
        slice_ledger: {
          disposition: "pending",
          row_ref: null
        },
        last_updated: "2026-03-25"
      }
    }),
    "utf8"
  );

  await writeFile(
    join(repoWorkflowDir, "chunks.yaml"),
    stringify({
      repo_workflow_chunks: {
        schema_version: 1,
        campaign_id: CAMPAIGN_ID,
        bundle_id: BUNDLE_ID,
        manifest_state: "active",
        chunks: [
          {
            chunk_id: ACTIVE_CHUNK_ID,
            next_chunk_id: CLOSEOUT_CHUNK_ID,
            objective: "implement-milestone-proof-gate",
            scope: "repo-workflow-proof-gate",
            done_condition: "proof-gate-schema-validator-and-tests-landed",
            verification_command: "node --import tsx --test src/repo-workflow/validator.test.ts src/repo-workflow/cli.test.ts",
            proof_gate: "not-required",
            owner_role: "controller"
          },
          {
            chunk_id: CLOSEOUT_CHUNK_ID,
            next_chunk_id: FOLLOW_UP_CHUNK_ID,
            objective: "verify-proof-gate-closeout",
            scope: "repo-workflow-proof-gate-closeout",
            done_condition: "milestone-proof-recorded-and-next-task-may-begin",
            verification_command: "npm run check",
            proof_gate: "required",
            owner_role: "controller"
          },
          {
            chunk_id: FOLLOW_UP_CHUNK_ID,
            next_chunk_id: null,
            objective: "add-pr-lifecycle-and-auto-merge-policy",
            scope: "repo-workflow-next-slice",
            done_condition: "next-repo-workflow-slice-is-specified-and-ready",
            verification_command: "npm run check",
            proof_gate: "not-required",
            owner_role: "controller"
          }
        ],
        last_updated: "2026-03-25"
      }
    }),
    "utf8"
  );

  await writeFile(
    join(repoWorkflowDir, "attempts.yaml"),
    stringify({
      repo_workflow_attempts: {
        schema_version: 1,
        campaign_id: CAMPAIGN_ID,
        attempts: [
          {
            attempt_id: ACTIVE_ATTEMPT_ID,
            chunk_id: ACTIVE_CHUNK_ID,
            attempt_number: 1,
            state: "ready",
            blocked_reason: "none",
            implementer_status: "not-started",
            spec_review_status: "not-started",
            spec_reviewed_commit: null,
            quality_review_status: "not-started",
            quality_reviewed_commit: null,
            verification_result: "not-run",
            verification_head_commit: null,
            verified_at: null,
            docs_reconciled: false,
            proof_status: "not-required",
            proof_summary: "",
            proof_verification_command: null,
            proof_commands: [],
            proof_head_commit: null,
            proof_recorded_at: null,
            summary: "",
            notes: ""
          }
        ],
        last_updated: "2026-03-25"
      }
    }),
    "utf8"
  );

  await writeFile(
    join(docsDir, "slice-ledger.md"),
    [
      "# Slice Ledger",
      "",
      "| SEQ | DATE | SLUG | SUMMARY | ARTIFACTS | NOTES |",
      "| --- | --- | --- | --- | --- | --- |",
      "| S09 | 2026-03-11 | run-tracking-control-plane | Existing implementation row. | PR #69 | Fixture row for repo-workflow validation tests. |"
    ].join("\n"),
    "utf8"
  );
}

function projectionBlock({ includeActiveChunkId }: { includeActiveChunkId: boolean }): string {
  const lines = [
    "<!-- repo-workflow-projection:start -->",
    "```yaml",
    "repo_workflow_projection:",
    "  schema_version: 1",
    `  active_repo_campaign_id: ${CAMPAIGN_ID}`,
    `  active_bundle_id: ${BUNDLE_ID}`
  ];

  if (includeActiveChunkId) {
    lines.push(`  active_chunk_id: ${ACTIVE_CHUNK_ID}`);
  }

  lines.push("  last_updated: 2026-03-25", "```", "<!-- repo-workflow-projection:end -->");

  return lines.join("\n");
}

function milestonesBlock(): string {
  return [
    "<!-- repo-workflow-milestones:start -->",
    "```yaml",
    "repo_workflow_milestones:",
    `  - milestone_id: ${PRODUCT_MILESTONE_ID}`,
    "    title: lead-host-recovery-and-stop-policy",
    "```",
    "<!-- repo-workflow-milestones:end -->"
  ].join("\n");
}

async function switchActiveChunk(repoDir: string, chunkId: string, attemptId: string): Promise<void> {
  const campaignPath = join(repoDir, "docs", "repo-workflow", "campaign.yaml");
  const campaign = parse(await readFile(campaignPath, "utf8")) as {
    repo_workflow_campaign: Record<string, unknown>;
  };
  campaign.repo_workflow_campaign.active_chunk_id = chunkId;
  campaign.repo_workflow_campaign.active_attempt_id = attemptId;
  await writeFile(campaignPath, stringify(campaign), "utf8");

  for (const relativePath of ["docs/current-state.md", "docs/next-steps.md"]) {
    const absolutePath = join(repoDir, relativePath);
    const contents = await readFile(absolutePath, "utf8");
    await writeFile(absolutePath, contents.replace(`  active_chunk_id: ${ACTIVE_CHUNK_ID}`, `  active_chunk_id: ${chunkId}`), "utf8");
  }
}
