import test from "node:test";
import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { join } from "node:path";
import { buildDefaultConfig, writeConfig } from "../config.js";
import { listEvents } from "../events/store.js";
import { StopError } from "../errors.js";
import { createSession, listSessions, updateSessionState } from "../sessions/store.js";
import { bootstrapSwitchyardLayout } from "../storage/bootstrap.js";
import { createTempGitRepo, git, removeTempDir } from "../test-helpers/git.js";
import { slingCommand } from "./sling.js";
import { statusCommand } from "./status.js";
import { stopCommand } from "./stop.js";

const TEST_TASK = "Handle the assigned operator task.";

test("stopCommand stops an active session and preserves the worktree by default", async () => {
  const repoDir = await createInitializedRepo();
  const writes: string[] = [];
  const originalWrite = process.stdout.write.bind(process.stdout);
  const worktreePath = join(repoDir, ".switchyard", "worktrees", "agent-one");

  try {
    await slingCommand({
      agentName: "Agent One",
      task: TEST_TASK,
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
  assert.match(output, /Session: [^\n]+/);
  assert.match(output, /Worktree preserved: \.switchyard\/worktrees\/agent-one/);
});

test("stopCommand rejects selectors that match different sessions by id and agent name", async () => {
  const repoDir = await createInitializedRepo();

  try {
    await createSession(repoDir, {
      id: "shared-name",
      agentName: "other-agent",
      branch: "agents/other-agent",
      worktreePath: join(repoDir, ".switchyard", "worktrees", "other-agent"),
      state: "running",
      runtimePid: 2111,
      createdAt: "2026-03-08T12:00:00.000Z",
      updatedAt: "2026-03-08T12:00:00.000Z"
    });
    await createSession(repoDir, {
      id: "session-shared-agent",
      agentName: "shared-name",
      branch: "agents/shared-name",
      worktreePath: join(repoDir, ".switchyard", "worktrees", "shared-name"),
      state: "running",
      runtimePid: 2112,
      createdAt: "2026-03-08T12:05:00.000Z",
      updatedAt: "2026-03-08T12:05:00.000Z"
    });

    await assert.rejects(
      () => stopCommand({ selector: "shared-name", startDir: repoDir }),
      (error: unknown) => {
        assert.ok(error instanceof StopError);
        assert.match(
          error.message,
          /Selector 'shared-name' is ambiguous: it matches session 'shared-name' by id and session 'session-shared-agent' by agent name\./
        );
        return true;
      }
    );

    const sessions = await listSessions(repoDir);
    assert.equal(sessions.length, 2);
    assert.equal(sessions[0]?.runtimePid, 2112);
    assert.equal(sessions[1]?.runtimePid, 2111);
  } finally {
    await removeTempDir(repoDir);
  }
});

test("stopCommand rejects selectors that match multiple sessions by agent name", async () => {
  const repoDir = await createInitializedRepo();

  try {
    await createSession(repoDir, {
      id: "session-latest",
      agentName: "shared-agent",
      branch: "agents/shared-agent",
      worktreePath: join(repoDir, ".switchyard", "worktrees", "shared-agent-latest"),
      state: "running",
      runtimePid: 3111,
      createdAt: "2026-03-08T12:05:00.000Z",
      updatedAt: "2026-03-08T12:10:00.000Z"
    });
    await createSession(repoDir, {
      id: "session-earlier",
      agentName: "shared-agent",
      branch: "agents/shared-agent",
      worktreePath: join(repoDir, ".switchyard", "worktrees", "shared-agent-earlier"),
      state: "running",
      runtimePid: 3112,
      createdAt: "2026-03-08T12:00:00.000Z",
      updatedAt: "2026-03-08T12:00:00.000Z"
    });

    await assert.rejects(
      () => stopCommand({ selector: "shared-agent", startDir: repoDir }),
      (error: unknown) => {
        assert.ok(error instanceof StopError);
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

test("stopCommand records a durable failure event when runtime shutdown fails", async () => {
  const repoDir = await createInitializedRepo();

  try {
    await createSession(repoDir, {
      id: "session-stop-failure",
      agentName: "agent-stop-failure",
      branch: "agents/agent-stop-failure",
      worktreePath: join(repoDir, ".switchyard", "worktrees", "agent-stop-failure"),
      state: "running",
      runtimePid: 5150,
      createdAt: "2026-03-08T12:00:00.000Z",
      updatedAt: "2026-03-08T12:00:00.000Z"
    });

    await assert.rejects(
      () => stopCommand({
        selector: "agent-stop-failure",
        startDir: repoDir,
        isRuntimeAlive: (pid) => pid === 5150,
        stopRuntime: async () => {
          throw new Error("simulated stop failure");
        }
      }),
      /simulated stop failure/
    );

    const sessions = await listSessions(repoDir);
    assert.equal(sessions[0]?.state, "running");
    assert.equal(sessions[0]?.runtimePid, 5150);

    const events = await listEvents(repoDir, { sessionId: "session-stop-failure" });
    assert.equal(events.length, 1);
    assert.equal(events[0]?.eventType, "stop.failed");
    assert.equal(events[0]?.payload.reason, "runtime_stop_failed");
    assert.equal(events[0]?.payload.runtimePid, 5150);
    assert.equal(events[0]?.payload.errorMessage, "simulated stop failure");
    assert.equal(events[0]?.payload.previousState, "running");
  } finally {
    await removeTempDir(repoDir);
  }
});

test("stopCommand removes the worktree and branch when cleanup is explicitly abandoned", async () => {
  const repoDir = await createInitializedRepo();
  const writes: string[] = [];
  const originalWrite = process.stdout.write.bind(process.stdout);
  const worktreePath = join(repoDir, ".switchyard", "worktrees", "agent-two");

  try {
    await slingCommand({
      agentName: "Agent Two",
      task: TEST_TASK,
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
      abandon: true,
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
  assert.match(output, /Session: [^\n]+/);
  assert.match(output, /Cleanup: removed worktree and branch after explicit abandon\./);
});

test("stopCommand marks legacy active sessions without a pid as failed", async () => {
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
  assert.match(output, /Session: legacy-agent/);
  assert.match(output, /Worktree preserved: \.switchyard\/worktrees\/legacy-agent/);
});

test("stopCommand cleans up legacy active sessions without a pid when requested", async () => {
  const repoDir = await createInitializedRepo();
  const writes: string[] = [];
  const originalWrite = process.stdout.write.bind(process.stdout);
  const worktreePath = join(repoDir, ".switchyard", "worktrees", "agent-legacy-cleanup");

  try {
    await slingCommand({
      agentName: "Agent Legacy Cleanup",
      task: TEST_TASK,
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
      abandon: true,
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
    assert.equal(events[1]?.payload.cleanupMode, "abandoned");
  } finally {
    process.stdout.write = originalWrite;
    await removeTempDir(repoDir);
  }

  const output = writes.join("");
  assert.match(output, /has no recorded runtime pid\. Marked failed\./);
  assert.match(output, /Session: [^\n]+/);
  assert.match(output, /Cleanup: removed worktree and branch after explicit abandon\./);
});

test("stopCommand allows explicit abandon cleanup for sessions already marked failed", async () => {
  const repoDir = await createInitializedRepo();
  const writes: string[] = [];
  const originalWrite = process.stdout.write.bind(process.stdout);
  const worktreePath = join(repoDir, ".switchyard", "worktrees", "agent-stale-cleanup");

  try {
    await slingCommand({
      agentName: "Agent Stale Cleanup",
      task: TEST_TASK,
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
      abandon: true,
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
    assert.equal(events.length, 3);
    assert.equal(events[1]?.eventType, "runtime.exited_early");
    assert.equal(events[2]?.eventType, "stop.completed");
    assert.equal(events[2]?.payload.outcome, "already_not_running");
    assert.equal(events[2]?.payload.cleanupPerformed, true);
    assert.equal(events[2]?.payload.cleanupMode, "abandoned");
  } finally {
    process.stdout.write = originalWrite;
    await removeTempDir(repoDir);
  }

  const output = writes.join("");
  assert.match(output, /Session agent-stale-cleanup is already failed\./);
  assert.match(output, /Session: [^\n]+/);
  assert.match(output, /Cleanup: removed worktree and branch after explicit abandon\./);
});

test("stopCommand refuses cleanup for an unmerged stopped session without explicit abandon", async () => {
  const repoDir = await createInitializedRepo();
  const writes: string[] = [];
  const originalWrite = process.stdout.write.bind(process.stdout);
  const worktreePath = join(repoDir, ".switchyard", "worktrees", "agent-unmerged");

  try {
    await slingCommand({
      agentName: "Agent Unmerged",
      task: TEST_TASK,
      startDir: repoDir,
      spawnRuntime: async () => {
        return {
          pid: 3131,
          command: {
            command: "codex",
            args: []
          },
          readyAfterMs: 500
        };
      }
    });

    await git(worktreePath, ["config", "user.name", "Switchyard Test"]);
    await git(worktreePath, ["config", "user.email", "switchyard@example.com"]);
    await git(worktreePath, ["switch", "agents/agent-unmerged"]);
    await git(worktreePath, ["commit", "--allow-empty", "-m", "Agent unmerged change"]);

    await stopCommand({
      selector: "agent-unmerged",
      startDir: repoDir,
      isRuntimeAlive: (pid) => pid === 3131,
      stopRuntime: async () => true
    });

    process.stdout.write = ((chunk: string | Uint8Array) => {
      writes.push(typeof chunk === "string" ? chunk : chunk.toString());
      return true;
    }) as typeof process.stdout.write;

    await assert.rejects(async () => {
      await stopCommand({
        selector: "agent-unmerged",
        cleanup: true,
        startDir: repoDir
      });
    }, /not merged into 'main'/);

    await access(worktreePath);
    await git(repoDir, ["rev-parse", "--verify", "agents/agent-unmerged"]);

    const sessions = await listSessions(repoDir);
    assert.equal(sessions[0]?.state, "stopped");
    const events = await listEvents(repoDir, { sessionId: sessions[0]?.id });
    assert.equal(events.length, 3);
    assert.equal(events[2]?.eventType, "stop.completed");
    assert.equal(events[2]?.payload.outcome, "already_not_running");
    assert.equal(events[2]?.payload.cleanupPerformed, false);
    assert.equal(events[2]?.payload.cleanupReason, "not_merged");
  } finally {
    process.stdout.write = originalWrite;
    await removeTempDir(repoDir);
  }

  assert.equal(writes.join(""), "");
});

test("stopCommand refuses merged cleanup for legacy sessions without stored base branch metadata", async () => {
  const repoDir = await createInitializedRepo();
  const writes: string[] = [];
  const originalWrite = process.stdout.write.bind(process.stdout);
  const worktreePath = join(repoDir, ".switchyard", "worktrees", "agent-legacy-target");

  try {
    await git(repoDir, ["switch", "-c", "agents/agent-legacy-target"]);
    await git(repoDir, ["commit", "--allow-empty", "-m", "Agent legacy target change"]);
    await git(repoDir, ["switch", "main"]);
    await git(repoDir, ["worktree", "add", worktreePath, "agents/agent-legacy-target"]);
    await createSession(repoDir, {
      id: "session-legacy-target",
      agentName: "agent-legacy-target",
      branch: "agents/agent-legacy-target",
      worktreePath,
      state: "stopped",
      runtimePid: null,
      createdAt: "2026-03-08T09:00:00.000Z",
      updatedAt: "2026-03-08T09:16:00.000Z"
    });
    await git(repoDir, ["merge", "--no-ff", "agents/agent-legacy-target", "-m", "Merge legacy target branch"]);

    process.stdout.write = ((chunk: string | Uint8Array) => {
      writes.push(typeof chunk === "string" ? chunk : chunk.toString());
      return true;
    }) as typeof process.stdout.write;

    await assert.rejects(async () => {
      await stopCommand({
        selector: "agent-legacy-target",
        cleanup: true,
        startDir: repoDir
      });
    }, /no stored base branch metadata.*--cleanup --abandon/);

    await access(worktreePath);
    await git(repoDir, ["rev-parse", "--verify", "agents/agent-legacy-target"]);

    const events = await listEvents(repoDir, { sessionId: "session-legacy-target" });
    assert.equal(events.length, 1);
    assert.equal(events[0]?.eventType, "stop.completed");
    assert.equal(events[0]?.payload.outcome, "already_not_running");
    assert.equal(events[0]?.payload.cleanupPerformed, false);
    assert.equal(events[0]?.payload.cleanupReason, "missing_base_branch_metadata");
  } finally {
    process.stdout.write = originalWrite;
    await removeTempDir(repoDir);
  }

  assert.equal(writes.join(""), "");
});

test("stopCommand allows explicit abandon cleanup when branch metadata is missing", async () => {
  const repoDir = await createInitializedRepo();
  const writes: string[] = [];
  const originalWrite = process.stdout.write.bind(process.stdout);
  const worktreePath = join(repoDir, ".switchyard", "worktrees", "agent-missing-branch");
  const removedWorktrees: Array<{ agentName: string; branch: string; path: string; baseBranch: string }> = [];

  try {
    await createSession(repoDir, {
      id: "session-missing-branch",
      agentName: "agent-missing-branch",
      branch: "",
      baseBranch: "main",
      worktreePath,
      state: "stopped",
      runtimePid: null,
      createdAt: "2026-03-08T09:00:00.000Z",
      updatedAt: "2026-03-08T09:18:00.000Z"
    });

    process.stdout.write = ((chunk: string | Uint8Array) => {
      writes.push(typeof chunk === "string" ? chunk : chunk.toString());
      return true;
    }) as typeof process.stdout.write;

    await stopCommand({
      selector: "agent-missing-branch",
      cleanup: true,
      abandon: true,
      startDir: repoDir,
      removeSessionWorktree: async (_projectRoot, worktree) => {
        removedWorktrees.push(worktree);
      }
    });

    const events = await listEvents(repoDir, { sessionId: "session-missing-branch" });
    assert.equal(events.length, 1);
    assert.equal(events[0]?.eventType, "stop.completed");
    assert.equal(events[0]?.payload.cleanupPerformed, true);
    assert.equal(events[0]?.payload.cleanupMode, "abandoned");
  } finally {
    process.stdout.write = originalWrite;
    await removeTempDir(repoDir);
  }

  assert.equal(removedWorktrees.length, 1);
  assert.deepEqual(removedWorktrees[0], {
    agentName: "agent-missing-branch",
    branch: "",
    path: worktreePath,
    baseBranch: "main"
  });
  assert.match(writes.join(""), /Cleanup: removed worktree and branch after explicit abandon\./);
});

test("stopCommand records cleanup failure details when artifact removal fails after stopping", async () => {
  const repoDir = await createInitializedRepo();
  const worktreePath = join(repoDir, ".switchyard", "worktrees", "agent-cleanup-failure");

  try {
    await slingCommand({
      agentName: "Agent Cleanup Failure",
      task: TEST_TASK,
      startDir: repoDir,
      spawnRuntime: async () => {
        return {
          pid: 4545,
          command: {
            command: "codex",
            args: []
          },
          readyAfterMs: 500
        };
      }
    });

    await assert.rejects(
      async () => {
        await stopCommand({
          selector: "agent-cleanup-failure",
          cleanup: true,
          abandon: true,
          startDir: repoDir,
          isRuntimeAlive: (pid) => pid === 4545,
          stopRuntime: async () => true,
          removeSessionWorktree: async () => {
            throw new Error("simulated remove failure");
          }
        });
      },
      /Cleanup failed for agent-cleanup-failure: simulated remove failure/
    );

    const sessions = await listSessions(repoDir);
    assert.equal(sessions[0]?.state, "stopped");
    assert.equal(sessions[0]?.runtimePid, null);
    const events = await listEvents(repoDir, { sessionId: sessions[0]?.id });
    assert.equal(events.length, 2);
    assert.equal(events[1]?.eventType, "stop.completed");
    assert.equal(events[1]?.payload.outcome, "stopped");
    assert.equal(events[1]?.payload.cleanupPerformed, false);
    assert.equal(events[1]?.payload.cleanupReason, "cleanup_failed");
    assert.equal(events[1]?.payload.cleanupError, "simulated remove failure");

    await access(worktreePath);
    await git(repoDir, ["rev-parse", "--verify", "agents/agent-cleanup-failure"]);
  } finally {
    await removeTempDir(repoDir);
  }
});

test("stopCommand still stops an active unmerged session when cleanup is refused", async () => {
  const repoDir = await createInitializedRepo();
  const writes: string[] = [];
  const originalWrite = process.stdout.write.bind(process.stdout);
  const worktreePath = join(repoDir, ".switchyard", "worktrees", "agent-active-unmerged");

  try {
    await slingCommand({
      agentName: "Agent Active Unmerged",
      task: TEST_TASK,
      startDir: repoDir,
      spawnRuntime: async () => {
        return {
          pid: 4141,
          command: {
            command: "codex",
            args: []
          },
          readyAfterMs: 500
        };
      }
    });

    await git(worktreePath, ["config", "user.name", "Switchyard Test"]);
    await git(worktreePath, ["config", "user.email", "switchyard@example.com"]);
    await git(worktreePath, ["switch", "agents/agent-active-unmerged"]);
    await git(worktreePath, ["commit", "--allow-empty", "-m", "Agent active unmerged change"]);

    process.stdout.write = ((chunk: string | Uint8Array) => {
      writes.push(typeof chunk === "string" ? chunk : chunk.toString());
      return true;
    }) as typeof process.stdout.write;

    await stopCommand({
      selector: "agent-active-unmerged",
      cleanup: true,
      startDir: repoDir,
      isRuntimeAlive: (pid) => pid === 4141,
      stopRuntime: async (pid) => {
        assert.equal(pid, 4141);
        return true;
      }
    });

    await access(worktreePath);
    await git(repoDir, ["rev-parse", "--verify", "agents/agent-active-unmerged"]);

    const sessions = await listSessions(repoDir);
    assert.equal(sessions[0]?.state, "stopped");
    assert.equal(sessions[0]?.runtimePid, null);
    const events = await listEvents(repoDir, { sessionId: sessions[0]?.id });
    assert.equal(events.length, 2);
    assert.equal(events[1]?.eventType, "stop.completed");
    assert.equal(events[1]?.payload.cleanupPerformed, false);
    assert.equal(events[1]?.payload.cleanupReason, "not_merged");
  } finally {
    process.stdout.write = originalWrite;
    await removeTempDir(repoDir);
  }

  const output = writes.join("");
  assert.match(output, /Stopped agent-active-unmerged/);
  assert.match(output, /Session: [^\n]+/);
  assert.match(output, /Cleanup skipped: Refusing cleanup for agent-active-unmerged: preserved branch 'agents\/agent-active-unmerged' is not merged into 'main'/);
});

test("stopCommand reports already-missing cleanup artifacts without claiming removal", async () => {
  const repoDir = await createInitializedRepo();
  const writes: string[] = [];
  const originalWrite = process.stdout.write.bind(process.stdout);
  const worktreePath = join(repoDir, ".switchyard", "worktrees", "agent-missing-artifacts");

  try {
    await slingCommand({
      agentName: "Agent Missing Artifacts",
      task: TEST_TASK,
      startDir: repoDir,
      spawnRuntime: async () => {
        return {
          pid: 5151,
          command: {
            command: "codex",
            args: []
          },
          readyAfterMs: 500
        };
      }
    });

    await stopCommand({
      selector: "agent-missing-artifacts",
      startDir: repoDir,
      isRuntimeAlive: (pid) => pid === 5151,
      stopRuntime: async () => true
    });

    await git(repoDir, ["worktree", "remove", "--force", worktreePath]);
    await git(repoDir, ["branch", "--delete", "--force", "agents/agent-missing-artifacts"]);

    process.stdout.write = ((chunk: string | Uint8Array) => {
      writes.push(typeof chunk === "string" ? chunk : chunk.toString());
      return true;
    }) as typeof process.stdout.write;

    await stopCommand({
      selector: "agent-missing-artifacts",
      cleanup: true,
      startDir: repoDir
    });

    const sessions = await listSessions(repoDir);
    const events = await listEvents(repoDir, { sessionId: sessions[0]?.id });
    assert.equal(events.length, 3);
    assert.equal(events[2]?.eventType, "stop.completed");
    assert.equal(events[2]?.payload.cleanupPerformed, false);
    assert.equal(events[2]?.payload.cleanupReason, "artifacts_missing");
    assert.equal(events[2]?.payload.cleanupMode, undefined);
  } finally {
    process.stdout.write = originalWrite;
    await removeTempDir(repoDir);
  }

  const output = writes.join("");
  assert.match(output, /Session agent-missing-artifacts is already stopped\./);
  assert.match(output, /Session: [^\n]+/);
  assert.match(output, /Cleanup: preserved worktree and branch were already absent\./);
  assert.doesNotMatch(output, /removed worktree and branch/);
});

test("stopCommand refuses cleanup when the preserved worktree is already missing but the branch remains", async () => {
  const repoDir = await createInitializedRepo();
  const worktreePath = join(repoDir, ".switchyard", "worktrees", "agent-missing-worktree");

  try {
    await git(repoDir, ["branch", "agents/missing-worktree"]);
    await createSession(repoDir, {
      id: "session-missing-worktree",
      agentName: "agent-missing-worktree",
      branch: "agents/missing-worktree",
      baseBranch: "main",
      worktreePath,
      state: "stopped",
      runtimePid: null,
      createdAt: "2026-03-08T09:00:00.000Z",
      updatedAt: "2026-03-08T09:15:00.000Z"
    });

    await assert.rejects(
      () => stopCommand({
        selector: "agent-missing-worktree",
        cleanup: true,
        startDir: repoDir
      }),
      (error: unknown) => {
        assert.ok(error instanceof StopError);
        assert.match(
          error.message,
          /preserved worktree '\.switchyard\/worktrees\/agent-missing-worktree' is already missing while branch 'agents\/missing-worktree' still exists/
        );
        return true;
      }
    );

    await git(repoDir, ["rev-parse", "--verify", "agents/missing-worktree"]);

    const events = await listEvents(repoDir, { sessionId: "session-missing-worktree" });
    assert.equal(events.length, 1);
    assert.equal(events[0]?.eventType, "stop.completed");
    assert.equal(events[0]?.payload.outcome, "already_not_running");
    assert.equal(events[0]?.payload.cleanupPerformed, false);
    assert.equal(events[0]?.payload.cleanupReason, "worktree_missing");
    assert.equal(events[0]?.payload.worktreePath, ".switchyard/worktrees/agent-missing-worktree");
  } finally {
    await removeTempDir(repoDir);
  }
});

test("stopCommand surfaces a missing preserved worktree before legacy cleanup gating", async () => {
  const repoDir = await createInitializedRepo();
  const worktreePath = join(repoDir, ".switchyard", "worktrees", "agent-legacy-missing-worktree");

  try {
    await git(repoDir, ["branch", "agents/legacy-missing-worktree"]);
    await createSession(repoDir, {
      id: "session-legacy-missing-worktree",
      agentName: "agent-legacy-missing-worktree",
      branch: "agents/legacy-missing-worktree",
      worktreePath,
      state: "stopped",
      runtimePid: null,
      createdAt: "2026-03-08T09:16:00.000Z",
      updatedAt: "2026-03-08T09:16:00.000Z"
    });

    await assert.rejects(
      () => stopCommand({
        selector: "agent-legacy-missing-worktree",
        cleanup: true,
        startDir: repoDir
      }),
      (error: unknown) => {
        assert.ok(error instanceof StopError);
        assert.match(
          error.message,
          /preserved worktree '\.switchyard\/worktrees\/agent-legacy-missing-worktree' is already missing while branch 'agents\/legacy-missing-worktree' still exists/
        );
        return true;
      }
    );

    const events = await listEvents(repoDir, { sessionId: "session-legacy-missing-worktree" });
    assert.equal(events.length, 1);
    assert.equal(events[0]?.payload.cleanupReason, "worktree_missing");
    assert.equal(events[0]?.payload.worktreePath, ".switchyard/worktrees/agent-legacy-missing-worktree");
  } finally {
    await removeTempDir(repoDir);
  }
});

test("stopCommand removes the worktree and branch after confirmed merge cleanup", async () => {
  const repoDir = await createInitializedRepo();
  const writes: string[] = [];
  const originalWrite = process.stdout.write.bind(process.stdout);
  const worktreePath = join(repoDir, ".switchyard", "worktrees", "agent-merged-cleanup");

  try {
    await slingCommand({
      agentName: "Agent Merged Cleanup",
      task: TEST_TASK,
      startDir: repoDir,
      spawnRuntime: async () => {
        return {
          pid: 6263,
          command: {
            command: "codex",
            args: []
          },
          readyAfterMs: 500
        };
      }
    });

    await git(worktreePath, ["config", "user.name", "Switchyard Test"]);
    await git(worktreePath, ["config", "user.email", "switchyard@example.com"]);
    await git(worktreePath, ["switch", "agents/agent-merged-cleanup"]);
    await git(worktreePath, ["commit", "--allow-empty", "-m", "Agent merged cleanup change"]);

    await stopCommand({
      selector: "agent-merged-cleanup",
      startDir: repoDir,
      isRuntimeAlive: (pid) => pid === 6263,
      stopRuntime: async () => true
    });

    await git(repoDir, ["merge", "--no-ff", "agents/agent-merged-cleanup", "-m", "Merge agent branch"]);

    process.stdout.write = ((chunk: string | Uint8Array) => {
      writes.push(typeof chunk === "string" ? chunk : chunk.toString());
      return true;
    }) as typeof process.stdout.write;

    await stopCommand({
      selector: "agent-merged-cleanup",
      cleanup: true,
      startDir: repoDir
    });

    await assert.rejects(async () => {
      await access(worktreePath);
    });
    await assert.rejects(async () => {
      await git(repoDir, ["rev-parse", "--verify", "agents/agent-merged-cleanup"]);
    });

    const sessions = await listSessions(repoDir);
    const events = await listEvents(repoDir, { sessionId: sessions[0]?.id });
    assert.equal(events.length, 3);
    assert.equal(events[2]?.eventType, "stop.completed");
    assert.equal(events[2]?.payload.cleanupPerformed, true);
    assert.equal(events[2]?.payload.cleanupMode, "merged");
  } finally {
    process.stdout.write = originalWrite;
    await removeTempDir(repoDir);
  }

  const output = writes.join("");
  assert.match(output, /Session agent-merged-cleanup is already stopped\./);
  assert.match(output, /Session: [^\n]+/);
  assert.match(output, /Cleanup: removed worktree and branch after confirming merge into main\./);
});

test("stopCommand uses the session base branch for merged cleanup when config drifts later", async () => {
  const repoDir = await createInitializedRepo();
  const writes: string[] = [];
  const originalWrite = process.stdout.write.bind(process.stdout);
  const worktreePath = join(repoDir, ".switchyard", "worktrees", "agent-target-drift");

  try {
    await slingCommand({
      agentName: "Agent Target Drift",
      task: TEST_TASK,
      startDir: repoDir,
      spawnRuntime: async () => {
        return {
          pid: 9091,
          command: {
            command: "codex",
            args: []
          },
          readyAfterMs: 500
        };
      }
    });

    await stopCommand({
      selector: "agent-target-drift",
      startDir: repoDir,
      isRuntimeAlive: (pid) => pid === 9091,
      stopRuntime: async () => true
    });

    await git(repoDir, ["merge", "--no-ff", "agents/agent-target-drift", "-m", "Merge agent target drift"]);
    await writeConfig(buildDefaultConfig(repoDir, "switchyard-test", "release"));

    process.stdout.write = ((chunk: string | Uint8Array) => {
      writes.push(typeof chunk === "string" ? chunk : chunk.toString());
      return true;
    }) as typeof process.stdout.write;

    await stopCommand({
      selector: "agent-target-drift",
      cleanup: true,
      startDir: repoDir
    });

    await assert.rejects(async () => {
      await access(worktreePath);
    });
    await assert.rejects(async () => {
      await git(repoDir, ["rev-parse", "--verify", "agents/agent-target-drift"]);
    });
  } finally {
    process.stdout.write = originalWrite;
    await removeTempDir(repoDir);
  }

  const output = writes.join("");
  assert.match(output, /Session agent-target-drift is already stopped\./);
  assert.match(output, /Session: [^\n]+/);
  assert.match(output, /Cleanup: removed worktree and branch after confirming merge into main\./);
});

test("stopCommand rejects --abandon without --cleanup", async () => {
  const repoDir = await createInitializedRepo();

  try {
    await slingCommand({
      agentName: "Agent Abandon Flag",
      task: TEST_TASK,
      startDir: repoDir,
      spawnRuntime: async () => {
        return {
          pid: 7374,
          command: {
            command: "codex",
            args: []
          },
          readyAfterMs: 500
        };
      }
    });

    await assert.rejects(async () => {
      await stopCommand({
        selector: "agent-abandon-flag",
        abandon: true,
        startDir: repoDir
      });
    }, /requires '--cleanup'/);
  } finally {
    await removeTempDir(repoDir);
  }
});

test("stopCommand treats an exit during shutdown as stopped instead of failed", async () => {
  const repoDir = await createInitializedRepo();

  try {
    await slingCommand({
      agentName: "Agent Race",
      task: TEST_TASK,
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
      task: TEST_TASK,
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
