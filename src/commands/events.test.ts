import test from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { buildDefaultConfig, writeConfig } from "../config.js";
import { createEvent } from "../events/store.js";
import { createSession } from "../sessions/store.js";
import { bootstrapSwitchyardLayout } from "../storage/bootstrap.js";
import { createTempGitRepo, removeTempDir } from "../test-helpers/git.js";
import { eventsCommand } from "./events.js";

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
