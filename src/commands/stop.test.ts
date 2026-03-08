import test from "node:test";
import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { join } from "node:path";
import { buildDefaultConfig, writeConfig } from "../config.js";
import { listSessions } from "../sessions/store.js";
import { bootstrapSwitchyardLayout } from "../storage/bootstrap.js";
import { createTempGitRepo, git, removeTempDir } from "../test-helpers/git.js";
import { slingCommand } from "./sling.js";
import { stopCommand } from "./stop.js";

test("stopCommand stops a running session and preserves the worktree by default", async () => {
  const repoDir = await createInitializedRepo();
  const writes: string[] = [];
  const originalWrite = process.stdout.write.bind(process.stdout);
  const worktreePath = join(repoDir, ".switchyard", "worktrees", "agent-one");

  try {
    await slingCommand({
      agentName: "Agent One",
      startDir: repoDir,
      spawnRuntime: async () => {
        return {
          pid: 4242,
          command: {
            command: "codex",
            args: []
          }
        };
      }
    });

    process.stdout.write = ((chunk: string | Uint8Array) => {
      writes.push(typeof chunk === "string" ? chunk : chunk.toString());
      return true;
    }) as typeof process.stdout.write;

    await stopCommand({
      selector: "agent-one",
      startDir: repoDir,
      isRuntimeAlive: (pid) => pid === 4242,
      stopRuntime: async (pid) => {
        assert.equal(pid, 4242);
        return true;
      }
    });

    await access(worktreePath);
    await git(repoDir, ["rev-parse", "--verify", "agents/agent-one"]);

    const sessions = await listSessions(repoDir);
    assert.equal(sessions[0]?.state, "stopped");
    assert.equal(sessions[0]?.runtimePid, null);
  } finally {
    process.stdout.write = originalWrite;
    await removeTempDir(repoDir);
  }

  const output = writes.join("");
  assert.match(output, /Stopped agent-one/);
  assert.match(output, /Worktree preserved: \.switchyard\/worktrees\/agent-one/);
});

test("stopCommand removes the worktree and branch when cleanup is requested", async () => {
  const repoDir = await createInitializedRepo();
  const writes: string[] = [];
  const originalWrite = process.stdout.write.bind(process.stdout);
  const worktreePath = join(repoDir, ".switchyard", "worktrees", "agent-two");

  try {
    await slingCommand({
      agentName: "Agent Two",
      startDir: repoDir,
      spawnRuntime: async () => {
        return {
          pid: 5150,
          command: {
            command: "codex",
            args: []
          }
        };
      }
    });

    process.stdout.write = ((chunk: string | Uint8Array) => {
      writes.push(typeof chunk === "string" ? chunk : chunk.toString());
      return true;
    }) as typeof process.stdout.write;

    await stopCommand({
      selector: "agent-two",
      cleanup: true,
      startDir: repoDir,
      isRuntimeAlive: (pid) => pid === 5150,
      stopRuntime: async (pid) => {
        assert.equal(pid, 5150);
        return true;
      }
    });

    await assert.rejects(async () => {
      await access(worktreePath);
    });
    await assert.rejects(async () => {
      await git(repoDir, ["rev-parse", "--verify", "agents/agent-two"]);
    });

    const sessions = await listSessions(repoDir);
    assert.equal(sessions[0]?.state, "stopped");
    assert.equal(sessions[0]?.runtimePid, null);
  } finally {
    process.stdout.write = originalWrite;
    await removeTempDir(repoDir);
  }

  const output = writes.join("");
  assert.match(output, /Stopped agent-two/);
  assert.match(output, /Cleanup: removed worktree and branch\./);
});

async function createInitializedRepo(): Promise<string> {
  const repoDir = await createTempGitRepo("switchyard-stop-command-test-");
  await bootstrapSwitchyardLayout(repoDir);
  await writeConfig(buildDefaultConfig(repoDir, "switchyard-test", "main"));
  return repoDir;
}
