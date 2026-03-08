import test from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { buildDefaultConfig, writeConfig } from "../config.js";
import { listEvents } from "../events/store.js";
import { createSession } from "../sessions/store.js";
import { bootstrapSwitchyardLayout } from "../storage/bootstrap.js";
import { createTempGitRepo, git, removeTempDir } from "../test-helpers/git.js";
import { mergeCommand } from "./merge.js";

test("mergeCommand merges a stopped session branch into the canonical branch", async () => {
  const repoDir = await createInitializedRepo();
  const notesPath = join(repoDir, "notes.txt");

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

    await createSession(repoDir, {
      id: "session-agent-one",
      agentName: "agent-one",
      branch: "agents/agent-one",
      worktreePath: join(repoDir, ".switchyard", "worktrees", "agent-one"),
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

test("mergeCommand refuses to run when the canonical worktree is dirty", async () => {
  const repoDir = await createInitializedRepo();

  try {
    await createBranchFromMain(repoDir, "agents/agent-dirty", "dirty.txt", "agent branch\n", "Agent dirty branch");
    await createSession(repoDir, {
      id: "session-dirty",
      agentName: "agent-dirty",
      branch: "agents/agent-dirty",
      worktreePath: join(repoDir, ".switchyard", "worktrees", "agent-dirty"),
      state: "stopped",
      runtimePid: null,
      createdAt: "2026-03-08T09:00:00.000Z",
      updatedAt: "2026-03-08T09:10:00.000Z"
    });
    await writeFile(join(repoDir, "uncommitted.txt"), "dirty\n", "utf8");

    await assert.rejects(async () => {
      await mergeCommand({
        selector: "session-dirty",
        startDir: repoDir
      });
    }, /Canonical branch worktree is not clean/);
  } finally {
    await removeTempDir(repoDir);
  }
});

test("mergeCommand surfaces merge conflicts and records a failed merge event", async () => {
  const repoDir = await createInitializedRepo();
  const conflictPath = join(repoDir, "conflict.txt");

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

    await createSession(repoDir, {
      id: "session-conflict",
      agentName: "agent-conflict",
      branch: "agents/agent-conflict",
      worktreePath: join(repoDir, ".switchyard", "worktrees", "agent-conflict"),
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
