import test from "node:test";
import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { join } from "node:path";
import { buildDefaultConfig, writeConfig } from "../config.js";
import { listEvents } from "../events/store.js";
import { createSession, listSessions, updateSessionState } from "../sessions/store.js";
import { bootstrapSwitchyardLayout } from "../storage/bootstrap.js";
import { createTempGitRepo, git, removeTempDir } from "../test-helpers/git.js";
import { slingCommand } from "./sling.js";
import { statusCommand } from "./status.js";
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
          },
          readyAfterMs: 500
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
    const events = await listEvents(repoDir, { sessionId: sessions[0]?.id });
    assert.equal(events.length, 2);
    assert.equal(events[1]?.eventType, "stop.completed");
    assert.equal(events[1]?.payload.outcome, "stopped");
    assert.equal(events[1]?.payload.cleanupPerformed, false);
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
          },
          readyAfterMs: 500
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

test("stopCommand marks legacy running sessions without a pid as failed", async () => {
  const repoDir = await createInitializedRepo();
  const writes: string[] = [];
  const originalWrite = process.stdout.write.bind(process.stdout);

  try {
    await createSession(repoDir, {
      id: "legacy-agent",
      agentName: "legacy-agent",
      branch: "agents/legacy-agent",
      worktreePath: join(repoDir, ".switchyard", "worktrees", "legacy-agent"),
      state: "running",
      runtimePid: null,
      createdAt: "2026-03-06T09:00:00.000Z",
      updatedAt: "2026-03-06T10:00:00.000Z"
    });

    process.stdout.write = ((chunk: string | Uint8Array) => {
      writes.push(typeof chunk === "string" ? chunk : chunk.toString());
      return true;
    }) as typeof process.stdout.write;

    await stopCommand({
      selector: "legacy-agent",
      startDir: repoDir
    });

    const sessions = await listSessions(repoDir);
    assert.equal(sessions[0]?.state, "failed");
    assert.equal(sessions[0]?.runtimePid, null);
    const events = await listEvents(repoDir, { sessionId: "legacy-agent" });
    assert.equal(events.length, 1);
    assert.equal(events[0]?.eventType, "stop.completed");
    assert.equal(events[0]?.payload.outcome, "missing_runtime_pid");
    assert.equal(events[0]?.payload.cleanupPerformed, false);
  } finally {
    process.stdout.write = originalWrite;
    await removeTempDir(repoDir);
  }

  const output = writes.join("");
  assert.match(output, /has no recorded runtime pid\. Marked failed\./);
  assert.match(output, /Worktree preserved: \.switchyard\/worktrees\/legacy-agent/);
});

test("stopCommand cleans up legacy running sessions without a pid when requested", async () => {
  const repoDir = await createInitializedRepo();
  const writes: string[] = [];
  const originalWrite = process.stdout.write.bind(process.stdout);
  const worktreePath = join(repoDir, ".switchyard", "worktrees", "agent-legacy-cleanup");

  try {
    await slingCommand({
      agentName: "Agent Legacy Cleanup",
      startDir: repoDir,
      spawnRuntime: async () => {
        return {
          pid: 7373,
          command: {
            command: "codex",
            args: []
          },
          readyAfterMs: 500
        };
      }
    });

    const sessions = await listSessions(repoDir);
    const sessionId = sessions[0]?.id;
    assert.ok(sessionId);

    await updateSessionState(repoDir, {
      id: sessionId,
      state: "running",
      runtimePid: null
    });

    process.stdout.write = ((chunk: string | Uint8Array) => {
      writes.push(typeof chunk === "string" ? chunk : chunk.toString());
      return true;
    }) as typeof process.stdout.write;

    await stopCommand({
      selector: "agent-legacy-cleanup",
      cleanup: true,
      startDir: repoDir
    });

    await assert.rejects(async () => {
      await access(worktreePath);
    });
    await assert.rejects(async () => {
      await git(repoDir, ["rev-parse", "--verify", "agents/agent-legacy-cleanup"]);
    });

    const nextSessions = await listSessions(repoDir);
    assert.equal(nextSessions[0]?.state, "failed");
    assert.equal(nextSessions[0]?.runtimePid, null);
    const events = await listEvents(repoDir, { sessionId });
    assert.equal(events.length, 2);
    assert.equal(events[1]?.eventType, "stop.completed");
    assert.equal(events[1]?.payload.outcome, "missing_runtime_pid");
    assert.equal(events[1]?.payload.cleanupPerformed, true);
  } finally {
    process.stdout.write = originalWrite;
    await removeTempDir(repoDir);
  }

  const output = writes.join("");
  assert.match(output, /has no recorded runtime pid\. Marked failed\./);
  assert.match(output, /Cleanup: removed worktree and branch\./);
});

