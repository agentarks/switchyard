import test from "node:test";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { determineCleanupDecision } from "./cleanup.js";
import type { SessionRecord } from "./types.js";
import { createTempGitRepo, git, removeTempDir } from "../test-helpers/git.js";

test("determineCleanupDecision fails closed when preserved worktree dirtiness cannot be inspected", async () => {
  const repoDir = await createTempGitRepo("switchyard-cleanup-command-test-");
  const worktreePath = join(repoDir, "TASK_RESULT.md");
  const session: SessionRecord = {
    id: "session-cleanup-inspect-failure",
    agentName: "agent-cleanup-inspect-failure",
    branch: "agents/cleanup-inspect-failure",
    baseBranch: "main",
    worktreePath,
    state: "stopped",
    runtimePid: null,
    createdAt: "2026-03-13T12:00:00.000Z",
    updatedAt: "2026-03-13T12:00:00.000Z"
  };

  try {
    await git(repoDir, ["branch", session.branch]);
    await writeFile(worktreePath, "uncommitted output\n", "utf8");

    const decision = await determineCleanupDecision({
      projectRoot: repoDir,
      canonicalBranch: "main",
      session
    });

    assert.equal(decision.kind, "blocked");
    assert.equal(decision.reason, "worktree_inspection_failed");
    assert.equal(decision.canonicalBranch, "main");
    assert.equal(
      decision.message,
      `Refusing cleanup for ${session.agentName}: failed to inspect preserved worktree 'TASK_RESULT.md' for uncommitted entries. Resolve that inspection failure first, rerun without '--cleanup' to preserve the worktree, or pass '--cleanup --abandon' to discard it explicitly.`
    );
    assert.equal(decision.details?.worktreePath, "TASK_RESULT.md");
    assert.match(String(decision.details?.errorMessage), /ENOTDIR/);
  } finally {
    await removeTempDir(repoDir);
  }
});
