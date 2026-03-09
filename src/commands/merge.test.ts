import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { buildDefaultConfig, writeConfig } from "../config.js";
import { listEvents } from "../events/store.js";
import { MergeError } from "../errors.js";
import { createSession } from "../sessions/store.js";
import { bootstrapSwitchyardLayout } from "../storage/bootstrap.js";
import { createTempGitRepo, git, removeTempDir } from "../test-helpers/git.js";
import { mergeCommand } from "./merge.js";

test("mergeCommand merges a stopped session branch into the canonical branch", async () => {
  const repoDir = await createInitializedRepo();
  const notesPath = join(repoDir, "notes.txt");
  const worktreePath = join(repoDir, ".switchyard", "worktrees", "agent-one");

  try {
    await writeFile(notesPath, "base\n", "utf8");
    await git(repoDir, ["add", "notes.txt"]);
    await git(repoDir, ["commit", "-m", "Add notes"]);
    await git(repoDir, ["switch", "-c", "agents/agent-one"]);
    await writeFile(notesPath, "agent change\n", "utf8");
    await git(repoDir, ["add", "notes.txt"]);
    await git(repoDir, ["commit", "-m", "Agent branch change"]);
    await git(repoDir, ["switch", "main"]);
    await git(repoDir, ["switch", "--detach"]);
    await git(repoDir, ["worktree", "add", worktreePath, "agents/agent-one"]);

    await createSession(repoDir, {
      id: "session-agent-one",
      agentName: "agent-one",
      branch: "agents/agent-one",
      baseBranch: "main",
      worktreePath,
      state: "stopped",
      runtimePid: null,
      createdAt: "2026-03-08T09:00:00.000Z",
      updatedAt: "2026-03-08T09:05:00.000Z"
    });

    const output = await captureStdout(async () => {
      await mergeCommand({
        selector: "Agent One",
        startDir: repoDir
      });
    });

    assert.match(output, /Merged agent-one into main/);
    assert.match(output, /Session: session-agent-one/);
    assert.match(output, /Branch: agents\/agent-one/);
    assert.match(output, /sy stop session-agent-one --cleanup/);
    assert.equal(await git(repoDir, ["branch", "--show-current"]), "main");
    assert.equal(await readFile(notesPath, "utf8"), "agent change\n");

    const mergeParents = await git(repoDir, ["rev-list", "--parents", "-n", "1", "HEAD"]);
    assert.equal(mergeParents.trim().split(/\s+/).length, 3);

    const events = await listEvents(repoDir, { sessionId: "session-agent-one" });
    assert.equal(events.length, 1);
    assert.equal(events[0]?.eventType, "merge.completed");
    assert.equal(events[0]?.payload.branch, "agents/agent-one");
    assert.equal(events[0]?.payload.canonicalBranch, "main");
  } finally {
    await removeTempDir(repoDir);
  }
});

test("mergeCommand rejects selectors that match different sessions by id and agent name", async () => {
  const repoDir = await createInitializedRepo();

  try {
    await createSession(repoDir, {
      id: "shared-name",
      agentName: "other-agent",
      branch: "agents/other-agent",
      worktreePath: join(repoDir, ".switchyard", "worktrees", "other-agent"),
      state: "stopped",
      runtimePid: null,
      createdAt: "2026-03-08T12:00:00.000Z",
      updatedAt: "2026-03-08T12:00:00.000Z"
    });
    await createSession(repoDir, {
      id: "session-shared-agent",
      agentName: "shared-name",
      branch: "agents/shared-name",
      worktreePath: join(repoDir, ".switchyard", "worktrees", "shared-name"),
      state: "stopped",
      runtimePid: null,
      createdAt: "2026-03-08T12:05:00.000Z",
      updatedAt: "2026-03-08T12:05:00.000Z"
    });

    await assert.rejects(
      () => mergeCommand({ selector: "shared-name", startDir: repoDir }),
      (error: unknown) => {
        assert.ok(error instanceof MergeError);
        assert.match(
          error.message,
          /Selector 'shared-name' is ambiguous: it matches session 'shared-name' by id and session 'session-shared-agent' by agent name\./
        );
        return true;
      }
    );
  } finally {
    await removeTempDir(repoDir);
  }
});

