import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { buildDefaultConfig, writeConfig } from "../config.js";
import { createEvent, listEvents } from "../events/store.js";
import { createMail, readUnreadMailForSession } from "../mail/store.js";
import { createSession, listSessions } from "../sessions/store.js";
import { bootstrapSwitchyardLayout } from "../storage/bootstrap.js";
import { createTempGitRepo, git, removeTempDir } from "../test-helpers/git.js";
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
  assert.match(output, /STATE\tSESSION\tAGENT\tBRANCH\tWORKTREE\tUPDATED\tUNREAD\tCLEANUP\tRECENT/);
  assert.match(
    output,
    /stopped\tagent-two\tagent-two\tagents\/agent-two\t\.switchyard\/worktrees\/agent-two\t2026-03-06T12:00:00.000Z\t0\t[^\t]+\t-/
  );
  assert.match(
    output,
    /running\tagent-one\tagent-one\tagents\/agent-one\t\.switchyard\/worktrees\/agent-one\t2026-03-06T10:00:00.000Z\t0\t[^\t]+\t-/
  );
  assert.ok(output.indexOf("agent-two") < output.indexOf("agent-one"));
});

test("statusCommand shows cleanup readiness for active and preserved sessions", async () => {
  const repoDir = await createInitializedRepo();
  const writes: string[] = [];
  const originalWrite = process.stdout.write.bind(process.stdout);

  try {
    await git(repoDir, ["branch", "agents/agent-active"]);
    await git(repoDir, ["branch", "agents/merged-ready"]);
    await git(repoDir, ["branch", "agents/missing-worktree"]);
    await git(repoDir, ["switch", "-c", "agents/not-ready"]);
    await writeFile(join(repoDir, "not-ready.txt"), "pending merge\n", "utf8");
    await git(repoDir, ["add", "not-ready.txt"]);
    await git(repoDir, ["commit", "-m", "Add preserved branch change"]);
    await git(repoDir, ["switch", "main"]);
    await mkdir(join(repoDir, ".switchyard", "worktrees", "agent-active"), { recursive: true });
    await mkdir(join(repoDir, ".switchyard", "worktrees", "agent-merged"), { recursive: true });
    await mkdir(join(repoDir, ".switchyard", "worktrees", "agent-unmerged"), { recursive: true });

    await createSession(repoDir, {
      id: "session-active",
      agentName: "agent-active",
      branch: "agents/agent-active",
      baseBranch: "main",
      worktreePath: join(repoDir, ".switchyard", "worktrees", "agent-active"),
      state: "running",
      runtimePid: 1111,
      createdAt: "2026-03-08T09:00:00.000Z",
      updatedAt: "2026-03-08T09:00:00.000Z"
    });
    await createSession(repoDir, {
      id: "session-merged",
      agentName: "agent-merged",
      branch: "agents/merged-ready",
      baseBranch: "main",
      worktreePath: join(repoDir, ".switchyard", "worktrees", "agent-merged"),
      state: "stopped",
      runtimePid: null,
      createdAt: "2026-03-08T09:05:00.000Z",
      updatedAt: "2026-03-08T09:05:00.000Z"
    });
    await createSession(repoDir, {
      id: "session-absent",
      agentName: "agent-absent",
      branch: "agents/absent-ready",
      baseBranch: "main",
      worktreePath: join(repoDir, ".switchyard", "worktrees", "agent-absent"),
      state: "stopped",
      runtimePid: null,
      createdAt: "2026-03-08T09:10:00.000Z",
      updatedAt: "2026-03-08T09:10:00.000Z"
    });
    await createSession(repoDir, {
      id: "session-missing-worktree",
      agentName: "agent-missing-worktree",
      branch: "agents/missing-worktree",
      baseBranch: "main",
      worktreePath: join(repoDir, ".switchyard", "worktrees", "agent-missing-worktree"),
      state: "stopped",
      runtimePid: null,
      createdAt: "2026-03-08T09:12:00.000Z",
      updatedAt: "2026-03-08T09:12:00.000Z"
    });
    await createSession(repoDir, {
      id: "session-unmerged",
      agentName: "agent-unmerged",
      branch: "agents/not-ready",
      baseBranch: "main",
      worktreePath: join(repoDir, ".switchyard", "worktrees", "agent-unmerged"),
      state: "stopped",
      runtimePid: null,
      createdAt: "2026-03-08T09:15:00.000Z",
      updatedAt: "2026-03-08T09:15:00.000Z"
    });
    await createSession(repoDir, {
      id: "session-legacy-cleanup",
      agentName: "agent-legacy-cleanup",
      branch: "agents/legacy-cleanup",
      worktreePath: join(repoDir, ".switchyard", "worktrees", "agent-legacy-cleanup"),
      state: "failed",
      runtimePid: null,
      createdAt: "2026-03-08T09:20:00.000Z",
      updatedAt: "2026-03-08T09:20:00.000Z"
    });

    process.stdout.write = ((chunk: string | Uint8Array) => {
      writes.push(typeof chunk === "string" ? chunk : chunk.toString());
      return true;
    }) as typeof process.stdout.write;

    await statusCommand({
      startDir: repoDir,
      isRuntimeAlive: (pid) => pid === 1111
    });
  } finally {
    process.stdout.write = originalWrite;
    await removeTempDir(repoDir);
  }

  const output = writes.join("");
  assert.match(output, /running\tsession-active\tagent-active[^\n]*\tstop-then:merged\t-/);
  assert.match(output, /stopped\tsession-merged\tagent-merged[^\n]*\tready:merged\t-/);
  assert.match(output, /stopped\tsession-absent\tagent-absent[^\n]*\tready:absent\t-/);
  assert.match(
    output,
    /stopped\tsession-missing-worktree\tagent-missing-worktree[^\n]*\tabandon-only:artifacts-missing\t-/
  );
  assert.match(output, /stopped\tsession-unmerged\tagent-unmerged[^\n]*\tabandon-only:not-merged\t-/);
  assert.match(output, /failed\tsession-legacy-cleanup\tagent-legacy-cleanup[^\n]*\tabandon-only:legacy\t-/);
});

