import test from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { buildDefaultConfig, writeConfig } from "../config.js";
import { createSession, listSessions } from "../sessions/store.js";
import { bootstrapSwitchyardLayout } from "../storage/bootstrap.js";
import { createTempGitRepo, removeTempDir } from "../test-helpers/git.js";
import { statusCommand } from "./status.js";

test("statusCommand prints an empty-state message when no sessions exist", async () => {
  const repoDir = await createInitializedRepo();
  const writes: string[] = [];
  const originalWrite = process.stdout.write.bind(process.stdout);

  process.stdout.write = ((chunk: string | Uint8Array) => {
    writes.push(typeof chunk === "string" ? chunk : chunk.toString());
    return true;
  }) as typeof process.stdout.write;

  try {
    await statusCommand({
      startDir: repoDir,
      isRuntimeAlive: (pid) => pid === 1111
    });
  } finally {
    process.stdout.write = originalWrite;
    await removeTempDir(repoDir);
  }

  assert.equal(writes.join(""), "No Switchyard sessions recorded yet.\n");
});

test("statusCommand prints stored sessions with relative worktree paths", async () => {
  const repoDir = await createInitializedRepo();
  const writes: string[] = [];
  const originalWrite = process.stdout.write.bind(process.stdout);

  await createSession(repoDir, {
    id: "agent-one",
    agentName: "agent-one",
    branch: "agents/agent-one",
    worktreePath: join(repoDir, ".switchyard", "worktrees", "agent-one"),
    state: "running",
    runtimePid: 1111,
    createdAt: "2026-03-06T09:00:00.000Z",
    updatedAt: "2026-03-06T10:00:00.000Z"
  });
  await createSession(repoDir, {
    id: "agent-two",
    agentName: "agent-two",
    branch: "agents/agent-two",
    worktreePath: join(repoDir, ".switchyard", "worktrees", "agent-two"),
    state: "stopped",
    runtimePid: null,
    createdAt: "2026-03-06T11:00:00.000Z",
    updatedAt: "2026-03-06T12:00:00.000Z"
  });

  process.stdout.write = ((chunk: string | Uint8Array) => {
    writes.push(typeof chunk === "string" ? chunk : chunk.toString());
    return true;
  }) as typeof process.stdout.write;

  try {
    await statusCommand({
      startDir: repoDir,
      isRuntimeAlive: (pid) => pid === 1111
    });
  } finally {
    process.stdout.write = originalWrite;
    await removeTempDir(repoDir);
  }

  const output = writes.join("");
  assert.match(output, /Sessions for .+:/);
  assert.match(output, /STATE\tAGENT\tBRANCH\tWORKTREE\tUPDATED/);
  assert.match(output, /stopped\tagent-two\tagents\/agent-two\t\.switchyard\/worktrees\/agent-two\t2026-03-06T12:00:00.000Z/);
  assert.match(output, /running\tagent-one\tagents\/agent-one\t\.switchyard\/worktrees\/agent-one\t2026-03-06T10:00:00.000Z/);
  assert.ok(output.indexOf("agent-two") < output.indexOf("agent-one"));
});

test("statusCommand marks stale running sessions as failed", async () => {
  const repoDir = await createInitializedRepo();
  const writes: string[] = [];
  const originalWrite = process.stdout.write.bind(process.stdout);

  await createSession(repoDir, {
    id: "agent-stale",
    agentName: "agent-stale",
    branch: "agents/agent-stale",
    worktreePath: join(repoDir, ".switchyard", "worktrees", "agent-stale"),
    state: "running",
    runtimePid: 9090,
    createdAt: "2026-03-06T09:00:00.000Z",
    updatedAt: "2026-03-06T10:00:00.000Z"
  });

  process.stdout.write = ((chunk: string | Uint8Array) => {
    writes.push(typeof chunk === "string" ? chunk : chunk.toString());
    return true;
  }) as typeof process.stdout.write;

  try {
    await statusCommand({
      startDir: repoDir,
      isRuntimeAlive: () => false
    });

    const sessions = await listSessions(repoDir);
    assert.equal(sessions[0]?.state, "failed");
    assert.equal(sessions[0]?.runtimePid, null);
  } finally {
    process.stdout.write = originalWrite;
    await removeTempDir(repoDir);
  }

  const output = writes.join("");
  assert.match(output, /failed\tagent-stale\tagents\/agent-stale\t\.switchyard\/worktrees\/agent-stale\t/);
});

test("statusCommand marks legacy running sessions without a pid as failed", async () => {
  const repoDir = await createInitializedRepo();
  const writes: string[] = [];
  const originalWrite = process.stdout.write.bind(process.stdout);

  await createSession(repoDir, {
    id: "agent-legacy",
    agentName: "agent-legacy",
    branch: "agents/agent-legacy",
    worktreePath: join(repoDir, ".switchyard", "worktrees", "agent-legacy"),
    state: "running",
    runtimePid: null,
    createdAt: "2026-03-06T09:00:00.000Z",
    updatedAt: "2026-03-06T10:00:00.000Z"
  });

  process.stdout.write = ((chunk: string | Uint8Array) => {
    writes.push(typeof chunk === "string" ? chunk : chunk.toString());
    return true;
  }) as typeof process.stdout.write;

  try {
    await statusCommand({
      startDir: repoDir,
      isRuntimeAlive: () => true
    });

    const sessions = await listSessions(repoDir);
    assert.equal(sessions[0]?.state, "failed");
    assert.equal(sessions[0]?.runtimePid, null);
  } finally {
    process.stdout.write = originalWrite;
    await removeTempDir(repoDir);
  }

  const output = writes.join("");
  assert.match(output, /failed\tagent-legacy\tagents\/agent-legacy\t\.switchyard\/worktrees\/agent-legacy\t/);
});

async function createInitializedRepo(): Promise<string> {
  const repoDir = await createTempGitRepo("switchyard-status-command-test-");
  await bootstrapSwitchyardLayout(repoDir);
  await writeConfig(buildDefaultConfig(repoDir, "switchyard-test", "main"));
  return repoDir;
}
