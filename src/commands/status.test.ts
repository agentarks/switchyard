import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { buildDefaultConfig, writeConfig } from "../config.js";
import { createEvent, listEvents } from "../events/store.js";
import { createMail, readUnreadMailForSession } from "../mail/store.js";
import { createRun } from "../runs/store.js";
import { createSession, listSessions } from "../sessions/store.js";
import { summarizeTask, writeTaskSpec } from "../specs/task.js";
import { bootstrapSwitchyardLayout } from "../storage/bootstrap.js";
import { createTempGitRepo, git, removeTempDir } from "../test-helpers/git.js";
import { slingCommand } from "./sling.js";
import { statusCommand } from "./status.js";

const execFileAsync = promisify(execFile);
const tsxCliPath = fileURLToPath(new URL("../../node_modules/tsx/dist/cli.mjs", import.meta.url));
const cliEntryPath = fileURLToPath(new URL("../index.ts", import.meta.url));

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
      isRuntimeAlive: (pid) => pid === 1111,
      now: () => "2026-03-06T09:20:00.000Z"
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
      isRuntimeAlive: (pid) => pid === 1111,
      now: () => "2026-03-06T09:20:00.000Z"
    });
  } finally {
    process.stdout.write = originalWrite;
    await removeTempDir(repoDir);
  }

  const output = writes.join("");
  assert.match(output, /Sessions for .+:/);
  assert.match(output, /STATE\tSESSION\tAGENT\tBRANCH\tWORKTREE\tUPDATED\tUNREAD\tCLEANUP\tTASK\tRUN\tNEXT\tRECENT/);
  assert.match(
    output,
    /stopped\tagent-two\tagent-two\tagents\/agent-two\t\.switchyard\/worktrees\/agent-two\t2026-03-06T12:00:00.000Z\t0\t[^\t]+\t-\t-\tinspect\t-/
  );
  assert.match(
    output,
    /running\tagent-one\tagent-one\tagents\/agent-one\t\.switchyard\/worktrees\/agent-one\t2026-03-06T10:00:00.000Z\t0\t[^\t]+\t-\t-\twait\t-/
  );
  assert.ok(output.indexOf("agent-two") < output.indexOf("agent-one"));
});

test("statusCommand shows latest run task ownership for concurrent sessions", async () => {
  const repoDir = await createInitializedRepo();
  const writes: string[] = [];
  const originalWrite = process.stdout.write.bind(process.stdout);

  await createSession(repoDir, {
    id: "session-alpha",
    agentName: "agent-alpha",
    branch: "agents/agent-alpha",
    worktreePath: join(repoDir, ".switchyard", "worktrees", "agent-alpha"),
    state: "running",
    runtimePid: 1111,
    createdAt: "2026-03-06T09:00:00.000Z",
    updatedAt: "2026-03-06T10:00:00.000Z"
  });
  await createSession(repoDir, {
    id: "session-beta",
    agentName: "agent-beta",
    branch: "agents/agent-beta",
    worktreePath: join(repoDir, ".switchyard", "worktrees", "agent-beta"),
    state: "stopped",
    runtimePid: null,
    createdAt: "2026-03-06T11:00:00.000Z",
    updatedAt: "2026-03-06T12:00:00.000Z"
  });
  await createRun(repoDir, {
    id: "run-alpha",
    sessionId: "session-alpha",
    agentName: "agent-alpha",
    taskSummary: "Review the operator loop for mailbox regressions.",
    state: "active",
    createdAt: "2026-03-06T09:00:00.000Z",
    updatedAt: "2026-03-06T10:00:00.000Z"
  });
  await createRun(repoDir, {
    id: "run-beta",
    sessionId: "session-beta",
    agentName: "agent-beta",
    taskSummary: "Prepare the preserved branch for manual merge review.",
    state: "finished",
    outcome: "stopped",
    createdAt: "2026-03-06T11:00:00.000Z",
    updatedAt: "2026-03-06T12:00:00.000Z",
    finishedAt: "2026-03-06T12:00:00.000Z"
  });

  process.stdout.write = ((chunk: string | Uint8Array) => {
    writes.push(typeof chunk === "string" ? chunk : chunk.toString());
    return true;
  }) as typeof process.stdout.write;

  try {
    await statusCommand({
      startDir: repoDir,
      isRuntimeAlive: (pid) => pid === 1111,
      now: () => "2026-03-06T09:20:00.000Z"
    });
  } finally {
    process.stdout.write = originalWrite;
    await removeTempDir(repoDir);
  }

  const output = writes.join("");
  assert.match(
    output,
    /running\tsession-alpha\tagent-alpha[^\n]*\tReview the operator loop for mailbox regressions\.\tactive\twait\t-/
  );
  assert.match(
    output,
    /stopped\tsession-beta\tagent-beta[^\n]*\tPrepare the preserved branch for manual merge review\.\tfinished:stopped\tinspect\t-/
  );
});

test("statusCommand orders concurrent sessions by follow-up priority before recency", async () => {
  const repoDir = await createInitializedRepo();
  const writes: string[] = [];
  const originalWrite = process.stdout.write.bind(process.stdout);

  await createSession(repoDir, {
    id: "session-recent-wait",
    agentName: "agent-recent-wait",
    branch: "agents/agent-recent-wait",
    worktreePath: join(repoDir, ".switchyard", "worktrees", "agent-recent-wait"),
    state: "running",
    runtimePid: 1111,
    createdAt: "2026-03-06T15:00:00.000Z",
    updatedAt: "2026-03-06T15:00:00.000Z"
  });
  await createSession(repoDir, {
    id: "session-older-mail",
    agentName: "agent-older-mail",
    branch: "agents/agent-older-mail",
    worktreePath: join(repoDir, ".switchyard", "worktrees", "agent-older-mail"),
    state: "stopped",
    runtimePid: null,
    createdAt: "2026-03-06T14:00:00.000Z",
    updatedAt: "2026-03-06T14:00:00.000Z"
  });
  await createRun(repoDir, {
    id: "run-recent-wait",
    sessionId: "session-recent-wait",
    agentName: "agent-recent-wait",
    taskSummary: "Keep working on the active branch.",
    state: "active",
    createdAt: "2026-03-06T15:00:00.000Z",
    updatedAt: "2026-03-06T15:00:00.000Z"
  });
  await createRun(repoDir, {
    id: "run-older-mail",
    sessionId: "session-older-mail",
    agentName: "agent-older-mail",
    taskSummary: "Reply with the merge blocker details.",
    state: "finished",
    outcome: "stopped",
    createdAt: "2026-03-06T14:00:00.000Z",
    updatedAt: "2026-03-06T14:00:00.000Z",
    finishedAt: "2026-03-06T14:00:00.000Z"
  });
  await createMail(repoDir, {
    sessionId: "session-older-mail",
    sender: "agent-older-mail",
    recipient: "operator",
    body: "Need a decision before merge.",
    createdAt: "2026-03-06T14:05:00.000Z"
  });

  process.stdout.write = ((chunk: string | Uint8Array) => {
    writes.push(typeof chunk === "string" ? chunk : chunk.toString());
    return true;
  }) as typeof process.stdout.write;

  try {
    await statusCommand({
      startDir: repoDir,
      isRuntimeAlive: (pid) => pid === 1111,
      now: () => "2026-03-06T15:20:00.000Z"
    });
  } finally {
    process.stdout.write = originalWrite;
    await removeTempDir(repoDir);
  }

  const output = writes.join("");
  assert.match(
    output,
    /stopped\tsession-older-mail\tagent-older-mail[^\n]*\tmail\t2026-03-06T14:05:00.000Z mail\.unread unreadCount=1, sender=agent-older-mail, bodyPreview="Need a decision before merge\."/
  );
  assert.match(output, /running\tsession-recent-wait\tagent-recent-wait[^\n]*\twait\t-/);
  assert.ok(output.indexOf("session-older-mail") < output.indexOf("session-recent-wait"));
});

