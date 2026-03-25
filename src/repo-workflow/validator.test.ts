import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { parse, stringify } from "yaml";
import { createTempGitRepo, git, removeTempDir } from "../test-helpers/git.js";
import { validateRepoWorkflow } from "./validator.js";

const CAMPAIGN_ID = "rw-001";
const BUNDLE_ID = "repo-workflow-foundation";
const ACTIVE_CHUNK_ID = "c-001";
const ACTIVE_ATTEMPT_ID = "a-001";
const PRODUCT_MILESTONE_ID = "m7";
const STARTUP_MARKER = "repo-workflow-startup: repo-workflow-v1";

test("validateRepoWorkflow accepts a clean repo with matching startup docs, canonical YAML, projections, and milestone registry", async () => {
  const repoDir = await createValidRepoWorkflowRepo();

  try {
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
    await writeFile(currentStatePath, currentState.replace("active_chunk_id: c-001", "active_chunk_id: c-099"), "utf8");
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
    const chunksPath = join(repoDir, "docs", "repo-workflow", "chunks.yaml");
    const chunks = parse(await readFile(chunksPath, "utf8")) as {
      repo_workflow_chunks: { chunks: Array<Record<string, unknown>> };
    };
    chunks.repo_workflow_chunks.chunks[0]!.next_chunk_id = "c-002";
    chunks.repo_workflow_chunks.chunks.push({
      chunk_id: "c-002",
      next_chunk_id: null,
      objective: "follow-on-fixture-chunk",
      scope: "repo-workflow-fixture",
      done_condition: "stale-review-currency-test",
      verification_command: "npm run check",
      owner_role: "controller"
    });
    await writeFile(chunksPath, stringify(chunks), "utf8");

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
    await git(repoDir, ["add", "docs/repo-workflow/chunks.yaml", "docs/repo-workflow/attempts.yaml"]);
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

    const currentState = await readFile(currentStatePath, "utf8");
    await writeFile(currentStatePath, currentState.replace(`  active_chunk_id: ${ACTIVE_CHUNK_ID}\n`, ""), "utf8");

    const nextSteps = await readFile(nextStepsPath, "utf8");
    await writeFile(nextStepsPath, nextSteps.replace(`  active_chunk_id: ${ACTIVE_CHUNK_ID}\n`, ""), "utf8");

    await git(repoDir, ["add", "docs/repo-workflow/campaign.yaml", "docs/repo-workflow/chunks.yaml", "docs/current-state.md", "docs/next-steps.md"]);
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
    await git(repoDir, ["add", "docs/repo-workflow/attempts.yaml"]);
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
            next_chunk_id: null,
            objective: "freeze-control-plane-contract",
            scope: "repo-workflow-foundation",
            done_condition: "contract-and-validator-foundation-defined",
            verification_command: "node --import tsx --test src/repo-workflow/validator.test.ts src/repo-workflow/cli.test.ts",
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
