import test from "node:test";
import assert from "node:assert/strict";
import { access, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { buildDefaultConfig, writeConfig } from "../config.js";
import { listSessions } from "../sessions/store.js";
import { bootstrapSwitchyardLayout } from "../storage/bootstrap.js";
import { createTempGitRepo, git, removeTempDir } from "../test-helpers/git.js";
import { statusCommand } from "./status.js";
import { slingCommand } from "./sling.js";

test("slingCommand creates a worktree and persists a running session", async () => {
  const repoDir = await createInitializedRepo();
  const nestedDir = join(repoDir, "apps", "api");
  const writes: string[] = [];
  const originalWrite = process.stdout.write.bind(process.stdout);

  await mkdir(nestedDir, { recursive: true });

  process.stdout.write = ((chunk: string | Uint8Array) => {
    writes.push(typeof chunk === "string" ? chunk : chunk.toString());
    return true;
  }) as typeof process.stdout.write;

  try {
    await slingCommand({
      agentName: "Agent One",
      runtimeArgs: ["--model", "gpt-5"],
      startDir: nestedDir,
      spawnRuntime: async ({ runtimeArgs }) => {
        assert.deepEqual(runtimeArgs, ["--model", "gpt-5"]);
        return {
          pid: 4242,
          command: {
            command: "codex",
            args: runtimeArgs
          }
        };
      }
    });
  } finally {
    process.stdout.write = originalWrite;
  }

  const sessions = await listSessions(repoDir);

  assert.equal(sessions.length, 1);
  assert.match(sessions[0]?.id ?? "", /^[0-9a-f-]{36}$/);
  assert.notEqual(sessions[0]?.id, "agent-one");
  assert.equal(sessions[0]?.agentName, "agent-one");
  assert.deepEqual(sessions[0]?.state, "running");
  assert.equal(sessions[0]?.runtimePid, 4242);
  assert.equal(sessions[0]?.branch, "agents/agent-one");
  assert.equal(sessions[0]?.worktreePath, join(repoDir, ".switchyard", "worktrees", "agent-one"));
  assert.match(writes.join(""), /Spawned agent-one/);
  assert.match(writes.join(""), /Runtime: codex --model gpt-5/);

  await removeTempDir(repoDir);
});

test("statusCommand shows a session created by slingCommand", async () => {
  const repoDir = await createInitializedRepo();
  const writes: string[] = [];
  const originalWrite = process.stdout.write.bind(process.stdout);

  try {
    process.stdout.write = ((chunk: string | Uint8Array) => {
      writes.push(typeof chunk === "string" ? chunk : chunk.toString());
      return true;
    }) as typeof process.stdout.write;

    await slingCommand({
      agentName: "Agent Two",
      startDir: repoDir,
      spawnRuntime: async () => {
        return {
          pid: 31337,
          command: {
            command: "codex",
            args: []
          }
        };
      }
    });

    writes.length = 0;
    await statusCommand({
      startDir: repoDir,
      isRuntimeAlive: (pid) => pid === 31337
    });
  } finally {
    process.stdout.write = originalWrite;
    await removeTempDir(repoDir);
  }

  const output = writes.join("");
  assert.match(output, /running\tagent-two\tagents\/agent-two\t\.switchyard\/worktrees\/agent-two\t/);
});

test("slingCommand cleans up failed worktrees and allows retrying the same agent", async () => {
  const repoDir = await createInitializedRepo();
  const worktreePath = join(repoDir, ".switchyard", "worktrees", "agent-three");
  const branchName = "agents/agent-three";
  const writes: string[] = [];
  const originalWrite = process.stdout.write.bind(process.stdout);
  let attempts = 0;

  try {
    process.stdout.write = ((chunk: string | Uint8Array) => {
      writes.push(typeof chunk === "string" ? chunk : chunk.toString());
      return true;
    }) as typeof process.stdout.write;

    await assert.rejects(async () => {
      await slingCommand({
        agentName: "Agent Three",
        startDir: repoDir,
        spawnRuntime: async () => {
          attempts += 1;
          if (attempts === 1) {
            throw new Error("boom");
          }

          return {
            pid: 2026,
            command: {
              command: "codex",
              args: []
            }
          };
        }
      });
    }, /boom/);

    await assert.rejects(async () => {
      await git(repoDir, ["rev-parse", "--verify", branchName]);
    }, /Needed a single revision/);

    await assert.rejects(async () => {
      await access(worktreePath);
    });

    await slingCommand({
      agentName: "Agent Three",
      startDir: repoDir,
      spawnRuntime: async () => {
        attempts += 1;
        return {
          pid: 2027,
          command: {
            command: "codex",
            args: []
          }
        };
      }
    });

    const sessions = await listSessions(repoDir);
    const agentThreeSessions = sessions.filter((session) => session.agentName === "agent-three");

    assert.equal(attempts, 2);
    assert.equal(agentThreeSessions.length, 2);
    assert.equal(agentThreeSessions[0]?.state, "running");
    assert.equal(agentThreeSessions[0]?.runtimePid, 2027);
    assert.equal(agentThreeSessions[1]?.state, "failed");
    assert.equal(agentThreeSessions[1]?.runtimePid, null);
    assert.notEqual(agentThreeSessions[0]?.id, agentThreeSessions[1]?.id);
    assert.match(writes.join(""), /Spawned agent-three/);
  } finally {
    process.stdout.write = originalWrite;
    await removeTempDir(repoDir);
  }
});

async function createInitializedRepo(): Promise<string> {
  const repoDir = await createTempGitRepo("switchyard-sling-command-test-");
  await bootstrapSwitchyardLayout(repoDir);
  await writeConfig(buildDefaultConfig(repoDir, "switchyard-test", "main"));
  return repoDir;
}