test("statusCommand prints only the selected session and reconciles only that session", async () => {
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
    state: "running",
    runtimePid: 2222,
    createdAt: "2026-03-08T09:05:00.000Z",
    updatedAt: "2026-03-08T09:05:00.000Z"
  });

  process.stdout.write = ((chunk: string | Uint8Array) => {
    writes.push(typeof chunk === "string" ? chunk : chunk.toString());
    return true;
  }) as typeof process.stdout.write;

  try {
    await statusCommand({
      startDir: repoDir,
      selector: "Agent One",
      isRuntimeAlive: () => false,
      now: () => "2026-03-08T10:00:00.000Z"
    });

    const sessions = await listSessions(repoDir);
    assert.equal(sessions.find((session) => session.id === "session-1")?.state, "failed");
    assert.equal(sessions.find((session) => session.id === "session-2")?.state, "running");

    const sessionOneEvents = await listEvents(repoDir, { sessionId: "session-1" });
    const sessionTwoEvents = await listEvents(repoDir, { sessionId: "session-2" });
    assert.equal(sessionOneEvents.length, 1);
    assert.equal(sessionOneEvents[0]?.eventType, "runtime.exited");
    assert.equal(sessionTwoEvents.length, 0);
  } finally {
    process.stdout.write = originalWrite;
    await removeTempDir(repoDir);
  }

  const output = writes.join("");
  assert.match(output, /^Status for agent-one \(session-1\):/m);
  assert.match(output, /Base: -/);
  assert.match(output, /Runtime pid: -/);
  assert.match(output, /Created: 2026-03-08T09:00:00.000Z/);
  assert.match(output, /Unread: 0/);
  assert.match(output, /Cleanup: [^\n]+/);
  assert.match(output, /Recent: 2026-03-08T10:00:00.000Z runtime\.exited reason=pid_not_alive, runtimePid=1111/);
  assert.match(
    output,
    /failed\tsession-1\tagent-one\tagents\/agent-one\t\.switchyard\/worktrees\/agent-one\t2026-03-08T10:00:00.000Z\t0\t[^\t]+\t2026-03-08T10:00:00.000Z runtime\.exited reason=pid_not_alive, runtimePid=1111/
  );
  assert.doesNotMatch(output, /session-2/);
});