test("mergeCommand rejects selectors that match multiple sessions by agent name", async () => {
  const repoDir = await createInitializedRepo();

  try {
    await createSession(repoDir, {
      id: "session-latest",
      agentName: "shared-agent",
      branch: "agents/shared-agent",
      worktreePath: join(repoDir, ".switchyard", "worktrees", "shared-agent-latest"),
      state: "stopped",
      runtimePid: null,
      createdAt: "2026-03-08T12:05:00.000Z",
      updatedAt: "2026-03-08T12:10:00.000Z"
    });
    await createSession(repoDir, {
      id: "session-earlier",
      agentName: "shared-agent",
      branch: "agents/shared-agent",
      worktreePath: join(repoDir, ".switchyard", "worktrees", "shared-agent-earlier"),
      state: "stopped",
      runtimePid: null,
      createdAt: "2026-03-08T12:00:00.000Z",
      updatedAt: "2026-03-08T12:00:00.000Z"
    });

    await assert.rejects(
      () => mergeCommand({ selector: "shared-agent", startDir: repoDir }),
      (error: unknown) => {
        assert.ok(error instanceof MergeError);
        assert.equal(
          error.message,
          "Selector 'shared-agent' is ambiguous: it matches multiple sessions by agent name ('session-latest', 'session-earlier'). Use an exact session id from 'sy status'."
        );
        return true;
      }
    );
  } finally {
    await removeTempDir(repoDir);
  }
});

test("mergeCommand refuses to merge an active session", async () => {
  const repoDir = await createInitializedRepo();

  try {
    await createSession(repoDir, {
      id: "session-running",
      agentName: "agent-running",
      branch: "agents/agent-running",
      worktreePath: join(repoDir, ".switchyard", "worktrees", "agent-running"),
      state: "running",
      runtimePid: 4242,
      createdAt: "2026-03-08T09:00:00.000Z",
      updatedAt: "2026-03-08T09:00:00.000Z"
    });

    await assert.rejects(async () => {
      await mergeCommand({
        selector: "agent-running",
        startDir: repoDir
      });
    }, /Stop it before merging/);
  } finally {
    await removeTempDir(repoDir);
  }
});

test("mergeCommand refuses to retarget a preserved session when canonical config drifted", async () => {
  const repoDir = await createInitializedRepo();
  const worktreePath = join(repoDir, ".switchyard", "worktrees", "agent-drift");

  try {
    await createBranchFromMain(repoDir, "agents/agent-drift", "drift.txt", "agent branch\n", "Agent drift branch");
    await git(repoDir, ["branch", "release"]);
    await git(repoDir, ["worktree", "add", worktreePath, "agents/agent-drift"]);
    await createSession(repoDir, {
      id: "session-drift",
      agentName: "agent-drift",
      branch: "agents/agent-drift",
      baseBranch: "main",
      worktreePath,
      state: "stopped",
      runtimePid: null,
      createdAt: "2026-03-08T09:00:00.000Z",
      updatedAt: "2026-03-08T09:12:00.000Z"
    });
    await writeConfig(buildDefaultConfig(repoDir, "switchyard-test", "release"));

    await assert.rejects(async () => {
      await mergeCommand({
        selector: "agent-drift",
        startDir: repoDir
      });
    }, /created against 'main'.*configured to merge into 'release'/);
  } finally {
    await removeTempDir(repoDir);
  }
});

test("mergeCommand refuses legacy sessions without stored base branch metadata", async () => {
  const repoDir = await createInitializedRepo();
  const worktreePath = join(repoDir, ".switchyard", "worktrees", "agent-legacy-target");

  try {
    await createBranchFromMain(
      repoDir,
      "agents/agent-legacy-target",
      "legacy.txt",
      "agent branch\n",
      "Agent legacy target branch"
    );
    await git(repoDir, ["worktree", "add", worktreePath, "agents/agent-legacy-target"]);
    await createSession(repoDir, {
      id: "session-legacy-target",
      agentName: "agent-legacy-target",
      branch: "agents/agent-legacy-target",
      worktreePath,
      state: "stopped",
      runtimePid: null,
      createdAt: "2026-03-08T09:00:00.000Z",
      updatedAt: "2026-03-08T09:14:00.000Z"
    });

    await assert.rejects(async () => {
      await mergeCommand({
        selector: "agent-legacy-target",
        startDir: repoDir
      });
    }, /no stored base branch metadata.*merge manually with git/);
  } finally {
    await removeTempDir(repoDir);
  }
});

