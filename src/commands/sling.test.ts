import test from "node:test";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { buildDefaultConfig, writeConfig } from "../config.js";
import { listSessions } from "../sessions/store.js";
import { bootstrapSwitchyardLayout } from "../storage/bootstrap.js";
import { createTempGitRepo, removeTempDir } from "../test-helpers/git.js";
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
  assert.deepEqual(sessions[0]?.id, "agent-one");
  assert.deepEqual(sessions[0]?.state, "running");
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
    await statusCommand({ startDir: repoDir });
  } finally {
    process.stdout.write = originalWrite;
    await removeTempDir(repoDir);
  }

  const output = writes.join("");
  assert.match(output, /running\tagent-two\tagents\/agent-two\t\.switchyard\/worktrees\/agent-two\t/);
});

async function createInitializedRepo(): Promise<string> {
  const repoDir = await createTempGitRepo("switchyard-sling-command-test-");
  await bootstrapSwitchyardLayout(repoDir);
  await writeConfig(buildDefaultConfig(repoDir, "switchyard-test", "main"));
  return repoDir;
}
