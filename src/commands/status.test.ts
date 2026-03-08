import test from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { buildDefaultConfig, writeConfig } from "../config.js";
import { createEvent } from "../events/store.js";
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
  assert.match(output, /STATE\tAGENT\tBRANCH\tWORKTREE\tUPDATED\tRECENT/);
  assert.match(output, /stopped\tagent-two\tagents\/agent-two\t\.switchyard\/worktrees\/agent-two\t2026-03-06T12:00:00.000Z\t-/);
  assert.match(output, /running\tagent-one\tagents\/agent-one\t\.switchyard\/worktrees\/agent-one\t2026-03-06T10:00:00.000Z\t-/);
  assert.ok(output.indexOf("agent-two") < output.indexOf("agent-one"));
});

test("statusCommand prints the latest event summary for each session", async () => {
  const repoDir = await createInitializedRepo();
  const writes: string[] = [];
  const originalWrite = process.stdout.write.bind(process.stdout);

  await createSession(repoDir, {
    id: "session-1",
    agentName: "agent-one",
    branch: "agents/agent-one",
    worktreePath: join(repoDir, ".switchyard", "worktrees", "agent-one"),
    state: "running",
    runtimePid: 1111,
    createdAt: "2026-03-08T09:00:00.000Z",
    updatedAt: "2026-03-08T09:00:00.000Z"
  });
  await createSession(repoDir, {
    id: "session-2",
    agentName: "agent-two",
    branch: "agents/agent-two",
    worktreePath: join(repoDir, ".switchyard", "worktrees", "agent-two"),
    state: "stopped",
    runtimePid: null,
    createdAt: "2026-03-08T09:05:00.000Z",
    updatedAt: "2026-03-08T09:05:00.000Z"
  });
  await createEvent(repoDir, {
    sessionId: "session-1",
    agentName: "agent-one",
    eventType: "sling.completed",
    payload: {
      branch: "agents/agent-one",
      runtimePid: 1111,
      runtimeCommand: "codex --json"
    },
    createdAt: "2026-03-08T09:10:00.000Z"
  });
  await createEvent(repoDir, {
    sessionId: "session-1",
    agentName: "agent-one",
    eventType: "mail.sent",
    payload: {
      bodyLength: 18,
      sender: "operator"
    },
    createdAt: "2026-03-08T09:15:00.000Z"
  });
  await createEvent(repoDir, {
    sessionId: "session-2",
    agentName: "agent-two",
    eventType: "stop.completed",
    payload: {
      cleanupPerformed: true,
      cleanupRequested: true,
      outcome: "stopped"
    },
    createdAt: "2026-03-08T09:20:00.000Z"
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
  assert.match(
    output,
    /running\tagent-one\tagents\/agent-one\t\.switchyard\/worktrees\/agent-one\t2026-03-08T09:00:00.000Z\t2026-03-08T09:15:00.000Z mail\.sent sender=operator, bodyLength=18/
  );
  assert.match(
    output,
    /stopped\tagent-two\tagents\/agent-two\t\.switchyard\/worktrees\/agent-two\t2026-03-08T09:05:00.000Z\t2026-03-08T09:20:00.000Z stop\.completed outcome=stopped, cleanupPerformed=true/
  );
});

test("statusCommand does not leak unknown event payload fields into the recent summary", async () => {
  const repoDir = await createInitializedRepo();
  const writes: string[] = [];
  const originalWrite = process.stdout.write.bind(process.stdout);

  await createSession(repoDir, {
    id: "session-unknown",
    agentName: "agent-unknown",
    branch: "agents/agent-unknown",
    worktreePath: join(repoDir, ".switchyard", "worktrees", "agent-unknown"),
    state: "stopped",
    runtimePid: null,
    createdAt: "2026-03-08T09:00:00.000Z",
    updatedAt: "2026-03-08T09:00:00.000Z"
  });
  await createEvent(repoDir, {
    sessionId: "session-unknown",
    agentName: "agent-unknown",
    eventType: "runtime.note",
    payload: {
      secret: "should-not-appear",
      summary: "also-hidden"
    },
    createdAt: "2026-03-08T09:10:00.000Z"
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
  } finally {
    process.stdout.write = originalWrite;
    await removeTempDir(repoDir);
  }

  const output = writes.join("");
  assert.match(
    output,
    /stopped\tagent-unknown\tagents\/agent-unknown\t\.switchyard\/worktrees\/agent-unknown\t2026-03-08T09:00:00.000Z\t2026-03-08T09:10:00.000Z runtime\.note/
  );
  assert.doesNotMatch(output, /should-not-appear/);
  assert.doesNotMatch(output, /also-hidden/);
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
  await createEvent(repoDir, {
    sessionId: "agent-stale",
    agentName: "agent-stale",
    eventType: "sling.completed",
    payload: {
      runtimePid: 9090
    },
    createdAt: "2026-03-06T09:30:00.000Z"
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
  assert.match(output, /failed\tagent-stale\tagents\/agent-stale\t\.switchyard\/worktrees\/agent-stale\t[^\t]+\t-/);
  assert.doesNotMatch(output, /sling\.completed/);
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