test("statusCommand selected-session view surfaces stored base branch and runtime pid even when a later event becomes recent", async () => {
  const repoDir = await createInitializedRepo();
  const writes: string[] = [];
  const originalWrite = process.stdout.write.bind(process.stdout);

  await createSession(repoDir, {
    id: "session-selected",
    agentName: "agent-selected",
    branch: "agents/agent-selected",
    baseBranch: "main",
    worktreePath: join(repoDir, ".switchyard", "worktrees", "agent-selected"),
    state: "running",
    runtimePid: 5151,
    createdAt: "2026-03-08T12:00:00.000Z",
    updatedAt: "2026-03-08T12:05:00.000Z"
  });
  await createEvent(repoDir, {
    sessionId: "session-selected",
    agentName: "agent-selected",
    eventType: "mail.sent",
    payload: {
      sender: "operator",
      bodyLength: 18
    },
    createdAt: "2026-03-08T12:06:00.000Z"
  });

  process.stdout.write = ((chunk: string | Uint8Array) => {
    writes.push(typeof chunk === "string" ? chunk : chunk.toString());
    return true;
  }) as typeof process.stdout.write;

  try {
    await statusCommand({
      startDir: repoDir,
      selector: "session-selected",
      isRuntimeAlive: (pid) => pid === 5151
    });
  } finally {
    process.stdout.write = originalWrite;
    await removeTempDir(repoDir);
  }

  const output = writes.join("");
  assert.match(output, /^Status for agent-selected \(session-selected\):/m);
  assert.match(output, /Base: main/);
  assert.match(output, /Runtime pid: 5151/);
  assert.match(output, /Created: 2026-03-08T12:00:00.000Z/);
  assert.match(output, /Unread: 0/);
  assert.match(output, /Cleanup: [^\n]+/);
  assert.match(output, /Recent: 2026-03-08T12:06:00.000Z mail\.sent sender=operator, bodyLength=18/);
  assert.match(
    output,
    /running\tsession-selected\tagent-selected\tagents\/agent-selected\t\.switchyard\/worktrees\/agent-selected\t2026-03-08T12:05:00.000Z\t0\t[^\t]+\t2026-03-08T12:06:00.000Z mail\.sent sender=operator, bodyLength=18/
  );
});

test("statusCommand resolves an exact session id even when the selector is not a valid agent name", async () => {
  const repoDir = await createInitializedRepo();
  const writes: string[] = [];
  const originalWrite = process.stdout.write.bind(process.stdout);

  await createSession(repoDir, {
    id: "!!!",
    agentName: "agent-bang",
    branch: "agents/agent-bang",
    worktreePath: join(repoDir, ".switchyard", "worktrees", "agent-bang"),
    state: "stopped",
    runtimePid: null,
    createdAt: "2026-03-08T09:00:00.000Z",
    updatedAt: "2026-03-08T09:00:00.000Z"
  });

  process.stdout.write = ((chunk: string | Uint8Array) => {
    writes.push(typeof chunk === "string" ? chunk : chunk.toString());
    return true;
  }) as typeof process.stdout.write;

  try {
    await statusCommand({
      startDir: repoDir,
      selector: "!!!",
      isRuntimeAlive: () => false
    });
  } finally {
    process.stdout.write = originalWrite;
    await removeTempDir(repoDir);
  }

  const output = writes.join("");
  assert.match(output, /^Status for agent-bang \(!!!\):/m);
  assert.match(
    output,
    /stopped\t!!!\tagent-bang\tagents\/agent-bang\t\.switchyard\/worktrees\/agent-bang\t2026-03-08T09:00:00.000Z\t0\t[^\t]+\t-/
  );
});

test("statusCommand rejects selectors that match different sessions by id and agent name", async () => {
  const repoDir = await createInitializedRepo();

  await createSession(repoDir, {
    id: "shared-name",
    agentName: "agent-one",
    branch: "agents/agent-one",
    worktreePath: join(repoDir, ".switchyard", "worktrees", "agent-one"),
    state: "running",
    runtimePid: 1111,
    createdAt: "2026-03-08T09:00:00.000Z",
    updatedAt: "2026-03-08T09:00:00.000Z"
  });
  await createSession(repoDir, {
    id: "session-two",
    agentName: "shared-name",
    branch: "agents/shared-name",
    worktreePath: join(repoDir, ".switchyard", "worktrees", "shared-name"),
    state: "running",
    runtimePid: 2222,
    createdAt: "2026-03-08T09:05:00.000Z",
    updatedAt: "2026-03-08T09:05:00.000Z"
  });

  try {
    await assert.rejects(
      () => statusCommand({ startDir: repoDir, selector: "shared-name" }),
      (error) => {
        assert.equal(error instanceof Error, true);
        assert.equal(
          (error as Error).message,
          "Selector 'shared-name' is ambiguous: it matches session 'shared-name' by id and session 'session-two' by agent name."
        );
        return true;
      }
    );
  } finally {
    await removeTempDir(repoDir);
  }
});