test("stopCommand allows cleanup for sessions already marked failed", async () => {
  const repoDir = await createInitializedRepo();
  const writes: string[] = [];
  const originalWrite = process.stdout.write.bind(process.stdout);
  const worktreePath = join(repoDir, ".switchyard", "worktrees", "agent-stale-cleanup");

  try {
    await slingCommand({
      agentName: "Agent Stale Cleanup",
      startDir: repoDir,
      spawnRuntime: async () => {
        return {
          pid: 8484,
          command: {
            command: "codex",
            args: []
          },
          readyAfterMs: 500
        };
      }
    });

    await statusCommand({
      startDir: repoDir,
      isRuntimeAlive: () => false
    });

    process.stdout.write = ((chunk: string | Uint8Array) => {
      writes.push(typeof chunk === "string" ? chunk : chunk.toString());
      return true;
    }) as typeof process.stdout.write;

    await stopCommand({
      selector: "agent-stale-cleanup",
      cleanup: true,
      startDir: repoDir
    });

    await assert.rejects(async () => {
      await access(worktreePath);
    });
    await assert.rejects(async () => {
      await git(repoDir, ["rev-parse", "--verify", "agents/agent-stale-cleanup"]);
    });

    const sessions = await listSessions(repoDir);
    assert.equal(sessions[0]?.state, "failed");
    assert.equal(sessions[0]?.runtimePid, null);
    const events = await listEvents(repoDir, { sessionId: sessions[0]?.id });
    assert.equal(events.length, 2);
    assert.equal(events[1]?.eventType, "stop.completed");
    assert.equal(events[1]?.payload.outcome, "already_not_running");
    assert.equal(events[1]?.payload.cleanupPerformed, true);
  } finally {
    process.stdout.write = originalWrite;
    await removeTempDir(repoDir);
  }

  const output = writes.join("");
  assert.match(output, /Session agent-stale-cleanup is already failed\./);
  assert.match(output, /Cleanup: removed worktree and branch\./);
});

test("stopCommand treats an exit during shutdown as stopped instead of failed", async () => {
  const repoDir = await createInitializedRepo();

  try {
    await slingCommand({
      agentName: "Agent Race",
      startDir: repoDir,
      spawnRuntime: async () => {
        return {
          pid: 6262,
          command: {
            command: "codex",
            args: []
          },
          readyAfterMs: 500
        };
      }
    });

    await stopCommand({
      selector: "agent-race",
      startDir: repoDir,
      isRuntimeAlive: (pid) => pid === 6262,
      stopRuntime: async () => false
    });

    const sessions = await listSessions(repoDir);
    assert.equal(sessions[0]?.state, "stopped");
    assert.equal(sessions[0]?.runtimePid, null);
  } finally {
    await removeTempDir(repoDir);
  }
});

test("stopCommand keeps the stop result when event persistence fails", async () => {
  const repoDir = await createInitializedRepo();

  try {
    await slingCommand({
      agentName: "Agent Event Failure",
      startDir: repoDir,
      spawnRuntime: async () => {
        return {
          pid: 9191,
          command: {
            command: "codex",
            args: []
          },
          readyAfterMs: 500
        };
      }
    });

    await stopCommand({
      selector: "agent-event-failure",
      startDir: repoDir,
      isRuntimeAlive: (pid) => pid === 9191,
      stopRuntime: async () => true,
      recordEvent: async () => {
        throw new Error("events unavailable");
      }
    });

    const sessions = await listSessions(repoDir);
    assert.equal(sessions[0]?.state, "stopped");
    assert.equal(sessions[0]?.runtimePid, null);
    const events = await listEvents(repoDir, { sessionId: sessions[0]?.id });
    assert.equal(events.length, 1);
    assert.equal(events[0]?.eventType, "sling.completed");
  } finally {
    await removeTempDir(repoDir);
  }
});

async function createInitializedRepo(): Promise<string> {
  const repoDir = await createTempGitRepo("switchyard-stop-command-test-");
  await bootstrapSwitchyardLayout(repoDir);
  await writeConfig(buildDefaultConfig(repoDir, "switchyard-test", "main"));
  return repoDir;
}
