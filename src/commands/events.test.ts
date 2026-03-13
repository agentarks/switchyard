import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { join } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { buildDefaultConfig, writeConfig } from "../config.js";
import { createEvent } from "../events/store.js";
import { EventsError } from "../errors.js";
import { createSession, listSessions } from "../sessions/store.js";
import { bootstrapSwitchyardLayout } from "../storage/bootstrap.js";
import { createTempGitRepo, removeTempDir } from "../test-helpers/git.js";
import { eventsCommand } from "./events.js";
import { slingCommand } from "./sling.js";

const execFileAsync = promisify(execFile);
const tsxCliPath = fileURLToPath(new URL("../../node_modules/tsx/dist/cli.mjs", import.meta.url));
const cliEntryPath = fileURLToPath(new URL("../index.ts", import.meta.url));

test("eventsCommand prints an empty-state message when no events exist", async () => {
  const repoDir = await createInitializedRepo();

  try {
    const output = await captureStdout(async () => {
      await eventsCommand({ startDir: repoDir });
    });

    assert.equal(output, "No Switchyard events recorded yet.\n");
  } finally {
    await removeTempDir(repoDir);
  }
});

test("eventsCommand prints recent events with operator-facing details", async () => {
  const repoDir = await createInitializedRepo();

  try {
    await createEvent(repoDir, {
      sessionId: "session-1",
      agentName: "agent-one",
      eventType: "sling.completed",
      payload: {
        branch: "agents/agent-one",
        runtimePid: 4242,
        readyAfterMs: 500
      },
      createdAt: "2026-03-08T09:00:00.000Z"
    });
    await createEvent(repoDir, {
      sessionId: "session-1",
      agentName: "agent-one",
      eventType: "mail.sent",
      payload: {
        bodyLength: 18,
        sender: "operator"
      },
      createdAt: "2026-03-08T10:00:00.000Z"
    });

    const output = await captureStdout(async () => {
      await eventsCommand({ startDir: repoDir });
    });

    assert.match(output, /Recent events for switchyard-test:/);
    assert.match(output, /TIME\tEVENT\tAGENT\tSESSION\tDETAILS/);
    assert.match(output, /2026-03-08T09:00:00.000Z\tsling.completed\tagent-one\tsession-1\tbranch=agents\/agent-one, readyAfterMs=500, runtimePid=4242/);
    assert.match(output, /2026-03-08T10:00:00.000Z\tmail.sent\tagent-one\tsession-1\tbodyLength=18, sender=operator/);
  } finally {
    await removeTempDir(repoDir);
  }
});

test("eventsCommand filters events for one resolved session", async () => {
  const repoDir = await createInitializedRepo();

  try {
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
        runtimePid: 1111,
        readyAfterMs: 500
      },
      createdAt: "2026-03-08T09:10:00.000Z"
    });
    await createEvent(repoDir, {
      sessionId: "session-2",
      agentName: "agent-two",
      eventType: "stop.completed",
      payload: {
        outcome: "stopped"
      },
      createdAt: "2026-03-08T09:15:00.000Z"
    });

    const output = await captureStdout(async () => {
      await eventsCommand({ startDir: repoDir, selector: "Agent One" });
    });

    assert.match(output, /Recent events for agent-one \(session-1\):/);
    assert.match(output, /sling.completed/);
    assert.doesNotMatch(output, /agent-two/);
    assert.doesNotMatch(output, /stop.completed/);
  } finally {
    await removeTempDir(repoDir);
  }
});

test("eventsCommand prints the resolved session id when a selected session has no events yet", async () => {
  const repoDir = await createInitializedRepo();

  try {
    await createSession(repoDir, {
      id: "session-empty-events",
      agentName: "agent-empty-events",
      branch: "agents/agent-empty-events",
      worktreePath: join(repoDir, ".switchyard", "worktrees", "agent-empty-events"),
      state: "running",
      runtimePid: 1212,
      createdAt: "2026-03-08T09:20:00.000Z",
      updatedAt: "2026-03-08T09:20:00.000Z"
    });

    const output = await captureStdout(async () => {
      await eventsCommand({ startDir: repoDir, selector: "Agent Empty Events" });
    });

    assert.equal(output, "No events recorded yet for agent-empty-events.\nSession: session-empty-events\n");
  } finally {
    await removeTempDir(repoDir);
  }
});