test("statusCommand rejects selectors that match multiple sessions by agent name", async () => {
  const repoDir = await createInitializedRepo();

  await createSession(repoDir, {
    id: "session-latest",
    agentName: "shared-agent",
    branch: "agents/shared-agent",
    worktreePath: join(repoDir, ".switchyard", "worktrees", "shared-agent-latest"),
    state: "running",
    runtimePid: 3333,
    createdAt: "2026-03-08T09:05:00.000Z",
    updatedAt: "2026-03-08T10:00:00.000Z"
  });
  await createSession(repoDir, {
    id: "session-earlier",
    agentName: "shared-agent",
    branch: "agents/shared-agent",
    worktreePath: join(repoDir, ".switchyard", "worktrees", "shared-agent-earlier"),
    state: "stopped",
    runtimePid: null,
    createdAt: "2026-03-08T09:00:00.000Z",
    updatedAt: "2026-03-08T09:30:00.000Z"
  });

  try {
    await assert.rejects(
      () => statusCommand({ startDir: repoDir, selector: "shared-agent" }),
      (error) => {
        assert.equal(error instanceof Error, true);
        assert.equal(
          (error as Error).message,
          "Selector 'shared-agent' is ambiguous: it matches multiple sessions by agent name ('session-latest', 'session-earlier'). Use an exact session id from 'sy status'."
        );
        return true;
      }
    );
  } finally {
    await removeTempDir(repoDir);
  }
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
    /running\tsession-1\tagent-one\tagents\/agent-one\t\.switchyard\/worktrees\/agent-one\t2026-03-08T09:00:00.000Z\t0\t[^\t]+\t2026-03-08T09:15:00.000Z mail\.sent sender=operator, bodyLength=18/
  );
  assert.match(
    output,
    /stopped\tsession-2\tagent-two\tagents\/agent-two\t\.switchyard\/worktrees\/agent-two\t2026-03-08T09:05:00.000Z\t0\t[^\t]+\t2026-03-08T09:20:00.000Z stop\.completed outcome=stopped, cleanupPerformed=true/
  );
});

test("statusCommand includes stop cleanup failure details in the recent event summary", async () => {
  const repoDir = await createInitializedRepo();
  const writes: string[] = [];
  const originalWrite = process.stdout.write.bind(process.stdout);

  await createSession(repoDir, {
    id: "session-stop-cleanup-failure",
    agentName: "agent-stop-cleanup-failure",
    branch: "agents/agent-stop-cleanup-failure",
    worktreePath: join(repoDir, ".switchyard", "worktrees", "agent-stop-cleanup-failure"),
    state: "stopped",
    runtimePid: null,
    createdAt: "2026-03-08T09:21:00.000Z",
    updatedAt: "2026-03-08T09:21:00.000Z"
  });
  await createEvent(repoDir, {
    sessionId: "session-stop-cleanup-failure",
    agentName: "agent-stop-cleanup-failure",
    eventType: "stop.completed",
    payload: {
      outcome: "already_not_running",
      cleanupPerformed: false,
      cleanupReason: "cleanup_failed",
      cleanupError: "simulated remove failure"
    },
    createdAt: "2026-03-08T09:22:00.000Z"
  });

  process.stdout.write = ((chunk: string | Uint8Array) => {
    writes.push(typeof chunk === "string" ? chunk : chunk.toString());
    return true;
  }) as typeof process.stdout.write;

  try {
    await statusCommand({
      startDir: repoDir,
      selector: "session-stop-cleanup-failure",
      isRuntimeAlive: () => false
    });
  } finally {
    process.stdout.write = originalWrite;
    await removeTempDir(repoDir);
  }

  assert.match(
    writes.join(""),
    /Recent: 2026-03-08T09:22:00.000Z stop\.completed outcome=already_not_running, cleanupPerformed=false, cleanupReason=cleanup_failed, cleanupError="simulated remove failure"/
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
    /running\tsession-ready\tagent-ready\tagents\/agent-ready\t\.switchyard\/worktrees\/agent-ready\t2026-03-08T11:00:00.000Z\t0\t[^\t]+\t2026-03-08T11:01:00.000Z sling\.completed runtimePid=2222, baseBranch=main, readyAfterMs=500/
  );
});

