import test from "node:test";
import assert from "node:assert/strict";
import { access, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { buildDefaultConfig, writeConfig } from "../config.js";
import { listEvents } from "../events/store.js";
import { listSessions } from "../sessions/store.js";
import { bootstrapSwitchyardLayout } from "../storage/bootstrap.js";
import { createTempGitRepo, git, removeTempDir } from "../test-helpers/git.js";
import { statusCommand } from "./status.js";
import { slingCommand } from "./sling.js";

test("slingCommand creates a worktree and persists a started session", async () => {
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
      spawnRuntime: async ({ runtimeArgs, onSpawned }) => {
        assert.deepEqual(runtimeArgs, ["--model", "gpt-5"]);
        const runtime = {
          pid: 4242,
          command: {
            command: "codex",
            args: runtimeArgs
          }
        };

        await onSpawned?.(runtime);

        return {
          ...runtime,
          readyAfterMs: 500
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
  assert.equal(sessions[0]?.state, "starting");
  assert.equal(sessions[0]?.runtimePid, 4242);
  assert.equal(sessions[0]?.branch, "agents/agent-one");
  assert.equal(sessions[0]?.baseBranch, "main");
  assert.equal(sessions[0]?.worktreePath, join(repoDir, ".switchyard", "worktrees", "agent-one"));

  const events = await listEvents(repoDir, { sessionId: sessions[0]?.id });
  assert.equal(events.length, 2);
  const spawnedEvent = events.find((event) => event.eventType === "sling.spawned");
  const completedEvent = events.find((event) => event.eventType === "sling.completed");
  assert.equal(spawnedEvent?.agentName, "agent-one");
  assert.equal(spawnedEvent?.payload.runtimePid, 4242);
  assert.equal(spawnedEvent?.payload.branch, "agents/agent-one");
  assert.equal(spawnedEvent?.payload.baseBranch, "main");
  assert.equal(completedEvent?.agentName, "agent-one");
  assert.equal(completedEvent?.payload.runtimePid, 4242);
  assert.equal(completedEvent?.payload.branch, "agents/agent-one");
  assert.equal(completedEvent?.payload.baseBranch, "main");
  assert.equal(completedEvent?.payload.readyAfterMs, 500);
  assert.ok(
    typeof spawnedEvent?.createdAt === "string"
    && typeof completedEvent?.createdAt === "string"
    && spawnedEvent.createdAt < completedEvent.createdAt
  );

  assert.match(writes.join(""), /Spawned agent-one/);
  assert.match(writes.join(""), /State: starting/);
  assert.match(writes.join(""), /Base: main/);
  assert.match(writes.join(""), /Runtime: codex --model gpt-5/);
  assert.match(writes.join(""), /Ready: initial launch check passed after 500ms/);

  await removeTempDir(repoDir);
});

test("statusCommand promotes a started session to running after the first successful liveness check", async () => {
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
      spawnRuntime: async ({ onSpawned }) => {
        const runtime = {
          pid: 31337,
          command: {
            command: "codex",
            args: []
          }
        };

        await onSpawned?.(runtime);

        return {
          ...runtime,
          readyAfterMs: 500
        };
      }
    });

    writes.length = 0;
    await statusCommand({
      startDir: repoDir,
      isRuntimeAlive: (pid) => pid === 31337,
      now: () => "2026-03-09T09:10:00.000Z"
    });
  } finally {
    process.stdout.write = originalWrite;
  }

  try {
    const output = writes.join("");
    const sessions = await listSessions(repoDir);
    const events = await listEvents(repoDir, { sessionId: sessions[0]?.id });
    const eventTypes = events.map((event) => event.eventType);
    const readyEvent = events.find((event) => event.eventType === "runtime.ready");

    assert.equal(sessions[0]?.state, "running");
    assert.equal(sessions[0]?.runtimePid, 31337);
    assert.equal(events.length, 3);
    assert.deepEqual(eventTypes.sort(), ["runtime.ready", "sling.completed", "sling.spawned"]);
    assert.equal(readyEvent?.payload.signal, "pid_alive");
    assert.match(
      output,
      /running\tagent-two\tagents\/agent-two\t\.switchyard\/worktrees\/agent-two\t2026-03-09T09:10:00.000Z\t0\t2026-03-09T09:10:00.000Z runtime\.ready signal=pid_alive, runtimePid=31337/
    );
  } finally {
    await removeTempDir(repoDir);
  }
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
            },
            readyAfterMs: 500
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
      spawnRuntime: async ({ onSpawned }) => {
        attempts += 1;
        const runtime = {
          pid: 2027,
          command: {
            command: "codex",
            args: []
          }
        };

        await onSpawned?.(runtime);

        return {
          ...runtime,
          readyAfterMs: 500
        };
      }
    });

    const sessions = await listSessions(repoDir);
    const agentThreeSessions = sessions.filter((session) => session.agentName === "agent-three");
    const events = await listEvents(repoDir, { agentName: "agent-three" });

    assert.equal(attempts, 2);
    assert.equal(agentThreeSessions.length, 2);
    assert.equal(agentThreeSessions[0]?.state, "starting");
    assert.equal(agentThreeSessions[0]?.runtimePid, 2027);
    assert.equal(agentThreeSessions[1]?.state, "failed");
    assert.equal(agentThreeSessions[1]?.runtimePid, null);
    assert.notEqual(agentThreeSessions[0]?.id, agentThreeSessions[1]?.id);
    assert.equal(events.length, 3);
    assert.equal(events.filter((event) => event.eventType === "sling.failed").length, 1);
    assert.equal(events.find((event) => event.eventType === "sling.failed")?.payload.cleanupSucceeded, true);
    assert.equal(events.filter((event) => event.eventType === "sling.spawned").length, 1);
    assert.equal(events.filter((event) => event.eventType === "sling.completed").length, 1);
    assert.match(writes.join(""), /Spawned agent-three/);
  } finally {
    process.stdout.write = originalWrite;
    await removeTempDir(repoDir);
  }
});