test("statusCommand orders mail follow-up rows by latest unread inbound mail before session recency", async () => {
  const repoDir = await createInitializedRepo();
  const writes: string[] = [];
  const originalWrite = process.stdout.write.bind(process.stdout);

  await createSession(repoDir, {
    id: "session-newer-mail",
    agentName: "agent-newer-mail",
    branch: "agents/agent-newer-mail",
    worktreePath: join(repoDir, ".switchyard", "worktrees", "agent-newer-mail"),
    state: "stopped",
    runtimePid: null,
    createdAt: "2026-03-06T09:00:00.000Z",
    updatedAt: "2026-03-06T09:00:00.000Z"
  });
  await createSession(repoDir, {
    id: "session-older-update",
    agentName: "agent-older-update",
    branch: "agents/agent-older-update",
    worktreePath: join(repoDir, ".switchyard", "worktrees", "agent-older-update"),
    state: "stopped",
    runtimePid: null,
    createdAt: "2026-03-06T08:00:00.000Z",
    updatedAt: "2026-03-06T11:00:00.000Z"
  });
  await createMail(repoDir, {
    sessionId: "session-newer-mail",
    sender: "agent-newer-mail",
    recipient: "operator",
    body: "Latest unread inbound mail.",
    createdAt: "2026-03-06T12:00:00.000Z"
  });
  await createMail(repoDir, {
    sessionId: "session-older-update",
    sender: "agent-older-update",
    recipient: "operator",
    body: "Older unread inbound mail.",
    createdAt: "2026-03-06T10:00:00.000Z"
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

  const output = writes.join("");
  assert.match(
    output,
    /stopped\tsession-newer-mail\tagent-newer-mail[^\n]*\tmail\t2026-03-06T12:00:00.000Z mail\.unread unreadCount=1, sender=agent-newer-mail, bodyPreview="Latest unread inbound mail\."/
  );
  assert.match(
    output,
    /stopped\tsession-older-update\tagent-older-update[^\n]*\tmail\t2026-03-06T10:00:00.000Z mail\.unread unreadCount=1, sender=agent-older-update, bodyPreview="Older unread inbound mail\."/
  );
  assert.ok(output.indexOf("session-newer-mail") < output.indexOf("session-older-update"));
});

test("statusCommand does not let a stopped run override current cleanup blockers", async () => {
  const repoDir = await createInitializedRepo();
  const writes: string[] = [];
  const originalWrite = process.stdout.write.bind(process.stdout);

  await createSession(repoDir, {
    id: "session-blocked-stop",
    agentName: "agent-blocked-stop",
    branch: "agents/agent-blocked-stop",
    baseBranch: "main",
    worktreePath: join(repoDir, ".switchyard", "worktrees", "agent-blocked-stop"),
    state: "stopped",
    runtimePid: null,
    createdAt: "2026-03-06T13:00:00.000Z",
    updatedAt: "2026-03-06T13:05:00.000Z"
  });
  await createRun(repoDir, {
    id: "run-blocked-stop",
    sessionId: "session-blocked-stop",
    agentName: "agent-blocked-stop",
    taskSummary: "Investigate preserved artifact drift before any cleanup.",
    state: "finished",
    outcome: "stopped",
    createdAt: "2026-03-06T13:00:00.000Z",
    updatedAt: "2026-03-06T13:05:00.000Z",
    finishedAt: "2026-03-06T13:05:00.000Z"
  });

  process.stdout.write = ((chunk: string | Uint8Array) => {
    writes.push(typeof chunk === "string" ? chunk : chunk.toString());
    return true;
  }) as typeof process.stdout.write;

  try {
    await statusCommand({
      startDir: repoDir,
      isRuntimeAlive: () => false,
      getCleanupReadiness: async () => "abandon-only:worktree-missing"
    });
  } finally {
    process.stdout.write = originalWrite;
    await removeTempDir(repoDir);
  }

  assert.match(
    writes.join(""),
    /stopped\tsession-blocked-stop\tagent-blocked-stop[^\n]*\tabandon-only:worktree-missing\tInvestigate preserved artifact drift before any cleanup\.\tfinished:stopped\tinspect\t-/
  );
});

test("statusCommand does not let a merged run override current cleanup uncertainty", async () => {
  const repoDir = await createInitializedRepo();
  const writes: string[] = [];
  const originalWrite = process.stdout.write.bind(process.stdout);

  await createSession(repoDir, {
    id: "session-merged-uncertain",
    agentName: "agent-merged-uncertain",
    branch: "agents/agent-merged-uncertain",
    baseBranch: "main",
    worktreePath: join(repoDir, ".switchyard", "worktrees", "agent-merged-uncertain"),
    state: "stopped",
    runtimePid: null,
    createdAt: "2026-03-06T14:00:00.000Z",
    updatedAt: "2026-03-06T14:05:00.000Z"
  });
  await createRun(repoDir, {
    id: "run-merged-uncertain",
    sessionId: "session-merged-uncertain",
    agentName: "agent-merged-uncertain",
    taskSummary: "Verify cleanup safety after merge drift.",
    state: "finished",
    outcome: "merged",
    createdAt: "2026-03-06T14:00:00.000Z",
    updatedAt: "2026-03-06T14:05:00.000Z",
    finishedAt: "2026-03-06T14:05:00.000Z"
  });

  process.stdout.write = ((chunk: string | Uint8Array) => {
    writes.push(typeof chunk === "string" ? chunk : chunk.toString());
    return true;
  }) as typeof process.stdout.write;

  try {
    await statusCommand({
      startDir: repoDir,
      isRuntimeAlive: () => false,
      getCleanupReadiness: async () => "?"
    });
  } finally {
    process.stdout.write = originalWrite;
    await removeTempDir(repoDir);
  }

  assert.match(
    writes.join(""),
    /stopped\tsession-merged-uncertain\tagent-merged-uncertain[^\n]*\t\?\tVerify cleanup safety after merge drift\.\tfinished:merged\t-\t-/
  );
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
    await git(repoDir, ["branch", "agents/legacy-missing-worktree"]);
    await createSession(repoDir, {
      id: "session-legacy-missing-worktree",
      agentName: "agent-legacy-missing-worktree",
      branch: "agents/legacy-missing-worktree",
      worktreePath: join(repoDir, ".switchyard", "worktrees", "agent-legacy-missing-worktree"),
      state: "failed",
      runtimePid: null,
      createdAt: "2026-03-08T09:13:00.000Z",
      updatedAt: "2026-03-08T09:13:00.000Z"
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
      isRuntimeAlive: (pid) => pid === 1111,
      now: () => "2026-03-08T09:20:00.000Z"
    });
  } finally {
    process.stdout.write = originalWrite;
    await removeTempDir(repoDir);
  }

  const output = writes.join("");
  assert.match(output, /running\tsession-active\tagent-active[^\n]*\tstop-then:merged\t-\t-\twait\t-/);
  assert.match(output, /stopped\tsession-merged\tagent-merged[^\n]*\tready:merged\t-\t-\tcleanup\t-/);
  assert.match(output, /stopped\tsession-absent\tagent-absent[^\n]*\tready:absent\t-\t-\tdone\t-/);
  assert.match(
    output,
    /stopped\tsession-missing-worktree\tagent-missing-worktree[^\n]*\tabandon-only:worktree-missing\t-\t-\tinspect\t-/
  );
  assert.match(
    output,
    /failed\tsession-legacy-missing-worktree\tagent-legacy-missing-worktree[^\n]*\tabandon-only:worktree-missing\t-\t-\tinspect\t-/
  );
  assert.match(output, /stopped\tsession-unmerged\tagent-unmerged[^\n]*\tabandon-only:not-merged\t-\t-\treview-merge\t-/);
  assert.match(output, /failed\tsession-legacy-cleanup\tagent-legacy-cleanup[^\n]*\tabandon-only:legacy\t-\t-\tinspect\t-/);
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
  assert.match(output, /Runtime: -/);
  assert.match(output, /Created: 2026-03-08T09:00:00.000Z/);
  assert.match(output, /Unread: 0/);
  assert.match(output, /Cleanup: [^\n]+/);
  assert.match(output, /Run: -/);
  assert.match(output, /Next: inspect/);
  assert.match(output, /Recent: 2026-03-08T10:00:00.000Z runtime\.exited reason=pid_not_alive, runtimePid=1111/);
  assert.match(
    output,
    /failed\tsession-1\tagent-one\tagents\/agent-one\t\.switchyard\/worktrees\/agent-one\t2026-03-08T10:00:00.000Z\t0\t[^\t]+\t-\t-\tinspect\t2026-03-08T10:00:00.000Z runtime\.exited reason=pid_not_alive, runtimePid=1111/
  );
  assert.doesNotMatch(output, /session-2/);
});

test("statusCommand shows the launch task handoff for one selected session", async () => {
  const repoDir = await createInitializedRepo();
  const writes: string[] = [];
  const originalWrite = process.stdout.write.bind(process.stdout);
  const task = "Inspect the preserved worktree and summarize the highest-risk changes.";

  try {
    await slingCommand({
      agentName: "Agent Task Status",
      task,
      startDir: repoDir,
      spawnRuntime: async ({ runtimeArgs, onSpawned }) => {
        const runtime = {
          pid: 8181,
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

    process.stdout.write = ((chunk: string | Uint8Array) => {
      writes.push(typeof chunk === "string" ? chunk : chunk.toString());
      return true;
    }) as typeof process.stdout.write;

    await statusCommand({
      selector: "agent-task-status",
      startDir: repoDir,
      isRuntimeAlive: (pid) => pid === 8181,
      now: () => "2026-03-09T12:00:00.000Z"
    });
  } finally {
    process.stdout.write = originalWrite;
    await removeTempDir(repoDir);
  }

  const output = writes.join("");
  const sessionIdMatch = output.match(/Status for agent-task-status \(([0-9a-f-]{36})\):/);
  assert.ok(sessionIdMatch);
  assert.match(output, /Runtime: codex/);
  assert.match(output, new RegExp(`Task: ${task}`));
  assert.match(output, new RegExp(`Spec: \\.switchyard/specs/agent-task-status-${sessionIdMatch[1]}\\.md`));
  assert.match(output, /Run: active/);
  assert.match(output, /Next: wait/);
  assert.match(output, /Recent: 2026-03-09T12:00:00.000Z runtime\.ready signal=pid_alive, runtimePid=8181/);
});

test("statusCommand prioritizes unread mail in the selected session follow-up signal", async () => {
  const repoDir = await createInitializedRepo();
  const writes: string[] = [];
  const originalWrite = process.stdout.write.bind(process.stdout);

  await createSession(repoDir, {
    id: "session-selected-mail",
    agentName: "agent-selected-mail",
    branch: "agents/agent-selected-mail",
    worktreePath: join(repoDir, ".switchyard", "worktrees", "agent-selected-mail"),
    state: "running",
    runtimePid: 7272,
    createdAt: "2026-03-09T12:10:00.000Z",
    updatedAt: "2026-03-09T12:10:00.000Z"
  });
  await createMail(repoDir, {
    sessionId: "session-selected-mail",
    sender: "agent-selected-mail",
    recipient: "operator",
    body: "Ready for review.",
    createdAt: "2026-03-09T12:11:00.000Z"
  });
  await createEvent(repoDir, {
    sessionId: "session-selected-mail",
    agentName: "agent-selected-mail",
    eventType: "runtime.ready",
    payload: {
      signal: "pid_alive",
      runtimePid: 7272
    },
    createdAt: "2026-03-09T12:10:30.000Z"
  });

  process.stdout.write = ((chunk: string | Uint8Array) => {
    writes.push(typeof chunk === "string" ? chunk : chunk.toString());
    return true;
  }) as typeof process.stdout.write;

  try {
    await statusCommand({
      startDir: repoDir,
      selector: "session-selected-mail",
      isRuntimeAlive: (pid) => pid === 7272,
      now: () => "2026-03-09T12:20:00.000Z"
    });
  } finally {
    process.stdout.write = originalWrite;
    await removeTempDir(repoDir);
  }

  const output = writes.join("");
  assert.match(output, /^Status for agent-selected-mail \(session-selected-mail\):/m);
  assert.match(output, /Unread: 1/);
  assert.match(output, /Next: mail/);
  assert.match(
    output,
    /Recent: 2026-03-09T12:11:00.000Z mail\.unread unreadCount=1, sender=agent-selected-mail, bodyPreview="Ready for review\."/
  );
  assert.match(
    output,
    /running\tsession-selected-mail\tagent-selected-mail\tagents\/agent-selected-mail\t\.switchyard\/worktrees\/agent-selected-mail\t2026-03-09T12:11:00.000Z\t1\t[^\t]+\t-\t-\tmail\t2026-03-09T12:11:00.000Z mail\.unread unreadCount=1, sender=agent-selected-mail, bodyPreview="Ready for review\."/
  );
});

test("statusCommand marks a quiet running session as inspect when agent activity is older than the stalled threshold", async () => {
  const repoDir = await createInitializedRepo();
  const writes: string[] = [];
  const originalWrite = process.stdout.write.bind(process.stdout);

  await createSession(repoDir, {
    id: "session-stalled-row",
    agentName: "agent-stalled-row",
    branch: "agents/agent-stalled-row",
    worktreePath: join(repoDir, ".switchyard", "worktrees", "agent-stalled-row"),
    state: "running",
    runtimePid: 7171,
    createdAt: "2026-03-09T12:00:00.000Z",
    updatedAt: "2026-03-09T12:20:00.000Z"
  });
  await createEvent(repoDir, {
    sessionId: "session-stalled-row",
    agentName: "agent-stalled-row",
    eventType: "runtime.ready",
    payload: {
      signal: "pid_alive",
      runtimePid: 7171
    },
    createdAt: "2026-03-09T12:00:00.000Z"
  });

  process.stdout.write = ((chunk: string | Uint8Array) => {
    writes.push(typeof chunk === "string" ? chunk : chunk.toString());
    return true;
  }) as typeof process.stdout.write;

  try {
    await statusCommand({
      startDir: repoDir,
      isRuntimeAlive: (pid) => pid === 7171,
      now: () => "2026-03-09T12:35:00.000Z"
    });
  } finally {
    process.stdout.write = originalWrite;
    await removeTempDir(repoDir);
  }

  assert.match(
    writes.join(""),
    /running\tsession-stalled-row\tagent-stalled-row\tagents\/agent-stalled-row\t\.switchyard\/worktrees\/agent-stalled-row\t2026-03-09T12:20:00.000Z\t0\t[^\t]+\t-\t-\tinspect\t2026-03-09T12:00:00.000Z runtime\.ready signal=pid_alive, runtimePid=7171; runtime\.stalled idleFor=35m/
  );
});

test("statusCommand keeps active sessions under the no-visible-progress threshold on wait", async () => {
  const repoDir = await createInitializedRepo();
  const writes: string[] = [];
  const originalWrite = process.stdout.write.bind(process.stdout);

  await createTrackedStatusSession(repoDir, {
    id: "session-no-progress-under-threshold",
    agentName: "agent-no-progress-under-threshold",
    runtimePid: 7172,
    createdAt: "2026-03-09T12:00:00.000Z",
    updatedAt: "2026-03-09T12:04:00.000Z"
  });

  process.stdout.write = ((chunk: string | Uint8Array) => {
    writes.push(typeof chunk === "string" ? chunk : chunk.toString());
    return true;
  }) as typeof process.stdout.write;

  try {
    await statusCommand({
      startDir: repoDir,
      selector: "session-no-progress-under-threshold",
      isRuntimeAlive: (pid) => pid === 7172,
      now: () => "2026-03-09T12:04:30.000Z"
    });
  } finally {
    process.stdout.write = originalWrite;
    await removeTempDir(repoDir);
  }

  const output = writes.join("");
  assert.match(output, /Next: wait/);
  assert.match(
    output,
    /running\tsession-no-progress-under-threshold\tagent-no-progress-under-threshold[^\n]*\twait\t2026-03-09T12:00:00.000Z runtime\.ready signal=pid_alive, runtimePid=7172/
  );
  assert.doesNotMatch(output, /runtime\.no_visible_progress/);
});

test("statusCommand anchors no-visible-progress age to the first readiness signal instead of session creation", async () => {
  const repoDir = await createInitializedRepo();
  const writes: string[] = [];
  const originalWrite = process.stdout.write.bind(process.stdout);

  await createTrackedStatusSession(repoDir, {
    id: "session-no-progress-slow-start",
    agentName: "agent-no-progress-slow-start",
    runtimePid: 7179,
    createdAt: "2026-03-09T12:00:00.000Z",
    runtimeReadyAt: "2026-03-09T12:09:00.000Z",
    updatedAt: "2026-03-09T12:09:00.000Z"
  });

  process.stdout.write = ((chunk: string | Uint8Array) => {
    writes.push(typeof chunk === "string" ? chunk : chunk.toString());
    return true;
  }) as typeof process.stdout.write;

  try {
    await statusCommand({
      startDir: repoDir,
      selector: "session-no-progress-slow-start",
      isRuntimeAlive: (pid) => pid === 7179,
      now: () => "2026-03-09T12:10:00.000Z"
    });
  } finally {
    process.stdout.write = originalWrite;
    await removeTempDir(repoDir);
  }

  const output = writes.join("");
  assert.match(output, /Next: wait/);
  assert.match(
    output,
    /Recent: 2026-03-09T12:09:00.000Z runtime\.ready signal=pid_alive, runtimePid=7179/
  );
  assert.doesNotMatch(output, /runtime\.no_visible_progress/);
});

test("statusCommand marks older active sessions with no visible progress as inspect and prefers that hint over stalled", async () => {
  const repoDir = await createInitializedRepo();
  const writes: string[] = [];
  const originalWrite = process.stdout.write.bind(process.stdout);

  await createTrackedStatusSession(repoDir, {
    id: "session-no-progress",
    agentName: "agent-no-progress",
    runtimePid: 7173,
    createdAt: "2026-03-09T12:00:00.000Z",
    updatedAt: "2026-03-09T12:20:00.000Z"
  });

  process.stdout.write = ((chunk: string | Uint8Array) => {
    writes.push(typeof chunk === "string" ? chunk : chunk.toString());
    return true;
  }) as typeof process.stdout.write;

  try {
    await statusCommand({
      startDir: repoDir,
      selector: "session-no-progress",
      isRuntimeAlive: (pid) => pid === 7173,
      now: () => "2026-03-09T12:40:00.000Z"
    });
  } finally {
    process.stdout.write = originalWrite;
    await removeTempDir(repoDir);
  }

  const output = writes.join("");
  assert.match(output, /Next: inspect/);
  assert.match(output, /Recent: 2026-03-09T12:00:00.000Z runtime\.ready signal=pid_alive, runtimePid=7173; runtime\.no_visible_progress age=40m/);
  assert.match(
    output,
    /running\tsession-no-progress\tagent-no-progress[^\n]*\tinspect\t2026-03-09T12:00:00.000Z runtime\.ready signal=pid_alive, runtimePid=7173; runtime\.no_visible_progress age=40m/
  );
  assert.doesNotMatch(output, /runtime\.stalled/);
});

test("statusCommand suppresses the no-visible-progress hint when the worktree has uncommitted changes", async () => {
  const repoDir = await createInitializedRepo();
  const writes: string[] = [];
  const originalWrite = process.stdout.write.bind(process.stdout);
  const worktreePath = await createTrackedStatusSession(repoDir, {
    id: "session-worktree-dirty",
    agentName: "agent-worktree-dirty",
    runtimePid: 7174,
    createdAt: "2026-03-09T12:00:00.000Z",
    updatedAt: "2026-03-09T12:09:00.000Z"
  });

  await writeFile(join(worktreePath, "dirty.txt"), "pending work\n", "utf8");

  process.stdout.write = ((chunk: string | Uint8Array) => {
    writes.push(typeof chunk === "string" ? chunk : chunk.toString());
    return true;
  }) as typeof process.stdout.write;

  try {
    await statusCommand({
      startDir: repoDir,
      selector: "session-worktree-dirty",
      isRuntimeAlive: (pid) => pid === 7174,
      now: () => "2026-03-09T12:10:00.000Z"
    });
  } finally {
    process.stdout.write = originalWrite;
    await removeTempDir(repoDir);
  }

  const output = writes.join("");
  assert.match(output, /Next: wait/);
  assert.doesNotMatch(output, /runtime\.no_visible_progress/);
});

test("statusCommand suppresses the no-visible-progress hint when the agent branch is ahead of base", async () => {
  const repoDir = await createInitializedRepo();
  const writes: string[] = [];
  const originalWrite = process.stdout.write.bind(process.stdout);
  const worktreePath = await createTrackedStatusSession(repoDir, {
    id: "session-branch-ahead",
    agentName: "agent-branch-ahead",
    runtimePid: 7175,
    createdAt: "2026-03-09T12:00:00.000Z",
    updatedAt: "2026-03-09T12:09:00.000Z"
  });

  await writeFile(join(worktreePath, "committed.txt"), "visible commit\n", "utf8");
  await git(worktreePath, ["add", "committed.txt"]);
  await git(worktreePath, ["commit", "-m", "Record visible progress"]);

  process.stdout.write = ((chunk: string | Uint8Array) => {
    writes.push(typeof chunk === "string" ? chunk : chunk.toString());
    return true;
  }) as typeof process.stdout.write;

  try {
    await statusCommand({
      startDir: repoDir,
      selector: "session-branch-ahead",
      isRuntimeAlive: (pid) => pid === 7175,
      now: () => "2026-03-09T12:10:00.000Z"
    });
  } finally {
    process.stdout.write = originalWrite;
    await removeTempDir(repoDir);
  }

  const output = writes.join("");
  assert.match(output, /Next: wait/);
  assert.doesNotMatch(output, /runtime\.no_visible_progress/);
});

test("statusCommand suppresses the no-visible-progress hint when inbound mail already exists even after it is read", async () => {
  const repoDir = await createInitializedRepo();
  const writes: string[] = [];
  const originalWrite = process.stdout.write.bind(process.stdout);

  await createTrackedStatusSession(repoDir, {
    id: "session-read-inbound-mail",
    agentName: "agent-read-inbound-mail",
    runtimePid: 7176,
    createdAt: "2026-03-09T12:00:00.000Z",
    updatedAt: "2026-03-09T12:09:00.000Z"
  });
  await createMail(repoDir, {
    sessionId: "session-read-inbound-mail",
    sender: "agent-read-inbound-mail",
    recipient: "operator",
    body: "I already have something to show.",
    createdAt: "2026-03-09T12:06:00.000Z"
  });
  await readUnreadMailForSession(repoDir, "session-read-inbound-mail");

  process.stdout.write = ((chunk: string | Uint8Array) => {
    writes.push(typeof chunk === "string" ? chunk : chunk.toString());
    return true;
  }) as typeof process.stdout.write;

  try {
    await statusCommand({
      startDir: repoDir,
      selector: "session-read-inbound-mail",
      isRuntimeAlive: (pid) => pid === 7176,
      now: () => "2026-03-09T12:10:00.000Z"
    });
  } finally {
    process.stdout.write = originalWrite;
    await removeTempDir(repoDir);
  }

  const output = writes.join("");
  assert.match(output, /Next: wait/);
  assert.doesNotMatch(output, /runtime\.no_visible_progress/);
});

test("statusCommand keeps unread inbound mail as the higher-priority next action over no visible progress", async () => {
  const repoDir = await createInitializedRepo();
  const writes: string[] = [];
  const originalWrite = process.stdout.write.bind(process.stdout);

  await createTrackedStatusSession(repoDir, {
    id: "session-unread-inbound-mail",
    agentName: "agent-unread-inbound-mail",
    runtimePid: 7177,
    createdAt: "2026-03-09T12:00:00.000Z",
    updatedAt: "2026-03-09T12:09:00.000Z"
  });
  await createMail(repoDir, {
    sessionId: "session-unread-inbound-mail",
    sender: "agent-unread-inbound-mail",
    recipient: "operator",
    body: "Visible progress is in this message.",
    createdAt: "2026-03-09T12:06:00.000Z"
  });

  process.stdout.write = ((chunk: string | Uint8Array) => {
    writes.push(typeof chunk === "string" ? chunk : chunk.toString());
    return true;
  }) as typeof process.stdout.write;

  try {
    await statusCommand({
      startDir: repoDir,
      selector: "session-unread-inbound-mail",
      isRuntimeAlive: (pid) => pid === 7177,
      now: () => "2026-03-09T12:10:00.000Z"
    });
  } finally {
    process.stdout.write = originalWrite;
    await removeTempDir(repoDir);
  }

  const output = writes.join("");
  assert.match(output, /Next: mail/);
  assert.doesNotMatch(output, /runtime\.no_visible_progress/);
});

test("statusCommand still reconciles dead runtimes to failed instead of no visible progress", async () => {
  const repoDir = await createInitializedRepo();
  const writes: string[] = [];
  const originalWrite = process.stdout.write.bind(process.stdout);

  await createTrackedStatusSession(repoDir, {
    id: "session-dead-runtime",
    agentName: "agent-dead-runtime",
    runtimePid: 7178,
    createdAt: "2026-03-09T12:00:00.000Z",
    updatedAt: "2026-03-09T12:09:00.000Z"
  });

  process.stdout.write = ((chunk: string | Uint8Array) => {
    writes.push(typeof chunk === "string" ? chunk : chunk.toString());
    return true;
  }) as typeof process.stdout.write;

  try {
    await statusCommand({
      startDir: repoDir,
      selector: "session-dead-runtime",
      isRuntimeAlive: () => false,
      now: () => "2026-03-09T12:10:00.000Z"
    });
  } finally {
    process.stdout.write = originalWrite;
    await removeTempDir(repoDir);
  }

  const output = writes.join("");
  assert.match(output, /Recent: 2026-03-09T12:10:00.000Z runtime\.exited reason=pid_not_alive, runtimePid=7178/);
  assert.match(
    output,
    /failed\tsession-dead-runtime\tagent-dead-runtime[^\n]*\t2026-03-09T12:10:00.000Z runtime\.exited reason=pid_not_alive, runtimePid=7178/
  );
  assert.doesNotMatch(output, /runtime\.no_visible_progress/);
});

test("statusCommand shows the stalled hint in the selected-session view for a quiet running session", async () => {
  const repoDir = await createInitializedRepo();
  const writes: string[] = [];
  const originalWrite = process.stdout.write.bind(process.stdout);

  await createSession(repoDir, {
    id: "session-selected-stalled",
    agentName: "agent-selected-stalled",
    branch: "agents/agent-selected-stalled",
    worktreePath: join(repoDir, ".switchyard", "worktrees", "agent-selected-stalled"),
    state: "running",
    runtimePid: 7272,
    createdAt: "2026-03-09T12:00:00.000Z",
    updatedAt: "2026-03-09T12:20:00.000Z"
  });
  await createEvent(repoDir, {
    sessionId: "session-selected-stalled",
    agentName: "agent-selected-stalled",
    eventType: "runtime.ready",
    payload: {
      signal: "pid_alive",
      runtimePid: 7272
    },
    createdAt: "2026-03-09T12:00:00.000Z"
  });

  process.stdout.write = ((chunk: string | Uint8Array) => {
    writes.push(typeof chunk === "string" ? chunk : chunk.toString());
    return true;
  }) as typeof process.stdout.write;

  try {
    await statusCommand({
      startDir: repoDir,
      selector: "session-selected-stalled",
      isRuntimeAlive: (pid) => pid === 7272,
      now: () => "2026-03-09T12:35:00.000Z"
    });
  } finally {
    process.stdout.write = originalWrite;
    await removeTempDir(repoDir);
  }

  const output = writes.join("");
  assert.match(output, /^Status for agent-selected-stalled \(session-selected-stalled\):/m);
  assert.match(output, /Next: inspect/);
  assert.match(
    output,
    /Recent: 2026-03-09T12:00:00.000Z runtime\.ready signal=pid_alive, runtimePid=7272; runtime\.stalled idleFor=35m/
  );
  assert.match(
    output,
    /running\tsession-selected-stalled\tagent-selected-stalled\tagents\/agent-selected-stalled\t\.switchyard\/worktrees\/agent-selected-stalled\t2026-03-09T12:20:00.000Z\t0\t[^\t]+\t-\t-\tinspect\t2026-03-09T12:00:00.000Z runtime\.ready signal=pid_alive, runtimePid=7272; runtime\.stalled idleFor=35m/
  );
});

test("statusCommand keeps the stalled hint visible when the all-session recent summary is truncated", async () => {
  const repoDir = await createInitializedRepo();
  const writes: string[] = [];
  const originalWrite = process.stdout.write.bind(process.stdout);

  await createSession(repoDir, {
    id: "session-stalled-truncated",
    agentName: "agent-stalled-truncated",
    branch: "agents/agent-stalled-truncated",
    worktreePath: join(repoDir, ".switchyard", "worktrees", "agent-stalled-truncated"),
    state: "running",
    runtimePid: 7282,
    createdAt: "2026-03-09T12:00:00.000Z",
    updatedAt: "2026-03-09T12:20:00.000Z"
  });
  await createEvent(repoDir, {
    sessionId: "session-stalled-truncated",
    agentName: "agent-stalled-truncated",
    eventType: "sling.completed",
    payload: {
      runtimePid: 7282,
      baseBranch: "main",
      readyAfterMs: 500,
      taskSummary: "This is a deliberately long task summary that should force the all-session RECENT column to truncate before the stalled hint unless the formatter reserves space for it."
    },
    createdAt: "2026-03-09T12:00:00.000Z"
  });

  process.stdout.write = ((chunk: string | Uint8Array) => {
    writes.push(typeof chunk === "string" ? chunk : chunk.toString());
    return true;
  }) as typeof process.stdout.write;

  try {
    await statusCommand({
      startDir: repoDir,
      isRuntimeAlive: (pid) => pid === 7282,
      now: () => "2026-03-09T12:35:00.000Z"
    });
  } finally {
    process.stdout.write = originalWrite;
    await removeTempDir(repoDir);
  }

  assert.match(
    writes.join(""),
    /running\tsession-stalled-truncated\tagent-stalled-truncated[^\n]*\tinspect\t[^\n]*runtime\.stalled idleFor=35m/
  );
});

test("statusCommand keeps a newer blocking event in RECENT even when unread mail still drives NEXT", async () => {
  const repoDir = await createInitializedRepo();
  const writes: string[] = [];
  const originalWrite = process.stdout.write.bind(process.stdout);

  await createSession(repoDir, {
    id: "session-selected-mail-blocked",
    agentName: "agent-selected-mail-blocked",
    branch: "agents/agent-selected-mail-blocked",
    worktreePath: join(repoDir, ".switchyard", "worktrees", "agent-selected-mail-blocked"),
    state: "stopped",
    runtimePid: null,
    createdAt: "2026-03-09T12:10:00.000Z",
    updatedAt: "2026-03-09T12:10:00.000Z"
  });
  await createMail(repoDir, {
    sessionId: "session-selected-mail-blocked",
    sender: "agent-selected-mail-blocked",
    recipient: "operator",
    body: "Need your decision.",
    createdAt: "2026-03-09T12:11:00.000Z"
  });
  await createEvent(repoDir, {
    sessionId: "session-selected-mail-blocked",
    agentName: "agent-selected-mail-blocked",
    eventType: "merge.failed",
    payload: {
      branch: "agents/agent-selected-mail-blocked",
      reason: "merge_conflict",
      canonicalBranch: "main",
      conflictCount: 1,
      firstConflictPath: "src/conflict.ts"
    },
    createdAt: "2026-03-09T12:12:00.000Z"
  });

  process.stdout.write = ((chunk: string | Uint8Array) => {
    writes.push(typeof chunk === "string" ? chunk : chunk.toString());
    return true;
  }) as typeof process.stdout.write;

  try {
    await statusCommand({
      startDir: repoDir,
      selector: "session-selected-mail-blocked",
      isRuntimeAlive: () => false
    });
  } finally {
    process.stdout.write = originalWrite;
    await removeTempDir(repoDir);
  }

  const output = writes.join("");
  assert.match(output, /Unread: 1/);
  assert.match(output, /Next: mail/);
  assert.match(
    output,
    /Recent: 2026-03-09T12:12:00.000Z merge\.failed reason=merge_conflict, conflictCount=1, firstConflictPath=src\/conflict\.ts, branch=agents\/agent-selected-mail-blocked, canonicalBranch=main/
  );
  assert.match(
    output,
    /stopped\tsession-selected-mail-blocked\tagent-selected-mail-blocked[^\n]*\tmail\t2026-03-09T12:12:00.000Z merge\.failed reason=merge_conflict, conflictCount=1, firstConflictPath=src\/conflict\.ts, bran\.\.\./
  );
});

test("statusCommand does not let operator-only activity reset the stalled idle clock", async () => {
  const repoDir = await createInitializedRepo();
  const writes: string[] = [];
  const originalWrite = process.stdout.write.bind(process.stdout);

  await createSession(repoDir, {
    id: "session-stalled-operator-activity",
    agentName: "agent-stalled-operator-activity",
    branch: "agents/agent-stalled-operator-activity",
    worktreePath: join(repoDir, ".switchyard", "worktrees", "agent-stalled-operator-activity"),
    state: "running",
    runtimePid: 7373,
    createdAt: "2026-03-09T12:00:00.000Z",
    updatedAt: "2026-03-09T12:25:00.000Z"
  });
  await createEvent(repoDir, {
    sessionId: "session-stalled-operator-activity",
    agentName: "agent-stalled-operator-activity",
    eventType: "runtime.ready",
    payload: {
      signal: "pid_alive",
      runtimePid: 7373
    },
    createdAt: "2026-03-09T12:00:00.000Z"
  });
  await createEvent(repoDir, {
    sessionId: "session-stalled-operator-activity",
    agentName: "agent-stalled-operator-activity",
    eventType: "mail.sent",
    payload: {
      sender: "operator",
      bodyLength: 31
    },
    createdAt: "2026-03-09T12:25:00.000Z"
  });

  process.stdout.write = ((chunk: string | Uint8Array) => {
    writes.push(typeof chunk === "string" ? chunk : chunk.toString());
    return true;
  }) as typeof process.stdout.write;

  try {
    await statusCommand({
      startDir: repoDir,
      selector: "session-stalled-operator-activity",
      isRuntimeAlive: (pid) => pid === 7373,
      now: () => "2026-03-09T12:40:00.000Z"
    });
  } finally {
    process.stdout.write = originalWrite;
    await removeTempDir(repoDir);
  }

  const output = writes.join("");
  assert.match(output, /Next: inspect/);
  assert.match(
    output,
    /Recent: 2026-03-09T12:25:00.000Z mail\.sent sender=operator, bodyLength=31; runtime\.stalled idleFor=40m/
  );
});

test("statusCommand preserves a higher-value concrete recent summary and appends the stalled hint", async () => {
  const repoDir = await createInitializedRepo();
  const writes: string[] = [];
  const originalWrite = process.stdout.write.bind(process.stdout);

  await createSession(repoDir, {
    id: "session-stalled-blocked",
    agentName: "agent-stalled-blocked",
    branch: "agents/agent-stalled-blocked",
    worktreePath: join(repoDir, ".switchyard", "worktrees", "agent-stalled-blocked"),
    state: "running",
    runtimePid: 7474,
    createdAt: "2026-03-09T12:00:00.000Z",
    updatedAt: "2026-03-09T12:20:00.000Z"
  });
  await createEvent(repoDir, {
    sessionId: "session-stalled-blocked",
    agentName: "agent-stalled-blocked",
    eventType: "runtime.ready",
    payload: {
      signal: "pid_alive",
      runtimePid: 7474
    },
    createdAt: "2026-03-09T12:00:00.000Z"
  });
  await createEvent(repoDir, {
    sessionId: "session-stalled-blocked",
    agentName: "agent-stalled-blocked",
    eventType: "stop.failed",
    payload: {
      reason: "runtime_stop_failed",
      runtimePid: 7474,
      errorMessage: "still running"
    },
    createdAt: "2026-03-09T12:25:00.000Z"
  });

  process.stdout.write = ((chunk: string | Uint8Array) => {
    writes.push(typeof chunk === "string" ? chunk : chunk.toString());
    return true;
  }) as typeof process.stdout.write;

  try {
    await statusCommand({
      startDir: repoDir,
      selector: "session-stalled-blocked",
      isRuntimeAlive: (pid) => pid === 7474,
      now: () => "2026-03-09T12:40:00.000Z"
    });
  } finally {
    process.stdout.write = originalWrite;
    await removeTempDir(repoDir);
  }

  const output = writes.join("");
  assert.match(output, /Next: inspect/);
  assert.match(
    output,
    /Recent: 2026-03-09T12:25:00.000Z stop\.failed reason=runtime_stop_failed, runtimePid=7474, errorMessage="still running"; runtime\.stalled idleFor=40m/
  );
});

test("statusCommand does not switch the follow-up signal to mail for unread outbound operator mail", async () => {
  const repoDir = await createInitializedRepo();
  const writes: string[] = [];
  const originalWrite = process.stdout.write.bind(process.stdout);

  await createSession(repoDir, {
    id: "session-outbound-mail",
    agentName: "agent-outbound-mail",
    branch: "agents/agent-outbound-mail",
    worktreePath: join(repoDir, ".switchyard", "worktrees", "agent-outbound-mail"),
    state: "running",
    runtimePid: 7373,
    createdAt: "2026-03-09T12:20:00.000Z",
    updatedAt: "2026-03-09T12:20:00.000Z"
  });
  await createMail(repoDir, {
    sessionId: "session-outbound-mail",
    sender: "operator",
    recipient: "agent-outbound-mail",
    body: "Please continue the current task.",
    createdAt: "2026-03-09T12:21:00.000Z"
  });
  await createEvent(repoDir, {
    sessionId: "session-outbound-mail",
    agentName: "agent-outbound-mail",
    eventType: "mail.sent",
    payload: {
      sender: "operator",
      recipient: "agent-outbound-mail",
      bodyLength: 33
    },
    createdAt: "2026-03-09T12:22:00.000Z"
  });

  process.stdout.write = ((chunk: string | Uint8Array) => {
    writes.push(typeof chunk === "string" ? chunk : chunk.toString());
    return true;
  }) as typeof process.stdout.write;

  try {
    await statusCommand({
      startDir: repoDir,
      selector: "session-outbound-mail",
      isRuntimeAlive: (pid) => pid === 7373,
      now: () => "2026-03-09T12:25:00.000Z"
    });
  } finally {
    process.stdout.write = originalWrite;
    await removeTempDir(repoDir);
  }

  const output = writes.join("");
  assert.match(output, /Unread: 1/);
  assert.match(output, /Next: wait/);
  assert.match(
    output,
    /running\tsession-outbound-mail\tagent-outbound-mail\tagents\/agent-outbound-mail\t\.switchyard\/worktrees\/agent-outbound-mail\t2026-03-09T12:22:00.000Z\t1\t[^\t]+\t-\t-\twait\t2026-03-09T12:22:00.000Z mail\.sent sender=operator, bodyLength=33/
  );
});

test("statusCommand keeps unread inbound operator mail as the higher-priority next action even when the session is stalled", async () => {
  const repoDir = await createInitializedRepo();
  const writes: string[] = [];
  const originalWrite = process.stdout.write.bind(process.stdout);

  await createSession(repoDir, {
    id: "session-stalled-unread-mail",
    agentName: "agent-stalled-unread-mail",
    branch: "agents/agent-stalled-unread-mail",
    worktreePath: join(repoDir, ".switchyard", "worktrees", "agent-stalled-unread-mail"),
    state: "running",
    runtimePid: 7575,
    createdAt: "2026-03-09T12:00:00.000Z",
    updatedAt: "2026-03-09T12:10:00.000Z"
  });
  await createEvent(repoDir, {
    sessionId: "session-stalled-unread-mail",
    agentName: "agent-stalled-unread-mail",
    eventType: "runtime.ready",
    payload: {
      signal: "pid_alive",
      runtimePid: 7575
    },
    createdAt: "2026-03-09T12:00:00.000Z"
  });
  await createMail(repoDir, {
    sessionId: "session-stalled-unread-mail",
    sender: "agent-stalled-unread-mail",
    recipient: "operator",
    body: "Need your sign-off.",
    createdAt: "2026-03-09T12:10:00.000Z"
  });

  process.stdout.write = ((chunk: string | Uint8Array) => {
    writes.push(typeof chunk === "string" ? chunk : chunk.toString());
    return true;
  }) as typeof process.stdout.write;

  try {
    await statusCommand({
      startDir: repoDir,
      selector: "session-stalled-unread-mail",
      isRuntimeAlive: (pid) => pid === 7575,
      now: () => "2026-03-09T12:40:00.000Z"
    });
  } finally {
    process.stdout.write = originalWrite;
    await removeTempDir(repoDir);
  }

  const output = writes.join("");
  assert.match(output, /Unread: 1/);
  assert.match(output, /Next: mail/);
  assert.match(
    output,
    /Recent: 2026-03-09T12:10:00.000Z mail\.unread unreadCount=1, sender=agent-stalled-unread-mail, bodyPreview="Need your sign-off\."/
  );
});

test("statusCommand preserves the launch command when the latest launch event is sling.failed", async () => {
  const repoDir = await createInitializedRepo();
  const writes: string[] = [];
  const originalWrite = process.stdout.write.bind(process.stdout);

  await createSession(repoDir, {
    id: "session-failed-launch",
    agentName: "agent-failed-launch",
    branch: "agents/agent-failed-launch",
    baseBranch: "main",
    worktreePath: join(repoDir, ".switchyard", "worktrees", "agent-failed-launch"),
    state: "failed",
    runtimePid: null,
    createdAt: "2026-03-09T12:00:00.000Z",
    updatedAt: "2026-03-09T12:01:00.000Z"
  });
  await createEvent(repoDir, {
    sessionId: "session-failed-launch",
    agentName: "agent-failed-launch",
    eventType: "sling.spawned",
    payload: {
      runtimePid: 9001,
      runtimeCommand: "codex --model gpt-5",
      taskSummary: "Exercise the early readiness failure path.",
      taskSpecPath: ".switchyard/specs/agent-failed-launch-session-failed-launch.md"
    },
    createdAt: "2026-03-09T12:00:30.000Z"
  });
  await createEvent(repoDir, {
    sessionId: "session-failed-launch",
    agentName: "agent-failed-launch",
    eventType: "sling.failed",
    payload: {
      errorMessage: "Codex exited before Switchyard marked the session ready (exit code 1).",
      taskSummary: "Exercise the early readiness failure path.",
      taskSpecPath: ".switchyard/specs/agent-failed-launch-session-failed-launch.md",
      cleanupSucceeded: true
    },
    createdAt: "2026-03-09T12:01:00.000Z"
  });

  process.stdout.write = ((chunk: string | Uint8Array) => {
    writes.push(typeof chunk === "string" ? chunk : chunk.toString());
    return true;
  }) as typeof process.stdout.write;

  try {
    await statusCommand({
      selector: "session-failed-launch",
      startDir: repoDir,
      isRuntimeAlive: () => false
    });
  } finally {
    process.stdout.write = originalWrite;
    await removeTempDir(repoDir);
  }

  const output = writes.join("");
  assert.match(output, /^Status for agent-failed-launch \(session-failed-launch\):/m);
  assert.match(output, /Runtime pid: -/);
  assert.match(output, /Runtime: codex --model gpt-5/);
  assert.match(output, /Task: Exercise the early readiness failure path\./);
  assert.match(
    output,
    /Recent: 2026-03-09T12:01:00.000Z sling\.failed errorMessage="Codex exited before Switchyard marked the session ready \(exit code 1\)\.", taskSummary="Exercise the early readiness failure path\.", taskSpecPath=/
  );
});

test("statusCommand prints the full stored task text when requested for one selected session", async () => {
  const repoDir = await createInitializedRepo();
  const writes: string[] = [];
  const originalWrite = process.stdout.write.bind(process.stdout);
  const task = [
    "Inspect the preserved worktree and produce an operator-facing merge-risk summary that calls out cleanup blockers.",
    "",
    "Also include:",
    "- the latest stop failure details",
    "- any branch drift that would break reintegration"
  ].join("\n");

  try {
    await slingCommand({
      agentName: "Agent Task Full",
      task,
      startDir: repoDir,
      spawnRuntime: async ({ runtimeArgs, onSpawned }) => {
        const runtime = {
          pid: 8282,
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

    process.stdout.write = ((chunk: string | Uint8Array) => {
      writes.push(typeof chunk === "string" ? chunk : chunk.toString());
      return true;
    }) as typeof process.stdout.write;

    await statusCommand({
      selector: "agent-task-full",
      showTask: true,
      startDir: repoDir,
      isRuntimeAlive: (pid) => pid === 8282,
      now: () => "2026-03-09T12:05:00.000Z"
    });
  } finally {
    process.stdout.write = originalWrite;
    await removeTempDir(repoDir);
  }

  const output = writes.join("");
  assert.match(output, new RegExp(`Task: ${summarizeTask(task).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
  assert.match(
    output,
    /Instruction:\nInspect the preserved worktree and produce an operator-facing merge-risk summary that calls out cleanup blockers\.\n\nAlso include:\n- the latest stop failure details\n- any branch drift that would break reintegration/
  );
  assert.match(output, /\n\nSTATE\tSESSION\tAGENT\tBRANCH\tWORKTREE\tUPDATED\tUNREAD\tCLEANUP\tTASK\tRUN\tNEXT\tRECENT\n/);
});

test("statusCommand rejects full task inspection without an exact selector", async () => {
  const repoDir = await createInitializedRepo();

  try {
    await assert.rejects(
      () => statusCommand({ startDir: repoDir, showTask: true }),
      (error) => {
        assert.equal(error instanceof Error, true);
        assert.equal(
          (error as Error).message,
          "Full task inspection requires an exact session selector. Use 'sy status <session> --task'."
        );
        return true;
      }
    );
  } finally {
    await removeTempDir(repoDir);
  }
});

test("sy status prints the full stored task text when --task is passed through the CLI", async () => {
  const repoDir = await createInitializedRepo();
  const sessionId = "session-cli-task";
  const agentName = "agent-cli-task";
  const task = [
    "Inspect the preserved worktree and produce an operator-facing merge-risk summary.",
    "",
    "Call out:",
    "- cleanup blockers",
    "- branch drift"
  ].join("\n");

  try {
    await git(repoDir, ["branch", `agents/${agentName}`]);
    await mkdir(join(repoDir, ".switchyard", "worktrees", agentName), { recursive: true });
    await createSession(repoDir, {
      id: sessionId,
      agentName,
      branch: `agents/${agentName}`,
      baseBranch: "main",
      worktreePath: join(repoDir, ".switchyard", "worktrees", agentName),
      state: "stopped",
      runtimePid: null,
      createdAt: "2026-03-09T12:00:00.000Z",
      updatedAt: "2026-03-09T12:00:00.000Z"
    });
    await writeTaskSpec({
      projectRoot: repoDir,
      sessionId,
      agentName,
      task,
      createdAt: "2026-03-09T12:00:00.000Z",
      branch: `agents/${agentName}`,
      baseBranch: "main",
      worktreePath: join(repoDir, ".switchyard", "worktrees", agentName)
    });

    const { stdout, stderr } = await execFileAsync(
      process.execPath,
      [tsxCliPath, cliEntryPath, "status", sessionId, "--task"],
      { cwd: repoDir }
    );

    assert.equal(stderr, "");
    assert.match(stdout, /^Status for agent-cli-task \(session-cli-task\):/m);
    assert.match(stdout, new RegExp(`Task: ${escapeRegExp(summarizeTask(task))}`));
    assert.match(
      stdout,
      /Instruction:\nInspect the preserved worktree and produce an operator-facing merge-risk summary\.\n\nCall out:\n- cleanup blockers\n- branch drift/
    );
    assert.match(stdout, /\n\nSTATE\tSESSION\tAGENT\tBRANCH\tWORKTREE\tUPDATED\tUNREAD\tCLEANUP\tTASK\tRUN\tNEXT\tRECENT\n/);
  } finally {
    await removeTempDir(repoDir);
  }
});

test("sy status reports missing selector for --task through the Switchyard error contract", async () => {
  const repoDir = await createInitializedRepo();

  try {
    await assert.rejects(
      () => execFileAsync(process.execPath, [tsxCliPath, cliEntryPath, "status", "--task"], { cwd: repoDir }),
      (error: unknown) => {
        assert.ok(error && typeof error === "object");
        assert.equal("code" in error ? error.code : undefined, 1);
        assert.equal("stdout" in error ? error.stdout : undefined, "");
        assert.match(
          "stderr" in error && typeof error.stderr === "string" ? error.stderr : "",
          /STATUS_ERROR: Full task inspection requires an exact session selector\. Use 'sy status <session> --task'\.\n/
        );
        return true;
      }
    );
  } finally {
    await removeTempDir(repoDir);
  }
});

test("statusCommand fails explicitly when the stored task spec is missing", async () => {
  const repoDir = await createInitializedRepo();

  try {
    await slingCommand({
      agentName: "Agent Task Missing",
      task: "Inspect the task spec failure path.",
      startDir: repoDir,
      spawnRuntime: async ({ runtimeArgs, onSpawned }) => {
        const runtime = {
          pid: 8383,
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

    const sessionId = (await listSessions(repoDir))[0]?.id;
    assert.ok(sessionId);
    await rm(join(repoDir, ".switchyard", "specs", `agent-task-missing-${sessionId}.md`));

    await assert.rejects(
      () =>
        statusCommand({
          selector: sessionId,
          showTask: true,
          startDir: repoDir,
          isRuntimeAlive: (pid) => pid === 8383
        }),
      (error) => {
        assert.equal(error instanceof Error, true);
        assert.equal((error as Error).message, `Stored task text is unavailable for session '${sessionId}'.`);
        return true;
      }
    );
  } finally {
    await removeTempDir(repoDir);
  }
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
    eventType: "sling.completed",
    payload: {
      runtimePid: 5151,
      runtimeCommand: "codex --model gpt-5",
      taskSummary: "Inspect the selected session launch metadata.",
      taskSpecPath: ".switchyard/specs/agent-selected-session-selected.md",
      readyAfterMs: 500
    },
    createdAt: "2026-03-08T12:05:30.000Z"
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
      isRuntimeAlive: (pid) => pid === 5151,
      now: () => "2026-03-08T12:20:00.000Z"
    });
  } finally {
    process.stdout.write = originalWrite;
    await removeTempDir(repoDir);
  }

  const output = writes.join("");
  assert.match(output, /^Status for agent-selected \(session-selected\):/m);
  assert.match(output, /Base: main/);
  assert.match(output, /Runtime pid: 5151/);
  assert.match(output, /Runtime: codex --model gpt-5/);
  assert.match(output, /Log: \.switchyard\/logs\/agent-selected-session-selected\.log/);
  assert.match(output, /Created: 2026-03-08T12:00:00.000Z/);
  assert.match(output, /Unread: 0/);
  assert.match(output, /Cleanup: [^\n]+/);
  assert.match(output, /Run: -/);
  assert.match(output, /Next: wait/);
  assert.match(output, /Recent: 2026-03-08T12:06:00.000Z mail\.sent sender=operator, bodyLength=18/);
  assert.match(
    output,
    /running\tsession-selected\tagent-selected\tagents\/agent-selected\t\.switchyard\/worktrees\/agent-selected\t2026-03-08T12:06:00.000Z\t0\t[^\t]+\t-\t-\twait\t2026-03-08T12:06:00.000Z mail\.sent sender=operator, bodyLength=18/
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
    /stopped\t!!!\tagent-bang\tagents\/agent-bang\t\.switchyard\/worktrees\/agent-bang\t2026-03-08T09:00:00.000Z\t0\t[^\t]+\t-\t-/
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
      isRuntimeAlive: (pid) => pid === 1111,
      now: () => "2026-03-08T09:20:00.000Z"
    });
  } finally {
    process.stdout.write = originalWrite;
    await removeTempDir(repoDir);
  }

  const output = writes.join("");
  assert.match(
    output,
    /running\tsession-1\tagent-one\tagents\/agent-one\t\.switchyard\/worktrees\/agent-one\t2026-03-08T09:15:00.000Z\t0\t[^\t]+\t-\t-\twait\t2026-03-08T09:15:00.000Z mail\.sent sender=operator, bodyLength=18/
  );
  assert.match(
    output,
    /stopped\tsession-2\tagent-two\tagents\/agent-two\t\.switchyard\/worktrees\/agent-two\t2026-03-08T09:20:00.000Z\t0\t[^\t]+\t-\t-\t[^\t]+\t2026-03-08T09:20:00.000Z stop\.completed outcome=stopped, cleanupPerformed=true/
  );
});

test("statusCommand uses the latest operator-visible activity for row freshness and same-bucket ordering", async () => {
  const repoDir = await createInitializedRepo();
  const writes: string[] = [];
  const originalWrite = process.stdout.write.bind(process.stdout);

  await createSession(repoDir, {
    id: "session-recent-event",
    agentName: "agent-recent-event",
    branch: "agents/agent-recent-event",
    baseBranch: "main",
    worktreePath: join(repoDir, ".switchyard", "worktrees", "agent-recent-event"),
    state: "stopped",
    runtimePid: null,
    createdAt: "2026-03-08T09:00:00.000Z",
    updatedAt: "2026-03-08T09:00:00.000Z"
  });
  await createSession(repoDir, {
    id: "session-newer-row",
    agentName: "agent-newer-row",
    branch: "agents/agent-newer-row",
    baseBranch: "main",
    worktreePath: join(repoDir, ".switchyard", "worktrees", "agent-newer-row"),
    state: "stopped",
    runtimePid: null,
    createdAt: "2026-03-08T10:00:00.000Z",
    updatedAt: "2026-03-08T11:00:00.000Z"
  });
  await createEvent(repoDir, {
    sessionId: "session-recent-event",
    agentName: "agent-recent-event",
    eventType: "merge.failed",
    payload: {
      branch: "agents/agent-recent-event",
      reason: "merge_conflict",
      canonicalBranch: "main",
      conflictCount: 1,
      firstConflictPath: "src/conflict.ts"
    },
    createdAt: "2026-03-08T12:00:00.000Z"
  });

  process.stdout.write = ((chunk: string | Uint8Array) => {
    writes.push(typeof chunk === "string" ? chunk : chunk.toString());
    return true;
  }) as typeof process.stdout.write;

  try {
    await statusCommand({
      startDir: repoDir,
      isRuntimeAlive: () => false,
      getCleanupReadiness: async () => "abandon-only:legacy"
    });
  } finally {
    process.stdout.write = originalWrite;
    await removeTempDir(repoDir);
  }

  const output = writes.join("");
  assert.match(
    output,
    /stopped\tsession-recent-event\tagent-recent-event\tagents\/agent-recent-event\t\.switchyard\/worktrees\/agent-recent-event\t2026-03-08T12:00:00.000Z\t0\tabandon-only:legacy\t-\t-\tinspect\t2026-03-08T12:00:00.000Z merge\.failed reason=merge_conflict, conflictCount=1, firstConflictPath=src\/conflict\.ts, bran\.\.\./
  );
  assert.match(
    output,
    /stopped\tsession-newer-row\tagent-newer-row\tagents\/agent-newer-row\t\.switchyard\/worktrees\/agent-newer-row\t2026-03-08T11:00:00.000Z\t0\tabandon-only:legacy\t-\t-\tinspect\t-/
  );
  assert.ok(output.indexOf("session-recent-event") < output.indexOf("session-newer-row"));
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

test("statusCommand includes stop cleanup mode details in the recent event summary", async () => {
  const repoDir = await createInitializedRepo();
  const writes: string[] = [];
  const originalWrite = process.stdout.write.bind(process.stdout);

  await createSession(repoDir, {
    id: "session-stop-cleanup-mode",
    agentName: "agent-stop-cleanup-mode",
    branch: "agents/agent-stop-cleanup-mode",
    worktreePath: join(repoDir, ".switchyard", "worktrees", "agent-stop-cleanup-mode"),
    state: "stopped",
    runtimePid: null,
    createdAt: "2026-03-08T09:22:30.000Z",
    updatedAt: "2026-03-08T09:22:30.000Z"
  });
  await createEvent(repoDir, {
    sessionId: "session-stop-cleanup-mode",
    agentName: "agent-stop-cleanup-mode",
    eventType: "stop.completed",
    payload: {
      outcome: "already_not_running",
      cleanupPerformed: true,
      cleanupMode: "abandoned"
    },
    createdAt: "2026-03-08T09:23:00.000Z"
  });

  process.stdout.write = ((chunk: string | Uint8Array) => {
    writes.push(typeof chunk === "string" ? chunk : chunk.toString());
    return true;
  }) as typeof process.stdout.write;

  try {
    await statusCommand({
      startDir: repoDir,
      selector: "session-stop-cleanup-mode",
      isRuntimeAlive: () => false
    });
  } finally {
    process.stdout.write = originalWrite;
    await removeTempDir(repoDir);
  }

  assert.match(
    writes.join(""),
    /Recent: 2026-03-08T09:23:00.000Z stop\.completed outcome=already_not_running, cleanupPerformed=true, cleanupMode=abandoned/
  );
});

test("statusCommand includes stop failure details in the recent event summary", async () => {
  const repoDir = await createInitializedRepo();
  const writes: string[] = [];
  const originalWrite = process.stdout.write.bind(process.stdout);

  await createSession(repoDir, {
    id: "session-stop-failed",
    agentName: "agent-stop-failed",
    branch: "agents/agent-stop-failed",
    worktreePath: join(repoDir, ".switchyard", "worktrees", "agent-stop-failed"),
    state: "running",
    runtimePid: 5150,
    createdAt: "2026-03-08T09:22:30.000Z",
    updatedAt: "2026-03-08T09:22:30.000Z"
  });
  await createEvent(repoDir, {
    sessionId: "session-stop-failed",
    agentName: "agent-stop-failed",
    eventType: "stop.failed",
    payload: {
      previousState: "running",
      reason: "runtime_stop_failed",
      runtimePid: 5150,
      errorMessage: "simulated stop failure"
    },
    createdAt: "2026-03-08T09:23:00.000Z"
  });

  process.stdout.write = ((chunk: string | Uint8Array) => {
    writes.push(typeof chunk === "string" ? chunk : chunk.toString());
    return true;
  }) as typeof process.stdout.write;

  try {
    await statusCommand({
      startDir: repoDir,
      selector: "session-stop-failed",
      isRuntimeAlive: (pid) => pid === 5150
    });
  } finally {
    process.stdout.write = originalWrite;
    await removeTempDir(repoDir);
  }

  assert.match(
    writes.join(""),
    /Recent: 2026-03-08T09:23:00.000Z stop\.failed reason=runtime_stop_failed, runtimePid=5150, errorMessage="simulated stop failure"/
  );
});

test("statusCommand preserves a latest stop failure summary when the same render promotes the session to running", async () => {
  const repoDir = await createInitializedRepo();
  const writes: string[] = [];
  const originalWrite = process.stdout.write.bind(process.stdout);

  await createSession(repoDir, {
    id: "session-stop-failed-starting",
    agentName: "agent-stop-failed-starting",
    branch: "agents/agent-stop-failed-starting",
    worktreePath: join(repoDir, ".switchyard", "worktrees", "agent-stop-failed-starting"),
    state: "starting",
    runtimePid: 5252,
    createdAt: "2026-03-08T09:22:30.000Z",
    updatedAt: "2026-03-08T09:22:30.000Z"
  });
  await createEvent(repoDir, {
    sessionId: "session-stop-failed-starting",
    agentName: "agent-stop-failed-starting",
    eventType: "stop.failed",
    payload: {
      previousState: "starting",
      reason: "runtime_stop_failed",
      runtimePid: 5252,
      errorMessage: "simulated stop failure"
    },
    createdAt: "2026-03-08T09:23:00.000Z"
  });

  process.stdout.write = ((chunk: string | Uint8Array) => {
    writes.push(typeof chunk === "string" ? chunk : chunk.toString());
    return true;
  }) as typeof process.stdout.write;

  try {
    await statusCommand({
      startDir: repoDir,
      selector: "session-stop-failed-starting",
      isRuntimeAlive: (pid) => pid === 5252,
      now: () => "2026-03-08T09:24:00.000Z"
    });

    const sessions = await listSessions(repoDir);
    assert.equal(sessions[0]?.state, "running");
    assert.equal(sessions[0]?.runtimePid, 5252);

    const events = await listEvents(repoDir, { sessionId: "session-stop-failed-starting" });
    assert.equal(events.length, 2);
    assert.equal(events[1]?.eventType, "runtime.ready");
  } finally {
    process.stdout.write = originalWrite;
    await removeTempDir(repoDir);
  }

  const output = writes.join("");
  assert.match(
    output,
    /Recent: 2026-03-08T09:23:00.000Z stop\.failed reason=runtime_stop_failed, runtimePid=5252, errorMessage="simulated stop failure"/
  );
  assert.match(
    output,
    /running\tsession-stop-failed-starting\tagent-stop-failed-starting[^\n]*\twait\t2026-03-08T09:23:00.000Z stop\.failed reason=runtime_stop_failed, runtimePid=5252, errorMessage="simulated stop failure"/
  );
});

test("statusCommand preserves a latest stop failure summary when the same render marks the session failed", async () => {
  const repoDir = await createInitializedRepo();
  const writes: string[] = [];
  const originalWrite = process.stdout.write.bind(process.stdout);

  await createSession(repoDir, {
    id: "session-stop-failed-running",
    agentName: "agent-stop-failed-running",
    branch: "agents/agent-stop-failed-running",
    worktreePath: join(repoDir, ".switchyard", "worktrees", "agent-stop-failed-running"),
    state: "running",
    runtimePid: 5353,
    createdAt: "2026-03-08T09:24:30.000Z",
    updatedAt: "2026-03-08T09:24:30.000Z"
  });
  await createEvent(repoDir, {
    sessionId: "session-stop-failed-running",
    agentName: "agent-stop-failed-running",
    eventType: "stop.failed",
    payload: {
      previousState: "running",
      reason: "runtime_stop_failed",
      runtimePid: 5353,
      errorMessage: "simulated stop failure"
    },
    createdAt: "2026-03-08T09:25:00.000Z"
  });

  process.stdout.write = ((chunk: string | Uint8Array) => {
    writes.push(typeof chunk === "string" ? chunk : chunk.toString());
    return true;
  }) as typeof process.stdout.write;

  try {
    await statusCommand({
      startDir: repoDir,
      selector: "session-stop-failed-running",
      isRuntimeAlive: () => false,
      now: () => "2026-03-08T09:26:00.000Z"
    });

    const sessions = await listSessions(repoDir);
    assert.equal(sessions[0]?.state, "failed");
    assert.equal(sessions[0]?.runtimePid, null);

    const events = await listEvents(repoDir, { sessionId: "session-stop-failed-running" });
    assert.equal(events.length, 2);
    assert.equal(events[1]?.eventType, "runtime.exited");
  } finally {
    process.stdout.write = originalWrite;
    await removeTempDir(repoDir);
  }

  const output = writes.join("");
  assert.match(
    output,
    /Recent: 2026-03-08T09:25:00.000Z stop\.failed reason=runtime_stop_failed, runtimePid=5353, errorMessage="simulated stop failure"/
  );
  assert.match(
    output,
    /failed\tsession-stop-failed-running\tagent-stop-failed-running[^\n]*\tinspect\t2026-03-08T09:25:00.000Z stop\.failed reason=runtime_stop_failed, runtimePid=5353, errorMessage="simulated stop failure"/
  );
});

test("statusCommand includes missing-worktree cleanup details in the recent event summary", async () => {
  const repoDir = await createInitializedRepo();
  const writes: string[] = [];
  const originalWrite = process.stdout.write.bind(process.stdout);

  await createSession(repoDir, {
    id: "session-stop-missing-worktree",
    agentName: "agent-stop-missing-worktree",
    branch: "agents/agent-stop-missing-worktree",
    worktreePath: join(repoDir, ".switchyard", "worktrees", "agent-stop-missing-worktree"),
    state: "stopped",
    runtimePid: null,
    createdAt: "2026-03-08T09:23:00.000Z",
    updatedAt: "2026-03-08T09:23:00.000Z"
  });
  await createEvent(repoDir, {
    sessionId: "session-stop-missing-worktree",
    agentName: "agent-stop-missing-worktree",
    eventType: "stop.completed",
    payload: {
      outcome: "already_not_running",
      cleanupPerformed: false,
      cleanupReason: "worktree_missing",
      worktreePath: ".switchyard/worktrees/agent-stop-missing-worktree"
    },
    createdAt: "2026-03-08T09:24:00.000Z"
  });

  process.stdout.write = ((chunk: string | Uint8Array) => {
    writes.push(typeof chunk === "string" ? chunk : chunk.toString());
    return true;
  }) as typeof process.stdout.write;

  try {
    await statusCommand({
      startDir: repoDir,
      selector: "session-stop-missing-worktree",
      isRuntimeAlive: () => false
    });
  } finally {
    process.stdout.write = originalWrite;
    await removeTempDir(repoDir);
  }

  assert.match(
    writes.join(""),
    /Recent: 2026-03-08T09:24:00.000Z stop\.completed outcome=already_not_running, cleanupPerformed=false, cleanupReason=worktree_missing, worktreePath=\.switchyard\/worktrees\/agent-stop-missing-worktree/
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
      isRuntimeAlive: (pid) => pid === 2222,
      now: () => "2026-03-08T11:20:00.000Z"
    });
  } finally {
    process.stdout.write = originalWrite;
    await removeTempDir(repoDir);
  }

  assert.match(
    writes.join(""),
    /running\tsession-ready\tagent-ready\tagents\/agent-ready\t\.switchyard\/worktrees\/agent-ready\t2026-03-08T11:01:00.000Z\t0\t[^\t]+\t-\t-\twait\t2026-03-08T11:01:00.000Z sling\.completed runtimePid=2222, baseBranch=main, readyAfterMs=500/
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
    /stopped\tsession-merge-conflict\tagent-merge-conflict\tagents\/agent-merge-conflict\t\.switchyard\/worktrees\/agent-merge-conflict\t2026-03-08T11:06:00.000Z\t0\t[^\t]+\t-\t-\t[^\t]+\t2026-03-08T11:06:00.000Z merge\.failed reason=merge_conflict, conflictCount=2, firstConflictPath=src\/conflict\.ts, bran\.\.\./
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
    /stopped\tsession-merge-preflight\tagent-merge-preflight\tagents\/agent-merge-preflight\t\.switchyard\/worktrees\/agent-merge-preflight\t2026-03-08T11:08:00.000Z\t0\t[^\t]+\t-\t-\t[^\t]+\t2026-03-08T11:08:00.000Z merge\.failed reason=repo_root_dirty, target=repo_root, firstDirtyEntry=" M tracked\.txt", dir\.\.\./
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

test("statusCommand prioritizes unread mail over wait in the all-session follow-up signal", async () => {
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
  await createSession(repoDir, {
    id: "session-wait",
    agentName: "agent-wait",
    branch: "agents/agent-wait",
    worktreePath: join(repoDir, ".switchyard", "worktrees", "agent-wait"),
    state: "running",
    runtimePid: 2424,
    createdAt: "2026-03-08T11:09:00.000Z",
    updatedAt: "2026-03-08T11:09:00.000Z"
  });
  await createMail(repoDir, {
    sessionId: "session-unread",
    sender: "agent-unread",
    recipient: "operator",
    body: "Unread one",
    createdAt: "2026-03-08T11:11:00.000Z"
  });
  await createMail(repoDir, {
    sessionId: "session-unread",
    sender: "agent-unread",
    recipient: "operator",
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
    createdAt: "2026-03-08T11:11:30.000Z"
  });
  await createEvent(repoDir, {
    sessionId: "session-wait",
    agentName: "agent-wait",
    eventType: "runtime.ready",
    payload: {
      signal: "pid_alive",
      runtimePid: 2424
    },
    createdAt: "2026-03-08T11:12:30.000Z"
  });

  process.stdout.write = ((chunk: string | Uint8Array) => {
    writes.push(typeof chunk === "string" ? chunk : chunk.toString());
    return true;
  }) as typeof process.stdout.write;

  try {
    await statusCommand({
      startDir: repoDir,
      isRuntimeAlive: (pid) => pid === 2323 || pid === 2424,
      now: () => "2026-03-08T11:20:00.000Z"
    });
  } finally {
    process.stdout.write = originalWrite;
    await removeTempDir(repoDir);
  }

  assert.match(
    writes.join(""),
    /running\tsession-unread\tagent-unread\tagents\/agent-unread\t\.switchyard\/worktrees\/agent-unread\t2026-03-08T11:12:00.000Z\t2\t[^\t]+\t-\t-\tmail\t2026-03-08T11:12:00.000Z mail\.unread unreadCount=2, sender=agent-unread, bodyPreview="Unread two"/
  );
  assert.match(
    writes.join(""),
    /running\tsession-wait\tagent-wait\tagents\/agent-wait\t\.switchyard\/worktrees\/agent-wait\t2026-03-08T11:12:30.000Z\t0\t[^\t]+\t-\t-\twait\t2026-03-08T11:12:30.000Z runtime\.ready signal=pid_alive, runtimePid=2424/
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
    /stopped\tsession-mail-view\tagent-mail-view\tagents\/agent-mail-view\t\.switchyard\/worktrees\/agent-mail-view\t2026-03-08T11:31:00.000Z\t0\t[^\t]+\t-\t-\t[^\t]+\t2026-03-08T11:31:00.000Z mail\.listed view=unread_only, messageCount=2, unreadCount=2/
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
    /stopped\tsession-read-mail\tagent-read-mail\tagents\/agent-read-mail\t\.switchyard\/worktrees\/agent-read-mail\t2026-03-08T11:40:00.000Z\t0\t[^\t]+\t-\t-\t[^\t]+\t-/
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
    /stopped\tsession-unknown\tagent-unknown\tagents\/agent-unknown\t\.switchyard\/worktrees\/agent-unknown\t2026-03-08T09:10:00.000Z\t0\t[^\t]+\t-\t-\t[^\t]+\t2026-03-08T09:10:00.000Z runtime\.note/
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
    /failed\tagent-stale\tagent-stale\tagents\/agent-stale\t\.switchyard\/worktrees\/agent-stale\t2026-03-08T09:45:00.000Z\t0\t[^\t]+\t-\t-\tinspect\t2026-03-08T09:45:00.000Z runtime\.exited reason=pid_not_alive, runtimePid=9090/
  );
});

test("statusCommand reports zombie runtimes as failed stale sessions", async () => {
  const repoDir = await createInitializedRepo();
  const writes: string[] = [];
  const originalWrite = process.stdout.write.bind(process.stdout);

  await createSession(repoDir, {
    id: "agent-zombie",
    agentName: "agent-zombie",
    branch: "agents/agent-zombie",
    worktreePath: join(repoDir, ".switchyard", "worktrees", "agent-zombie"),
    state: "running",
    runtimePid: 9191,
    createdAt: "2026-03-06T09:00:00.000Z",
    updatedAt: "2026-03-06T10:00:00.000Z"
  });
  await createEvent(repoDir, {
    sessionId: "agent-zombie",
    agentName: "agent-zombie",
    eventType: "sling.completed",
    payload: {
      runtimePid: 9191,
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
      inspectRuntimeLiveness: () => ({
        alive: false,
        reason: "process_state_zombie"
      }),
      now: () => "2026-03-08T09:46:00.000Z"
    });

    const sessions = await listSessions(repoDir);
    assert.equal(sessions[0]?.state, "failed");
    assert.equal(sessions[0]?.runtimePid, null);
    const events = await listEvents(repoDir, { sessionId: "agent-zombie" });
    assert.equal(events.length, 2);
    assert.equal(events[1]?.eventType, "runtime.exited");
    assert.equal(events[1]?.payload.reason, "process_state_zombie");
  } finally {
    process.stdout.write = originalWrite;
    await removeTempDir(repoDir);
  }

  const output = writes.join("");
  assert.match(
    output,
    /failed\tagent-zombie\tagent-zombie\tagents\/agent-zombie\t\.switchyard\/worktrees\/agent-zombie\t2026-03-08T09:46:00.000Z\t0\t[^\t]+\t-\t-\tinspect\t2026-03-08T09:46:00.000Z runtime\.exited reason=process_state_zombie, runtimePid=9191/
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
  await createMail(repoDir, {
    sessionId: "agent-mail-broken",
    sender: "agent-mail-broken",
    recipient: "operator",
    body: "Unread mail should not leak into degraded output.",
    createdAt: "2026-03-06T09:45:00.000Z"
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
      },
      listUnreadOperatorMailCounts: async () => {
        return new Map([["agent-mail-broken", 1]]);
      },
      listLatestUnreadOperatorMail: async () => {
        return new Map([[
          "agent-mail-broken",
          {
            unreadCount: 1,
            message: {
              id: "mail-broken-1",
              sessionId: "agent-mail-broken",
              sender: "agent-mail-broken",
              recipient: "operator",
              body: "Unread mail should not leak into degraded output.",
              createdAt: "2026-03-06T09:45:00.000Z",
              readAt: null
            }
          }
        ]]);
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
    /failed\tagent-mail-broken\tagent-mail-broken\tagents\/agent-mail-broken\t\.switchyard\/worktrees\/agent-mail-broken\t2026-03-08T10:05:00.000Z\t\?\t[^\t]+\t-\t-\tinspect\t2026-03-08T10:05:00.000Z runtime\.exited reason=pid_not_alive, runtimePid=9191/
  );
  assert.doesNotMatch(stdoutWrites.join(""), /mail\.unread/);
  assert.match(stderrWrites.join(""), /WARN: failed to load unread mail counts: mail unavailable/);
});

test("statusCommand selected-session header follows the same degraded unread-mail rule as the table", async () => {
  const repoDir = await createInitializedRepo();
  const stdoutWrites: string[] = [];
  const stderrWrites: string[] = [];
  const originalStdoutWrite = process.stdout.write.bind(process.stdout);
  const originalStderrWrite = process.stderr.write.bind(process.stderr);

  await createSession(repoDir, {
    id: "session-selected-mail-degraded",
    agentName: "agent-selected-mail-degraded",
    branch: "agents/agent-selected-mail-degraded",
    worktreePath: join(repoDir, ".switchyard", "worktrees", "agent-selected-mail-degraded"),
    state: "running",
    runtimePid: 9292,
    createdAt: "2026-03-09T12:10:00.000Z",
    updatedAt: "2026-03-09T12:10:00.000Z"
  });
  await createEvent(repoDir, {
    sessionId: "session-selected-mail-degraded",
    agentName: "agent-selected-mail-degraded",
    eventType: "runtime.ready",
    payload: {
      signal: "pid_alive",
      runtimePid: 9292
    },
    createdAt: "2026-03-09T12:10:30.000Z"
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
      selector: "session-selected-mail-degraded",
      isRuntimeAlive: (pid) => pid === 9292,
      now: () => "2026-03-09T12:25:00.000Z",
      listUnreadMailCounts: async () => {
        throw new Error("mail unavailable");
      },
      listUnreadOperatorMailCounts: async () => {
        return new Map([["session-selected-mail-degraded", 1]]);
      }
    });
  } finally {
    process.stdout.write = originalStdoutWrite;
    process.stderr.write = originalStderrWrite;
    await removeTempDir(repoDir);
  }

  const output = stdoutWrites.join("");
  assert.match(output, /Unread: \?/);
  assert.match(output, /Next: wait/);
  assert.match(
    output,
    /running\tsession-selected-mail-degraded\tagent-selected-mail-degraded\tagents\/agent-selected-mail-degraded\t\.switchyard\/worktrees\/agent-selected-mail-degraded\t2026-03-09T12:10:30.000Z\t\?\t[^\t]+\t-\t-\twait\t2026-03-09T12:10:30.000Z runtime\.ready signal=pid_alive, runtimePid=9292/
  );
  assert.match(stderrWrites.join(""), /WARN: failed to load unread mail counts: mail unavailable/);
});

test("statusCommand keeps rendering when run persistence fails during lifecycle reconciliation", async () => {
  const repoDir = await createInitializedRepo();
  const stdoutWrites: string[] = [];
  const stderrWrites: string[] = [];
  const originalStdoutWrite = process.stdout.write.bind(process.stdout);
  const originalStderrWrite = process.stderr.write.bind(process.stderr);

  await createSession(repoDir, {
    id: "session-run-broken",
    agentName: "agent-run-broken",
    branch: "agents/agent-run-broken",
    worktreePath: join(repoDir, ".switchyard", "worktrees", "agent-run-broken"),
    state: "running",
    runtimePid: 8181,
    createdAt: "2026-03-06T09:00:00.000Z",
    updatedAt: "2026-03-06T10:00:00.000Z"
  });
  await createRun(repoDir, {
    id: "run-broken",
    sessionId: "session-run-broken",
    agentName: "agent-run-broken",
    taskSummary: "Inspect the failed runtime.",
    taskSpecPath: ".switchyard/specs/agent-run-broken-session-run-broken.md",
    state: "active",
    createdAt: "2026-03-06T09:00:00.000Z",
    updatedAt: "2026-03-06T10:00:00.000Z"
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
      updateLatestRun: async () => {
        throw new Error("runs unavailable");
      },
      listLatestRuns: async () => {
        throw new Error("runs unavailable");
      }
    });

    const sessions = await listSessions(repoDir);
    assert.equal(sessions[0]?.state, "failed");
    assert.equal(sessions[0]?.runtimePid, null);

    const events = await listEvents(repoDir, { sessionId: "session-run-broken" });
    assert.equal(events.length, 1);
    assert.equal(events[0]?.eventType, "runtime.exited");
    assert.equal(events[0]?.payload.reason, "pid_not_alive");
  } finally {
    process.stdout.write = originalStdoutWrite;
    process.stderr.write = originalStderrWrite;
    await removeTempDir(repoDir);
  }

  assert.match(
    stdoutWrites.join(""),
    /failed\tsession-run-broken\tagent-run-broken\tagents\/agent-run-broken\t\.switchyard\/worktrees\/agent-run-broken\t2026-03-08T10:05:00.000Z\t0\t[^\t]+\t\?\t\?\t[^\t]+\t2026-03-08T10:05:00.000Z runtime\.exited reason=pid_not_alive, runtimePid=8181/
  );
  assert.match(stderrWrites.join(""), /WARN: failed to persist run state for session 'session-run-broken': runs unavailable/);
  assert.match(stderrWrites.join(""), /WARN: failed to load latest runs: runs unavailable/);
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
    /stopped\tsession-cleanup-broken\tagent-cleanup-broken\tagents\/cleanup-broken\t\.switchyard\/worktrees\/agent-cleanup-broken\t2026-03-08T10:10:00.000Z\t0\t\?\t-\t-\t-\t-/
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
    /failed\tagent-event-fail\tagent-event-fail\tagents\/agent-event-fail\t\.switchyard\/worktrees\/agent-event-fail\t2026-03-08T10:00:00.000Z\t0\t[^\t]+\t-\t-\tinspect\t2026-03-08T10:00:00.000Z runtime\.exited reason=pid_not_alive, runtimePid=9090/
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
    /failed\tagent-booting\tagent-booting\tagents\/agent-booting\t\.switchyard\/worktrees\/agent-booting\t2026-03-08T09:50:00.000Z\t0\t[^\t]+\t-\t-\tinspect\t2026-03-08T09:50:00.000Z runtime\.exited_early reason=pid_not_alive, runtimePid=8080/
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
    /failed\tagent-legacy\tagent-legacy\tagents\/agent-legacy\t\.switchyard\/worktrees\/agent-legacy\t2026-03-08T09:55:00.000Z\t0\t[^\t]+\t-\t-\tinspect\t2026-03-08T09:55:00.000Z runtime\.exited reason=missing_runtime_pid/
  );
});

async function createInitializedRepo(): Promise<string> {
  const repoDir = await createTempGitRepo("switchyard-status-command-test-");
  await bootstrapSwitchyardLayout(repoDir);
  await writeConfig(buildDefaultConfig(repoDir, "switchyard-test", "main"));
  return repoDir;
}

async function createTrackedStatusSession(
  repoDir: string,
  options: {
    id: string;
    agentName: string;
    runtimePid: number;
    createdAt: string;
    runtimeReadyAt?: string;
    updatedAt: string;
  }
): Promise<string> {
  const worktreePath = join(repoDir, ".switchyard", "worktrees", options.agentName);
  const branch = `agents/${options.agentName}`;

  await git(repoDir, ["worktree", "add", "-b", branch, worktreePath, "main"]);
  await createSession(repoDir, {
    id: options.id,
    agentName: options.agentName,
    branch,
    baseBranch: "main",
    worktreePath,
    state: "running",
    runtimePid: options.runtimePid,
    createdAt: options.createdAt,
    updatedAt: options.updatedAt
  });
  await createEvent(repoDir, {
    sessionId: options.id,
    agentName: options.agentName,
    eventType: "runtime.ready",
    payload: {
      signal: "pid_alive",
      runtimePid: options.runtimePid
    },
    createdAt: options.runtimeReadyAt ?? options.createdAt
  });

  return worktreePath;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