test("mergeCommand refuses to run when the canonical worktree is dirty", async () => {
  const repoDir = await createInitializedRepo();
  const trackedPath = join(repoDir, "tracked.txt");
  const worktreePath = join(repoDir, ".switchyard", "worktrees", "agent-dirty");

  try {
    await createBranchFromMain(repoDir, "agents/agent-dirty", "dirty.txt", "agent branch\n", "Agent dirty branch");
    await writeFile(trackedPath, "base\n", "utf8");
    await git(repoDir, ["add", "tracked.txt"]);
    await git(repoDir, ["commit", "-m", "Add tracked file"]);
    await git(repoDir, ["worktree", "add", worktreePath, "agents/agent-dirty"]);
    await createSession(repoDir, {
      id: "session-dirty",
      agentName: "agent-dirty",
      branch: "agents/agent-dirty",
      baseBranch: "main",
      worktreePath,
      state: "stopped",
      runtimePid: null,
      createdAt: "2026-03-08T09:00:00.000Z",
      updatedAt: "2026-03-08T09:10:00.000Z"
    });
    await writeFile(trackedPath, "dirty\n", "utf8");

    await assert.rejects(
      async () => {
        await mergeCommand({
          selector: "session-dirty",
          startDir: repoDir
        });
      },
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /Canonical branch worktree is not clean/);
        assert.match(error.message, /Resolve these repo-root entries before merging:  M tracked\.txt\./);
        return true;
      }
    );
  } finally {
    await removeTempDir(repoDir);
  }
});

test("mergeCommand refuses to merge when the preserved worktree has uncommitted changes", async () => {
  const repoDir = await createInitializedRepo();
  const worktreePath = join(repoDir, ".switchyard", "worktrees", "agent-worktree-dirty");

  try {
    await createBranchFromMain(
      repoDir,
      "agents/agent-worktree-dirty",
      "feature.txt",
      "agent branch\n",
      "Agent dirty worktree branch"
    );
    await git(repoDir, ["worktree", "add", worktreePath, "agents/agent-worktree-dirty"]);
    await writeFile(join(worktreePath, "feature.txt"), "changed but not committed\n", "utf8");

    await createSession(repoDir, {
      id: "session-worktree-dirty",
      agentName: "agent-worktree-dirty",
      branch: "agents/agent-worktree-dirty",
      baseBranch: "main",
      worktreePath,
      state: "stopped",
      runtimePid: null,
      createdAt: "2026-03-08T09:00:00.000Z",
      updatedAt: "2026-03-08T09:15:00.000Z"
    });

    await assert.rejects(
      async () => {
        await mergeCommand({
          selector: "agent-worktree-dirty",
          startDir: repoDir
        });
      },
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /Preserved worktree.*not clean/);
        assert.match(error.message, /Resolve these entries there before merging:  M feature\.txt\./);
        return true;
      }
    );
  } finally {
    await removeTempDir(repoDir);
  }
});

test("mergeCommand refuses to merge when session.worktreePath is not an actual git worktree", async () => {
  const repoDir = await createInitializedRepo();
  const worktreePath = join(repoDir, ".switchyard", "worktrees", "agent-replaced-worktree");

  try {
    await createBranchFromMain(
      repoDir,
      "agents/agent-replaced-worktree",
      "feature.txt",
      "agent branch\n",
      "Agent replaced worktree branch"
    );
    await mkdir(worktreePath, { recursive: true });
    await writeFile(join(worktreePath, "draft.txt"), "plain directory\n", "utf8");

    await createSession(repoDir, {
      id: "session-replaced-worktree",
      agentName: "agent-replaced-worktree",
      branch: "agents/agent-replaced-worktree",
      baseBranch: "main",
      worktreePath,
      state: "stopped",
      runtimePid: null,
      createdAt: "2026-03-08T09:00:00.000Z",
      updatedAt: "2026-03-08T09:18:00.000Z"
    });

    await assert.rejects(async () => {
      await mergeCommand({
        selector: "agent-replaced-worktree",
        startDir: repoDir
      });
    }, /not a git worktree rooted at/);
  } finally {
    await removeTempDir(repoDir);
  }
});