test("eventsCommand surfaces task handoff details from sling launch events", async () => {
  const repoDir = await createInitializedRepo();
  const task = "Review the current operator loop and call out the next concrete gap.";

  try {
    await slingCommand({
      agentName: "Agent Task Events",
      task,
      startDir: repoDir,
      spawnRuntime: async ({ runtimeArgs, onSpawned }) => {
        assert.deepEqual(runtimeArgs, ["exec", "--json", "--sandbox", "workspace-write", task]);
        const runtime = {
          pid: 7171,
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

    const sessions = await listSessions(repoDir);
    const sessionId = sessions[0]?.id;
    assert.ok(sessionId);

    const output = await captureStdout(async () => {
      await eventsCommand({ startDir: repoDir, selector: sessionId });
    });

    assert.match(output, /sling\.spawned/);
    assert.match(output, /sling\.completed/);
    assert.match(output, /taskSummary=\"Review the current operator loop and call out the next concrete gap\.\"/);
    assert.match(output, new RegExp(`taskSpecPath=\\.switchyard/specs/agent-task-events-${sessionId}\\.md`));
    assert.match(output, /runtimeCommand=\"codex exec --json --sandbox workspace-write\"/);
    assert.doesNotMatch(output, /runtimeCommand=\"codex exec --json --sandbox workspace-write Review the current operator loop/);
  } finally {
    await removeTempDir(repoDir);
  }
});

test("eventsCommand respects an explicit recent-event limit", async () => {
  const repoDir = await createInitializedRepo();

  try {
    await createEvent(repoDir, {
      sessionId: "session-1",
      agentName: "agent-one",
      eventType: "sling.spawned",
      payload: {
        runtimePid: 1111
      },
      createdAt: "2026-03-08T09:00:00.000Z"
    });
    await createEvent(repoDir, {
      sessionId: "session-1",
      agentName: "agent-one",
      eventType: "sling.completed",
      payload: {
        runtimePid: 1111,
        readyAfterMs: 500
      },
      createdAt: "2026-03-08T09:05:00.000Z"
    });

    const output = await captureStdout(async () => {
      await eventsCommand({ startDir: repoDir, limit: 1 });
    });

    assert.match(output, /2026-03-08T09:05:00.000Z\tsling.completed/);
    assert.doesNotMatch(output, /2026-03-08T09:00:00.000Z\tsling.spawned/);
  } finally {
    await removeTempDir(repoDir);
  }
});

test("eventsCommand rejects a non-positive recent-event limit", async () => {
  const repoDir = await createInitializedRepo();

  try {
    await assert.rejects(
      () => eventsCommand({ startDir: repoDir, limit: 0 }),
      (error: unknown) => {
        assert.ok(error instanceof EventsError);
        assert.match(error.message, /Invalid event limit '0'\. Use a positive integer\./);
        return true;
      }
    );
  } finally {
    await removeTempDir(repoDir);
  }
});

test("eventsCommand preserves the original oversized limit in the validation error", async () => {
  const repoDir = await createInitializedRepo();

  try {
    await assert.rejects(
      () => eventsCommand({ startDir: repoDir, limit: "9007199254740993" }),
      (error: unknown) => {
        assert.ok(error instanceof EventsError);
        assert.match(error.message, /Invalid event limit '9007199254740993'\. Use a positive integer\./);
        return true;
      }
    );
  } finally {
    await removeTempDir(repoDir);
  }
});

test("sy events parses --limit from the CLI", async () => {
  const repoDir = await createInitializedRepo();

  try {
    await createEvent(repoDir, {
      sessionId: "session-1",
      agentName: "agent-one",
      eventType: "sling.spawned",
      payload: {
        runtimePid: 1111
      },
      createdAt: "2026-03-08T09:00:00.000Z"
    });
    await createEvent(repoDir, {
      sessionId: "session-1",
      agentName: "agent-one",
      eventType: "mail.sent",
      payload: {
        sender: "operator",
        bodyLength: 8
      },
      createdAt: "2026-03-08T09:10:00.000Z"
    });

    const { stdout, stderr } = await execFileAsync(process.execPath, [tsxCliPath, cliEntryPath, "events", "--limit", "1"], {
      cwd: repoDir
    });

    assert.equal(stderr, "");
    assert.match(stdout, /2026-03-08T09:10:00.000Z\tmail.sent/);
    assert.doesNotMatch(stdout, /2026-03-08T09:00:00.000Z\tsling.spawned/);
  } finally {
    await removeTempDir(repoDir);
  }
});

test("sy events reports a missing --limit value through the Switchyard error contract", async () => {
  const repoDir = await createInitializedRepo();

  try {
    await assert.rejects(
      () => execFileAsync(process.execPath, [tsxCliPath, cliEntryPath, "events", "--limit"], { cwd: repoDir }),
      (error: unknown) => {
        assert.ok(error && typeof error === "object");
        assert.equal("code" in error ? error.code : undefined, 1);
        assert.equal("stdout" in error ? error.stdout : undefined, "");
        assert.match(
          "stderr" in error && typeof error.stderr === "string" ? error.stderr : "",
          /EVENTS_ERROR: Missing value for '--limit'\. Use '--limit <count>' with a positive integer\.\n/
        );
        return true;
      }
    );
  } finally {
    await removeTempDir(repoDir);
  }
});

test("eventsCommand reads events for a direct session id even when the session row is missing", async () => {
  const repoDir = await createInitializedRepo();

  try {
    await createEvent(repoDir, {
      sessionId: "session-orphan",
      agentName: "agent-orphan",
      eventType: "stop.completed",
      payload: {
        outcome: "stopped"
      },
      createdAt: "2026-03-08T11:00:00.000Z"
    });

    const output = await captureStdout(async () => {
      await eventsCommand({ startDir: repoDir, selector: "session-orphan" });
    });

    assert.match(output, /Recent events for session session-orphan:/);
    assert.match(output, /2026-03-08T11:00:00.000Z\tstop.completed\tagent-orphan\tsession-orphan\toutcome=stopped/);
  } finally {
    await removeTempDir(repoDir);
  }
});

test("eventsCommand resolves an exact session id even when the selector is not a valid agent name", async () => {
  const repoDir = await createInitializedRepo();

  try {
    await createSession(repoDir, {
      id: "!!!",
      agentName: "agent-bang",
      branch: "agents/agent-bang",
      worktreePath: join(repoDir, ".switchyard", "worktrees", "agent-bang"),
      state: "stopped",
      runtimePid: null,
      createdAt: "2026-03-08T11:05:00.000Z",
      updatedAt: "2026-03-08T11:05:00.000Z"
    });
    await createEvent(repoDir, {
      sessionId: "!!!",
      agentName: "agent-bang",
      eventType: "stop.completed",
      payload: {
        outcome: "stopped"
      },
      createdAt: "2026-03-08T11:10:00.000Z"
    });

    const output = await captureStdout(async () => {
      await eventsCommand({ startDir: repoDir, selector: "!!!" });
    });

    assert.match(output, /Recent events for agent-bang \(!{3}\):/);
    assert.match(output, /2026-03-08T11:10:00.000Z\tstop.completed\tagent-bang\t!!!\toutcome=stopped/);
  } finally {
    await removeTempDir(repoDir);
  }
});

test("eventsCommand resolves orphaned session-id events even when the selector is not a valid agent name", async () => {
  const repoDir = await createInitializedRepo();

  try {
    await createEvent(repoDir, {
      sessionId: "!!!",
      agentName: "agent-orphan",
      eventType: "stop.completed",
      payload: {
        outcome: "stopped"
      },
      createdAt: "2026-03-08T11:20:00.000Z"
    });

    const output = await captureStdout(async () => {
      await eventsCommand({ startDir: repoDir, selector: "!!!" });
    });

    assert.match(output, /Recent events for session !!!:/);
    assert.match(output, /2026-03-08T11:20:00.000Z\tstop.completed\tagent-orphan\t!!!\toutcome=stopped/);
  } finally {
    await removeTempDir(repoDir);
  }
});

test("eventsCommand reads orphaned events by normalized agent name when the session row is missing", async () => {
  const repoDir = await createInitializedRepo();

  try {
    await createEvent(repoDir, {
      sessionId: "session-orphan-agent",
      agentName: "agent-orphan",
      eventType: "stop.completed",
      payload: {
        outcome: "stopped"
      },
      createdAt: "2026-03-08T11:21:00.000Z"
    });

    const output = await captureStdout(async () => {
      await eventsCommand({ startDir: repoDir, selector: "Agent Orphan" });
    });

    assert.match(output, /Recent events for agent-orphan \(session-orphan-agent\):/);
    assert.match(
      output,
      /2026-03-08T11:21:00.000Z\tstop.completed\tagent-orphan\tsession-orphan-agent\toutcome=stopped/
    );
  } finally {
    await removeTempDir(repoDir);
  }
});

test("eventsCommand rejects selectors that match different sessions by id and agent name", async () => {
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
      () => eventsCommand({ startDir: repoDir, selector: "shared-name" }),
      (error: unknown) => {
        assert.ok(error instanceof EventsError);
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

test("eventsCommand rejects selectors that match multiple sessions by agent name", async () => {
  const repoDir = await createInitializedRepo();

  try {
    await createSession(repoDir, {
      id: "session-latest",
      agentName: "shared-agent",
      branch: "agents/shared-agent",
      worktreePath: join(repoDir, ".switchyard", "worktrees", "shared-agent-latest"),
      state: "running",
      runtimePid: 2112,
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
      () => eventsCommand({ startDir: repoDir, selector: "shared-agent" }),
      (error: unknown) => {
        assert.ok(error instanceof EventsError);
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

test("eventsCommand rejects orphaned agent-name selectors that span multiple session ids", async () => {
  const repoDir = await createInitializedRepo();

  try {
    await createEvent(repoDir, {
      sessionId: "session-shared-1",
      agentName: "shared-agent",
      eventType: "stop.completed",
      payload: {
        outcome: "stopped"
      },
      createdAt: "2026-03-08T13:10:00.000Z"
    });
    await createEvent(repoDir, {
      sessionId: "session-shared-2",
      agentName: "shared-agent",
      eventType: "mail.sent",
      payload: {
        sender: "operator",
        bodyLength: 12
      },
      createdAt: "2026-03-08T13:15:00.000Z"
    });

    await assert.rejects(
      () => eventsCommand({ startDir: repoDir, selector: "shared-agent" }),
      (error: unknown) => {
        assert.ok(error instanceof EventsError);
        assert.equal(
          error.message,
          "Selector 'shared-agent' is ambiguous: it matches orphaned events for multiple sessions by agent name ('session-shared-1', 'session-shared-2'). Use an exact session id."
        );
        return true;
      }
    );
  } finally {
    await removeTempDir(repoDir);
  }
});

test("eventsCommand rejects orphaned agent-name selectors that span multiple session ids outside the recent-event limit", async () => {
  const repoDir = await createInitializedRepo();

  try {
    await createEvent(repoDir, {
      sessionId: "session-shared-old",
      agentName: "shared-agent",
      eventType: "stop.completed",
      payload: {
        outcome: "stopped"
      },
      createdAt: "2026-03-08T13:00:00.000Z"
    });

    for (let index = 0; index < 10; index += 1) {
      const minute = String(10 + index).padStart(2, "0");
      await createEvent(repoDir, {
        sessionId: "session-shared-new",
        agentName: "shared-agent",
        eventType: "mail.sent",
        payload: {
          sender: "operator",
          bodyLength: 12
        },
        createdAt: `2026-03-08T13:${minute}:00.000Z`
      });
    }

    await assert.rejects(
      () => eventsCommand({ startDir: repoDir, selector: "shared-agent" }),
      (error: unknown) => {
        assert.ok(error instanceof EventsError);
        assert.equal(
          error.message,
          "Selector 'shared-agent' is ambiguous: it matches orphaned events for multiple sessions by agent name ('session-shared-new', 'session-shared-old'). Use an exact session id."
        );
        return true;
      }
    );
  } finally {
    await removeTempDir(repoDir);
  }
});

test("eventsCommand rejects selectors that match orphaned events and a session by agent name", async () => {
  const repoDir = await createInitializedRepo();

  try {
    await createSession(repoDir, {
      id: "session-agent-shared",
      agentName: "shared-name",
      branch: "agents/shared-name",
      worktreePath: join(repoDir, ".switchyard", "worktrees", "shared-name"),
      state: "stopped",
      runtimePid: null,
      createdAt: "2026-03-08T13:00:00.000Z",
      updatedAt: "2026-03-08T13:00:00.000Z"
    });
    await createEvent(repoDir, {
      sessionId: "shared-name",
      agentName: "agent-orphan",
      eventType: "stop.completed",
      payload: {
        outcome: "stopped"
      },
      createdAt: "2026-03-08T13:05:00.000Z"
    });

    await assert.rejects(
      () => eventsCommand({ startDir: repoDir, selector: "shared-name" }),
      (error: unknown) => {
        assert.ok(error instanceof EventsError);
        assert.match(
          error.message,
          /Selector 'shared-name' is ambiguous: it matches orphaned events for session 'shared-name' and session 'session-agent-shared' by agent name\./
        );
        return true;
      }
    );
  } finally {
    await removeTempDir(repoDir);
  }
});

async function createInitializedRepo(): Promise<string> {
  const repoDir = await createTempGitRepo("switchyard-events-command-test-");
  await bootstrapSwitchyardLayout(repoDir);
  await writeConfig(buildDefaultConfig(repoDir, "switchyard-test", "main"));
  return repoDir;
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