test("slingCommand keeps a started session when event persistence fails", async () => {
  const repoDir = await createInitializedRepo();

  try {
    await slingCommand({
      agentName: "Agent Four",
      startDir: repoDir,
      spawnRuntime: async () => {
        return {
          pid: 4040,
          command: {
            command: "codex",
            args: []
          },
          readyAfterMs: 500
        };
      },
      recordEvent: async () => {
        throw new Error("events unavailable");
      }
    });

    const sessions = await listSessions(repoDir);
    assert.equal(sessions.length, 1);
    assert.equal(sessions[0]?.state, "starting");
    assert.equal(sessions[0]?.runtimePid, 4040);
    const events = await listEvents(repoDir, { sessionId: sessions[0]?.id });
    assert.deepEqual(events, []);
  } finally {
    await removeTempDir(repoDir);
  }
});

test("slingCommand records an early readiness failure after launch", async () => {
  const repoDir = await createInitializedRepo();

  try {
    await assert.rejects(async () => {
      await slingCommand({
        agentName: "Agent Crash",
        startDir: repoDir,
        spawnRuntime: async ({ onSpawned }) => {
          const runtime = {
            pid: 9001,
            command: {
              command: "codex",
              args: []
            }
          };

          await onSpawned?.(runtime);
          throw new Error("Codex exited before Switchyard marked the session ready (exit code 1).");
        }
      });
    }, /Codex exited before Switchyard marked the session ready/);

    const sessions = await listSessions(repoDir);
    assert.equal(sessions.length, 1);
    assert.equal(sessions[0]?.state, "failed");
    assert.equal(sessions[0]?.runtimePid, null);

    const events = await listEvents(repoDir, { sessionId: sessions[0]?.id });
    assert.equal(events.length, 2);
    const spawnedEvent = events.find((event) => event.eventType === "sling.spawned");
    const failedEvent = events.find((event) => event.eventType === "sling.failed");
    assert.equal(spawnedEvent?.payload.runtimePid, 9001);
    assert.match(String(failedEvent?.payload.errorMessage), /marked the session ready/);
    assert.ok(
      typeof spawnedEvent?.createdAt === "string"
      && typeof failedEvent?.createdAt === "string"
      && spawnedEvent.createdAt < failedEvent.createdAt
    );
  } finally {
    await removeTempDir(repoDir);
  }
});

test("slingCommand stops the launched runtime and cleans up when session persistence fails after spawn", async () => {
  const repoDir = await createInitializedRepo();
  const worktreePath = join(repoDir, ".switchyard", "worktrees", "agent-persist-fail");
  const branchName = "agents/agent-persist-fail";
  const stoppedPids: number[] = [];

  try {
    await assert.rejects(async () => {
      await slingCommand({
        agentName: "Agent Persist Fail",
        startDir: repoDir,
        spawnRuntime: async ({ onSpawned }) => {
          const runtime = {
            pid: 5151,
            command: {
              command: "codex",
              args: []
            }
          };

          await onSpawned?.(runtime);

          return {
            ...runtime,
            readyAfterMs: 500
          };
        },
        createSessionRecord: async (_projectRoot, input) => {
          if (input.state === "starting") {
            throw new Error("sessions unavailable");
          }

          return input;
        },
        stopRuntime: async (pid) => {
          stoppedPids.push(pid);
          return true;
        }
      });
    }, /Failed to persist session after runtime launch: sessions unavailable/);

    const sessions = await listSessions(repoDir);
    assert.deepEqual(sessions, []);

    const events = await listEvents(repoDir, { agentName: "agent-persist-fail" });
    assert.equal(events.length, 2);
    assert.equal(events[0]?.eventType, "sling.spawned");
    assert.equal(events[1]?.eventType, "sling.failed");
    assert.equal(events[1]?.payload.runtimePid, 5151);
    assert.equal(events[1]?.payload.runtimeStopped, true);
    assert.equal(events[1]?.payload.cleanupSucceeded, true);
    assert.deepEqual(stoppedPids, [5151]);

    await assert.rejects(async () => {
      await access(worktreePath);
    });
    await assert.rejects(async () => {
      await git(repoDir, ["rev-parse", "--verify", branchName]);
    }, /Needed a single revision/);
  } finally {
    await removeTempDir(repoDir);
  }
});

async function createInitializedRepo(): Promise<string> {
  const repoDir = await createTempGitRepo("switchyard-sling-command-test-");
  await bootstrapSwitchyardLayout(repoDir);
  await writeConfig(buildDefaultConfig(repoDir, "switchyard-test", "main"));
  return repoDir;
}