test("mergeCommand surfaces merge conflicts and records a failed merge event", async () => {
  const repoDir = await createInitializedRepo();
  const conflictPath = join(repoDir, "conflict.txt");
  const worktreePath = join(repoDir, ".switchyard", "worktrees", "agent-conflict");

  try {
    await writeFile(conflictPath, "shared\n", "utf8");
    await git(repoDir, ["add", "conflict.txt"]);
    await git(repoDir, ["commit", "-m", "Add conflict base"]);
    await git(repoDir, ["switch", "-c", "agents/agent-conflict"]);
    await writeFile(conflictPath, "agent version\n", "utf8");
    await git(repoDir, ["add", "conflict.txt"]);
    await git(repoDir, ["commit", "-m", "Agent conflict change"]);
    await git(repoDir, ["switch", "main"]);
    await writeFile(conflictPath, "main version\n", "utf8");
    await git(repoDir, ["add", "conflict.txt"]);
    await git(repoDir, ["commit", "-m", "Main conflict change"]);
    await git(repoDir, ["worktree", "add", worktreePath, "agents/agent-conflict"]);

    await createSession(repoDir, {
      id: "session-conflict",
      agentName: "agent-conflict",
      branch: "agents/agent-conflict",
      baseBranch: "main",
      worktreePath,
      state: "stopped",
      runtimePid: null,
      createdAt: "2026-03-08T09:00:00.000Z",
      updatedAt: "2026-03-08T09:20:00.000Z"
    });

    await assert.rejects(async () => {
      await mergeCommand({
        selector: "agent-conflict",
        startDir: repoDir
      });
    }, /git merge --abort/);

    assert.ok((await git(repoDir, ["rev-parse", "--verify", "MERGE_HEAD"])).length > 0);

    const events = await listEvents(repoDir, { sessionId: "session-conflict" });
    assert.equal(events.length, 1);
    assert.equal(events[0]?.eventType, "merge.failed");
    assert.equal(events[0]?.payload.reason, "merge_conflict");
    assert.equal(events[0]?.payload.branch, "agents/agent-conflict");
  } finally {
    await removeTempDir(repoDir);
  }
});

test("mergeCommand reports already-integrated branches without recording merge.completed", async () => {
  const repoDir = await createInitializedRepo();
  const notesPath = join(repoDir, "notes.txt");
  const worktreePath = join(repoDir, ".switchyard", "worktrees", "agent-repeat");

  try {
    await writeFile(notesPath, "base\n", "utf8");
    await git(repoDir, ["add", "notes.txt"]);
    await git(repoDir, ["commit", "-m", "Add notes"]);
    await git(repoDir, ["switch", "-c", "agents/agent-repeat"]);
    await writeFile(notesPath, "agent change\n", "utf8");
    await git(repoDir, ["add", "notes.txt"]);
    await git(repoDir, ["commit", "-m", "Agent repeat change"]);
    await git(repoDir, ["switch", "main"]);
    await git(repoDir, ["worktree", "add", worktreePath, "agents/agent-repeat"]);

    await createSession(repoDir, {
      id: "session-repeat",
      agentName: "agent-repeat",
      branch: "agents/agent-repeat",
      baseBranch: "main",
      worktreePath,
      state: "stopped",
      runtimePid: null,
      createdAt: "2026-03-08T09:00:00.000Z",
      updatedAt: "2026-03-08T09:25:00.000Z"
    });

    await mergeCommand({
      selector: "agent-repeat",
      startDir: repoDir
    });

    const firstMergeHead = await git(repoDir, ["rev-parse", "HEAD"]);
    const output = await captureStdout(async () => {
      await mergeCommand({
        selector: "session-repeat",
        startDir: repoDir
      });
    });

    assert.match(output, /already merged into main/);
    assert.equal(await git(repoDir, ["rev-parse", "HEAD"]), firstMergeHead);

    const events = await listEvents(repoDir, { sessionId: "session-repeat" });
    assert.equal(events.length, 2);
    assert.equal(events[0]?.eventType, "merge.completed");
    assert.equal(events[1]?.eventType, "merge.skipped");
    assert.equal(events[1]?.payload.reason, "already_up_to_date");
  } finally {
    await removeTempDir(repoDir);
  }
});

async function createInitializedRepo(): Promise<string> {
  const repoDir = await createTempGitRepo("switchyard-merge-command-test-");
  await bootstrapSwitchyardLayout(repoDir);
  await writeConfig(buildDefaultConfig(repoDir, "switchyard-test", "main"));
  return repoDir;
}

async function createBranchFromMain(
  repoDir: string,
  branch: string,
  fileName: string,
  contents: string,
  commitMessage: string
): Promise<void> {
  await git(repoDir, ["switch", "-c", branch]);
  await writeFile(join(repoDir, fileName), contents, "utf8");
  await git(repoDir, ["add", fileName]);
  await git(repoDir, ["commit", "-m", commitMessage]);
  await git(repoDir, ["switch", "main"]);
}

async function captureStdout(callback: () => Promise<void>): Promise<string> {
  const writes: string[] = [];
  const originalWrite = process.stdout.write.bind(process.stdout);

  process.stdout.write = ((chunk: string | Uint8Array) => {
    writes.push(typeof chunk === "string" ? chunk : chunk.toString());
    return true;
  }) as typeof process.stdout.write;

  try {
    await callback();
  } finally {
    process.stdout.write = originalWrite;
  }

  return writes.join("");
}