test("statusCommand includes merge conflict details in the recent event summary", async () => {
  const repoDir = await createInitializedRepo();
  const writes: string[] = [];
  const originalWrite = process.stdout.write.bind(process.stdout);

  await createSession(repoDir, {
    id: "session-merge-conflict",
    agentName: "agent-merge-conflict",
    branch: "agents/agent-merge-conflict",
    worktreePath: join(repoDir, ".switchyard", "worktrees", "agent-merge-conflict"),
    state: "stopped",
    runtimePid: null,
    createdAt: "2026-03-08T11:05:00.000Z",
    updatedAt: "2026-03-08T11:05:00.000Z"
  });
  await createEvent(repoDir, {
    sessionId: "session-merge-conflict",
    agentName: "agent-merge-conflict",
    eventType: "merge.failed",
    payload: {
      branch: "agents/agent-merge-conflict",
      canonicalBranch: "main",
      reason: "merge_conflict",
      conflictCount: 2,
      firstConflictPath: "src/conflict.ts"
    },
    createdAt: "2026-03-08T11:06:00.000Z"
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
    /stopped\tsession-merge-conflict\tagent-merge-conflict\tagents\/agent-merge-conflict\t\.switchyard\/worktrees\/agent-merge-conflict\t2026-03-08T11:05:00.000Z\t0\t[^\t]+\t2026-03-08T11:06:00.000Z merge\.failed reason=merge_conflict, conflictCount=2, firstConflictPath=src\/conflict\.ts, bran\.\.\./
  );
});

test("statusCommand includes merge preflight failure details in the recent event summary", async () => {
  const repoDir = await createInitializedRepo();
  const writes: string[] = [];
  const originalWrite = process.stdout.write.bind(process.stdout);

  await createSession(repoDir, {
    id: "session-merge-preflight",
    agentName: "agent-merge-preflight",
    branch: "agents/agent-merge-preflight",
    worktreePath: join(repoDir, ".switchyard", "worktrees", "agent-merge-preflight"),
    state: "stopped",
    runtimePid: null,
    createdAt: "2026-03-08T11:07:00.000Z",
    updatedAt: "2026-03-08T11:07:00.000Z"
  });
  await createEvent(repoDir, {
    sessionId: "session-merge-preflight",
    agentName: "agent-merge-preflight",
    eventType: "merge.failed",
    payload: {
      branch: "agents/agent-merge-preflight",
      reason: "repo_root_dirty",
      target: "repo_root",
      dirtyCount: 1,
      firstDirtyEntry: " M tracked.txt"
    },
    createdAt: "2026-03-08T11:08:00.000Z"
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
    /stopped\tsession-merge-preflight\tagent-merge-preflight\tagents\/agent-merge-preflight\t\.switchyard\/worktrees\/agent-merge-preflight\t2026-03-08T11:07:00.000Z\t0\t[^\t]+\t2026-03-08T11:08:00.000Z merge\.failed reason=repo_root_dirty, target=repo_root, firstDirtyEntry=" M tracked\.txt", dir\.\.\./
  );
});

test("statusCommand includes canonical branch drift details in the selected-session recent summary", async () => {
  const repoDir = await createInitializedRepo();
  const writes: string[] = [];
  const originalWrite = process.stdout.write.bind(process.stdout);

  await createSession(repoDir, {
    id: "session-merge-drift",
    agentName: "agent-merge-drift",
    branch: "agents/agent-merge-drift",
    baseBranch: "main",
    worktreePath: join(repoDir, ".switchyard", "worktrees", "agent-merge-drift"),
    state: "stopped",
    runtimePid: null,
    createdAt: "2026-03-08T11:09:00.000Z",
    updatedAt: "2026-03-08T11:09:00.000Z"
  });
  await createEvent(repoDir, {
    sessionId: "session-merge-drift",
    agentName: "agent-merge-drift",
    eventType: "merge.failed",
    payload: {
      branch: "agents/agent-merge-drift",
      reason: "canonical_branch_drift",
      canonicalBranch: "main",
      configuredCanonicalBranch: "release"
    },
    createdAt: "2026-03-08T11:10:00.000Z"
  });

  process.stdout.write = ((chunk: string | Uint8Array) => {
    writes.push(typeof chunk === "string" ? chunk : chunk.toString());
    return true;
  }) as typeof process.stdout.write;

  try {
    await statusCommand({
      startDir: repoDir,
      selector: "session-merge-drift",
      isRuntimeAlive: () => false
    });
  } finally {
    process.stdout.write = originalWrite;
    await removeTempDir(repoDir);
  }

  assert.match(
    writes.join(""),
    /Recent: 2026-03-08T11:10:00.000Z merge\.failed reason=canonical_branch_drift, configuredCanonicalBranch=release, canonicalBranch=main, branch=agents\/agent-merge-drift/
  );
});

test("statusCommand includes preserved worktree path details in the recent event summary", async () => {
  const repoDir = await createInitializedRepo();
  const writes: string[] = [];
  const originalWrite = process.stdout.write.bind(process.stdout);

  await createSession(repoDir, {
    id: "session-worktree-missing",
    agentName: "agent-worktree-missing",
    branch: "agents/agent-worktree-missing",
    baseBranch: "main",
    worktreePath: join(repoDir, ".switchyard", "worktrees", "agent-worktree-missing"),
    state: "failed",
    runtimePid: null,
    createdAt: "2026-03-08T11:11:00.000Z",
    updatedAt: "2026-03-08T11:11:00.000Z"
  });
  await createEvent(repoDir, {
    sessionId: "session-worktree-missing",
    agentName: "agent-worktree-missing",
    eventType: "merge.failed",
    payload: {
      branch: "agents/agent-worktree-missing",
      reason: "worktree_missing",
      target: "preserved_worktree",
      worktreePath: ".switchyard/worktrees/agent-worktree-missing"
    },
    createdAt: "2026-03-08T11:12:00.000Z"
  });

  process.stdout.write = ((chunk: string | Uint8Array) => {
    writes.push(typeof chunk === "string" ? chunk : chunk.toString());
    return true;
  }) as typeof process.stdout.write;

  try {
    await statusCommand({
      startDir: repoDir,
      selector: "session-worktree-missing",
      isRuntimeAlive: () => false
    });
  } finally {
    process.stdout.write = originalWrite;
    await removeTempDir(repoDir);
  }

  assert.match(
    writes.join(""),
    /Recent: 2026-03-08T11:12:00.000Z merge\.failed reason=worktree_missing, target=preserved_worktree, worktreePath=\.switchyard\/worktrees\/agent-worktree-missing, branch=agents\/agent-worktree-missing/
  );
});

test("statusCommand shows unread mail counts alongside recent events", async () => {
  const repoDir = await createInitializedRepo();
  const writes: string[] = [];
  const originalWrite = process.stdout.write.bind(process.stdout);

  await createSession(repoDir, {
    id: "session-unread",
    agentName: "agent-unread",
    branch: "agents/agent-unread",
    worktreePath: join(repoDir, ".switchyard", "worktrees", "agent-unread"),
    state: "running",
    runtimePid: 2323,
    createdAt: "2026-03-08T11:10:00.000Z",
    updatedAt: "2026-03-08T11:10:00.000Z"
  });
  await createMail(repoDir, {
    sessionId: "session-unread",
    sender: "operator",
    recipient: "agent-unread",
    body: "Unread one",
    createdAt: "2026-03-08T11:11:00.000Z"
  });
  await createMail(repoDir, {
    sessionId: "session-unread",
    sender: "operator",
    recipient: "agent-unread",
    body: "Unread two",
    createdAt: "2026-03-08T11:12:00.000Z"
  });
  await createEvent(repoDir, {
    sessionId: "session-unread",
    agentName: "agent-unread",
    eventType: "runtime.ready",
    payload: {
      signal: "pid_alive",
      runtimePid: 2323
    },
    createdAt: "2026-03-08T11:13:00.000Z"
  });

  process.stdout.write = ((chunk: string | Uint8Array) => {
    writes.push(typeof chunk === "string" ? chunk : chunk.toString());
    return true;
  }) as typeof process.stdout.write;

  try {
    await statusCommand({
      startDir: repoDir,
      isRuntimeAlive: (pid) => pid === 2323
    });
  } finally {
    process.stdout.write = originalWrite;
    await removeTempDir(repoDir);
  }

  assert.match(
    writes.join(""),
    /running\tsession-unread\tagent-unread\tagents\/agent-unread\t\.switchyard\/worktrees\/agent-unread\t2026-03-08T11:10:00.000Z\t2\t[^\t]+\t2026-03-08T11:13:00.000Z runtime\.ready signal=pid_alive, runtimePid=2323/
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
    /stopped\tsession-mail-view\tagent-mail-view\tagents\/agent-mail-view\t\.switchyard\/worktrees\/agent-mail-view\t2026-03-08T11:30:00.000Z\t0\t[^\t]+\t2026-03-08T11:31:00.000Z mail\.listed view=unread_only, messageCount=2, unreadCount=2/
  );
});

test("statusCommand drops the unread count after mail is consumed", async () => {
  const repoDir = await createInitializedRepo();
  const writes: string[] = [];
  const originalWrite = process.stdout.write.bind(process.stdout);

  await createSession(repoDir, {
    id: "session-read-mail",
    agentName: "agent-read-mail",
    branch: "agents/agent-read-mail",
    worktreePath: join(repoDir, ".switchyard", "worktrees", "agent-read-mail"),
    state: "stopped",
    runtimePid: null,
    createdAt: "2026-03-08T11:40:00.000Z",
    updatedAt: "2026-03-08T11:40:00.000Z"
  });
  await createMail(repoDir, {
    sessionId: "session-read-mail",
    sender: "operator",
    recipient: "agent-read-mail",
    body: "Read me",
    createdAt: "2026-03-08T11:41:00.000Z"
  });
  await readUnreadMailForSession(repoDir, "session-read-mail");

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
    /stopped\tsession-read-mail\tagent-read-mail\tagents\/agent-read-mail\t\.switchyard\/worktrees\/agent-read-mail\t2026-03-08T11:40:00.000Z\t0\t[^\t]+\t-/
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
    /stopped\tsession-unknown\tagent-unknown\tagents\/agent-unknown\t\.switchyard\/worktrees\/agent-unknown\t2026-03-08T09:00:00.000Z\t0\t[^\t]+\t2026-03-08T09:10:00.000Z runtime\.note/
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
    /failed\tagent-stale\tagent-stale\tagents\/agent-stale\t\.switchyard\/worktrees\/agent-stale\t2026-03-08T09:45:00.000Z\t0\t[^\t]+\t2026-03-08T09:45:00.000Z runtime\.exited reason=pid_not_alive, runtimePid=9090/
  );
});

test("statusCommand keeps rendering when unread mail counts cannot be loaded", async () => {
  const repoDir = await createInitializedRepo();
  const stdoutWrites: string[] = [];
  const stderrWrites: string[] = [];
  const originalStdoutWrite = process.stdout.write.bind(process.stdout);
  const originalStderrWrite = process.stderr.write.bind(process.stderr);

  await createSession(repoDir, {
    id: "agent-mail-broken",
    agentName: "agent-mail-broken",
    branch: "agents/agent-mail-broken",
    worktreePath: join(repoDir, ".switchyard", "worktrees", "agent-mail-broken"),
    state: "running",
    runtimePid: 9191,
    createdAt: "2026-03-06T09:00:00.000Z",
    updatedAt: "2026-03-06T10:00:00.000Z"
  });
  await createEvent(repoDir, {
    sessionId: "agent-mail-broken",
    agentName: "agent-mail-broken",
    eventType: "sling.completed",
    payload: {
      runtimePid: 9191,
      readyAfterMs: 500
    },
    createdAt: "2026-03-06T09:30:00.000Z"
  });

  process.stdout.write = ((chunk: string | Uint8Array) => {
    stdoutWrites.push(typeof chunk === "string" ? chunk : chunk.toString());
    return true;
  }) as typeof process.stdout.write;
  process.stderr.write = ((chunk: string | Uint8Array) => {
    stderrWrites.push(typeof chunk === "string" ? chunk : chunk.toString());
    return true;
  }) as typeof process.stderr.write;

  try {
    await statusCommand({
      startDir: repoDir,
      isRuntimeAlive: () => false,
      now: () => "2026-03-08T10:05:00.000Z",
      listUnreadMailCounts: async () => {
        throw new Error("mail unavailable");
      }
    });

    const sessions = await listSessions(repoDir);
    assert.equal(sessions[0]?.state, "failed");
    assert.equal(sessions[0]?.runtimePid, null);

    const events = await listEvents(repoDir, { sessionId: "agent-mail-broken" });
    assert.equal(events.length, 2);
    assert.equal(events[1]?.eventType, "runtime.exited");
    assert.equal(events[1]?.payload.reason, "pid_not_alive");
  } finally {
    process.stdout.write = originalStdoutWrite;
    process.stderr.write = originalStderrWrite;
    await removeTempDir(repoDir);
  }

  assert.match(
    stdoutWrites.join(""),
    /failed\tagent-mail-broken\tagent-mail-broken\tagents\/agent-mail-broken\t\.switchyard\/worktrees\/agent-mail-broken\t2026-03-08T10:05:00.000Z\t\?\t[^\t]+\t2026-03-08T10:05:00.000Z runtime\.exited reason=pid_not_alive, runtimePid=9191/
  );
  assert.match(stderrWrites.join(""), /WARN: failed to load unread mail counts: mail unavailable/);
});

test("statusCommand keeps rendering when cleanup readiness cannot be evaluated", async () => {
  const repoDir = await createInitializedRepo();
  const stdoutWrites: string[] = [];
  const stderrWrites: string[] = [];
  const originalStdoutWrite = process.stdout.write.bind(process.stdout);
  const originalStderrWrite = process.stderr.write.bind(process.stderr);

  await createSession(repoDir, {
    id: "session-cleanup-broken",
    agentName: "agent-cleanup-broken",
    branch: "agents/cleanup-broken",
    baseBranch: "main",
    worktreePath: join(repoDir, ".switchyard", "worktrees", "agent-cleanup-broken"),
    state: "stopped",
    runtimePid: null,
    createdAt: "2026-03-08T10:10:00.000Z",
    updatedAt: "2026-03-08T10:10:00.000Z"
  });

  process.stdout.write = ((chunk: string | Uint8Array) => {
    stdoutWrites.push(typeof chunk === "string" ? chunk : chunk.toString());
    return true;
  }) as typeof process.stdout.write;
  process.stderr.write = ((chunk: string | Uint8Array) => {
    stderrWrites.push(typeof chunk === "string" ? chunk : chunk.toString());
    return true;
  }) as typeof process.stderr.write;

  try {
    await statusCommand({
      startDir: repoDir,
      isRuntimeAlive: () => false,
      getCleanupReadiness: async () => {
        throw new Error("cleanup unavailable");
      }
    });
  } finally {
    process.stdout.write = originalStdoutWrite;
    process.stderr.write = originalStderrWrite;
    await removeTempDir(repoDir);
  }

  assert.match(
    stdoutWrites.join(""),
    /stopped\tsession-cleanup-broken\tagent-cleanup-broken\tagents\/cleanup-broken\t\.switchyard\/worktrees\/agent-cleanup-broken\t2026-03-08T10:10:00.000Z\t0\t\?\t-/
  );
  assert.match(
    stderrWrites.join(""),
    /WARN: failed to evaluate cleanup readiness for session 'session-cleanup-broken': cleanup unavailable/
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
    /failed\tagent-event-fail\tagent-event-fail\tagents\/agent-event-fail\t\.switchyard\/worktrees\/agent-event-fail\t2026-03-08T10:00:00.000Z\t0\t[^\t]+\t2026-03-08T10:00:00.000Z runtime\.exited reason=pid_not_alive, runtimePid=9090/
  );
  assert.doesNotMatch(output, /failed\tagent-event-fail\tagent-event-fail[^\n]*sling\.(started|completed)/);
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
    /failed\tagent-booting\tagent-booting\tagents\/agent-booting\t\.switchyard\/worktrees\/agent-booting\t2026-03-08T09:50:00.000Z\t0\t[^\t]+\t2026-03-08T09:50:00.000Z runtime\.exited_early reason=pid_not_alive, runtimePid=8080/
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
    /failed\tagent-legacy\tagent-legacy\tagents\/agent-legacy\t\.switchyard\/worktrees\/agent-legacy\t2026-03-08T09:55:00.000Z\t0\t[^\t]+\t2026-03-08T09:55:00.000Z runtime\.exited reason=missing_runtime_pid/
  );
});

async function createInitializedRepo(): Promise<string> {
  const repoDir = await createTempGitRepo("switchyard-status-command-test-");
  await bootstrapSwitchyardLayout(repoDir);
  await writeConfig(buildDefaultConfig(repoDir, "switchyard-test", "main"));
  return repoDir;
}
