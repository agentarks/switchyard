import test from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { buildDefaultConfig, writeConfig } from "../config.js";
import { createEvent, listEvents } from "../events/store.js";
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
      runtimeCommand: "codex --json",
      readyAfterMs: 500
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

test("statusCommand includes the readiness detail for a freshly launched session", async () => {
  const repoDir = await createInitializedRepo();
  const writes: string[] = [];
  const originalWrite = process.stdout.write.bind(process.stdout);

  await createSession(repoDir, {
    id: "session-ready",
    agentName: "agent-ready",
    branch: "agents/agent-ready",
    worktreePath: join(repoDir, ".switchyard", "worktrees", "agent-ready"),
    state: "running",
    runtimePid: 2222,
    createdAt: "2026-03-08T11:00:00.000Z",
    updatedAt: "2026-03-08T11:00:00.000Z"
  });
  await createEvent(repoDir, {
    sessionId: "session-ready",
    agentName: "agent-ready",
    eventType: "sling.completed",
    payload: {
      baseBranch: "main",
      runtimePid: 2222,
      readyAfterMs: 500
    },
    createdAt: "2026-03-08T11:01:00.000Z"
  });

  process.stdout.write = ((chunk: string | Uint8Array) => {
    writes.push(typeof chunk === "string" ? chunk : chunk.toString());
    return true;
  }) as typeof process.stdout.write;

  try {
    await statusCommand({
      startDir: repoDir,
      isRuntimeAlive: (pid) => pid === 2222
    });
  } finally {
    process.stdout.write = originalWrite;
    await removeTempDir(repoDir);
  }

  assert.match(
    writes.join(""),
    /running\tagent-ready\tagents\/agent-ready\t\.switchyard\/worktrees\/agent-ready\t2026-03-08T11:00:00.000Z\t2026-03-08T11:01:00.000Z sling\.completed runtimePid=2222, baseBranch=main, readyAfterMs=500/
  );
});

test("statusCommand includes the mail list view in the recent event summary", async () => {
  const repoDir = await createInitializedRepo();
  const writes: string[] = [];
  const originalWrite = process.stdout.write.bind(process.stdout);

  await createSession(repoDir, {
    id: "session-mail-view",
    agentName: "agent-mail-view",
    branch: "agents/agent-mail-view",
    worktreePath: join(repoDir, ".switchyard", "worktrees", "agent-mail-view"),
    state: "stopped",
    runtimePid: null,
    createdAt: "2026-03-08T11:30:00.000Z",
    updatedAt: "2026-03-08T11:30:00.000Z"
  });
  await createEvent(repoDir, {
    sessionId: "session-mail-view",
    agentName: "agent-mail-view",
    eventType: "mail.listed",
    payload: {
      view: "unread_only",
      messageCount: 2,
      unreadCount: 2
    },
    createdAt: "2026-03-08T11:31:00.000Z"
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
  } finally {
    process.stdout.write = originalWrite;
    await removeTempDir(repoDir);
  }

  assert.match(
    writes.join(""),
    /stopped\tagent-mail-view\tagents\/agent-mail-view\t\.switchyard\/worktrees\/agent-mail-view\t2026-03-08T11:30:00.000Z\t2026-03-08T11:31:00.000Z mail\.listed view=unread_only, messageCount=2, unreadCount=2/
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
      runtimePid: 9090,
      readyAfterMs: 500
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
      isRuntimeAlive: () => false,
      now: () => "2026-03-08T09:45:00.000Z"
    });

    const sessions = await listSessions(repoDir);
    assert.equal(sessions[0]?.state, "failed");
    assert.equal(sessions[0]?.runtimePid, null);
    const events = await listEvents(repoDir, { sessionId: "agent-stale" });
    assert.equal(events.length, 2);
    assert.equal(events[1]?.eventType, "runtime.exited");
    assert.equal(events[1]?.payload.reason, "pid_not_alive");
  } finally {
    process.stdout.write = originalWrite;
    await removeTempDir(repoDir);
  }

  const output = writes.join("");
  assert.match(
    output,
    /failed\tagent-stale\tagents\/agent-stale\t\.switchyard\/worktrees\/agent-stale\t2026-03-08T09:45:00.000Z\t2026-03-08T09:45:00.000Z runtime\.exited reason=pid_not_alive, runtimePid=9090/
  );
});

test("statusCommand shows the reconciled recent event even when event persistence fails", async () => {
  const repoDir = await createInitializedRepo();
  const writes: string[] = [];
  const originalWrite = process.stdout.write.bind(process.stdout);

  await createSession(repoDir, {
    id: "agent-event-fail",
    agentName: "agent-event-fail",
    branch: "agents/agent-event-fail",
    worktreePath: join(repoDir, ".switchyard", "worktrees", "agent-event-fail"),
    state: "running",
    runtimePid: 9090,
    createdAt: "2026-03-06T09:00:00.000Z",
    updatedAt: "2026-03-06T10:00:00.000Z"
  });
  await createEvent(repoDir, {
    sessionId: "agent-event-fail",
    agentName: "agent-event-fail",
    eventType: "sling.completed",
    payload: {
      runtimePid: 9090,
      readyAfterMs: 500
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
      isRuntimeAlive: () => false,
      now: () => "2026-03-08T10:00:00.000Z",
      recordEvent: async () => {
        throw new Error("events unavailable");
      }
    });

    const sessions = await listSessions(repoDir);
    assert.equal(sessions[0]?.state, "failed");
    assert.equal(sessions[0]?.runtimePid, null);

    const events = await listEvents(repoDir, { sessionId: "agent-event-fail" });
    assert.equal(events.length, 1);
    assert.equal(events[0]?.eventType, "sling.completed");
  } finally {
    process.stdout.write = originalWrite;
    await removeTempDir(repoDir);
  }

  const output = writes.join("");
  assert.match(
    output,
    /failed\tagent-event-fail\tagents\/agent-event-fail\t\.switchyard\/worktrees\/agent-event-fail\t2026-03-08T10:00:00.000Z\t2026-03-08T10:00:00.000Z runtime\.exited reason=pid_not_alive, runtimePid=9090/
  );
  assert.doesNotMatch(output, /failed\tagent-event-fail[^\n]*sling\.(started|completed)/);
});

test("statusCommand marks starting sessions that die before readiness as failed", async () => {
  const repoDir = await createInitializedRepo();
  const writes: string[] = [];
  const originalWrite = process.stdout.write.bind(process.stdout);

  await createSession(repoDir, {
    id: "agent-booting",
    agentName: "agent-booting",
    branch: "agents/agent-booting",
    worktreePath: join(repoDir, ".switchyard", "worktrees", "agent-booting"),
    state: "starting",
    runtimePid: 8080,
    createdAt: "2026-03-06T09:00:00.000Z",
    updatedAt: "2026-03-06T10:00:00.000Z"
  });
  await createEvent(repoDir, {
    sessionId: "agent-booting",
    agentName: "agent-booting",
    eventType: "sling.completed",
    payload: {
      runtimePid: 8080,
      readyAfterMs: 500
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
      isRuntimeAlive: () => false,
      now: () => "2026-03-08T09:50:00.000Z"
    });

    const sessions = await listSessions(repoDir);
    assert.equal(sessions[0]?.state, "failed");
    assert.equal(sessions[0]?.runtimePid, null);
    const events = await listEvents(repoDir, { sessionId: "agent-booting" });
    assert.equal(events.length, 2);
    assert.equal(events[1]?.eventType, "runtime.exited_early");
    assert.equal(events[1]?.payload.reason, "pid_not_alive");
  } finally {
    process.stdout.write = originalWrite;
    await removeTempDir(repoDir);
  }

  const output = writes.join("");
  assert.match(
    output,
    /failed\tagent-booting\tagents\/agent-booting\t\.switchyard\/worktrees\/agent-booting\t2026-03-08T09:50:00.000Z\t2026-03-08T09:50:00.000Z runtime\.exited_early reason=pid_not_alive, runtimePid=8080/
  );
});

test("statusCommand marks legacy active sessions without a pid as failed", async () => {
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
      isRuntimeAlive: () => true,
      now: () => "2026-03-08T09:55:00.000Z"
    });

    const sessions = await listSessions(repoDir);
    assert.equal(sessions[0]?.state, "failed");
    assert.equal(sessions[0]?.runtimePid, null);
    const events = await listEvents(repoDir, { sessionId: "agent-legacy" });
    assert.equal(events.length, 1);
    assert.equal(events[0]?.eventType, "runtime.exited");
    assert.equal(events[0]?.payload.reason, "missing_runtime_pid");
  } finally {
    process.stdout.write = originalWrite;
    await removeTempDir(repoDir);
  }

  const output = writes.join("");
  assert.match(
    output,
    /failed\tagent-legacy\tagents\/agent-legacy\t\.switchyard\/worktrees\/agent-legacy\t2026-03-08T09:55:00.000Z\t2026-03-08T09:55:00.000Z runtime\.exited reason=missing_runtime_pid/
  );
});

async function createInitializedRepo(): Promise<string> {
  const repoDir = await createTempGitRepo("switchyard-status-command-test-");
  await bootstrapSwitchyardLayout(repoDir);
  await writeConfig(buildDefaultConfig(repoDir, "switchyard-test", "main"));
  return repoDir;
}
