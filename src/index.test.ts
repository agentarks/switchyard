import test from "node:test";
import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { buildDefaultConfig, writeConfig } from "./config.js";
import { listEvents } from "./events/store.js";
import { createMail, listMailForSession, readUnreadMailForSession } from "./mail/store.js";
import { createRun } from "./runs/store.js";
import { createSession, getSessionById } from "./sessions/store.js";
import { bootstrapSwitchyardLayout } from "./storage/bootstrap.js";
import { createTempGitRepo, git, removeTempDir } from "./test-helpers/git.js";

const execFileAsync = promisify(execFile);
const tsxCliPath = fileURLToPath(new URL("../node_modules/tsx/dist/cli.mjs", import.meta.url));
const cliEntryPath = fileURLToPath(new URL("./index.ts", import.meta.url));

test("sy stop --cleanup --abandon removes preserved artifacts through the real CLI entrypoint", async () => {
  const repoDir = await createInitializedRepo("switchyard-cli-stop-test-");
  const worktreePath = join(repoDir, ".switchyard", "worktrees", "agent-cli-stop");
  const runtime = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
    detached: true,
    stdio: "ignore"
  });
  runtime.unref();

  try {
    assert.ok(runtime.pid);
    await git(repoDir, ["branch", "agents/agent-cli-stop"]);
    await git(repoDir, ["worktree", "add", worktreePath, "agents/agent-cli-stop"]);

    await createSession(repoDir, {
      id: "session-cli-stop",
      agentName: "agent-cli-stop",
      branch: "agents/agent-cli-stop",
      baseBranch: "main",
      worktreePath,
      state: "running",
      runtimePid: runtime.pid,
      createdAt: "2026-03-10T09:00:00.000Z",
      updatedAt: "2026-03-10T09:00:00.000Z"
    });

    const { stdout, stderr } = await execFileAsync(
      process.execPath,
      [tsxCliPath, cliEntryPath, "stop", "session-cli-stop", "--cleanup", "--abandon"],
      { cwd: repoDir }
    );

    assert.equal(stderr, "");
    assert.match(stdout, /Stopped agent-cli-stop/);
    assert.match(stdout, /Session: session-cli-stop/);
    assert.match(stdout, /Cleanup: removed worktree and branch after explicit abandon\./);

    const session = await getSessionById(repoDir, "session-cli-stop");
    assert.equal(session?.state, "stopped");
    assert.equal(session?.runtimePid, null);
    await assert.rejects(() => access(worktreePath));
    await assert.rejects(() => git(repoDir, ["rev-parse", "--verify", "agents/agent-cli-stop"]));

    const events = await listEvents(repoDir, { sessionId: "session-cli-stop" });
    assert.equal(events.at(-1)?.eventType, "stop.completed");
    assert.equal(events.at(-1)?.payload.cleanupMode, "abandoned");
  } finally {
    if (runtime.pid) {
      stopChildIfAlive(runtime.pid);
    }
    await removeTempDir(repoDir);
  }
});

test("sy stop reports the stopped session before surfacing a cleanup removal failure", async () => {
  const repoDir = await createInitializedRepo("switchyard-cli-stop-cleanup-failure-test-");
  const worktreePath = join(repoDir, ".switchyard", "worktrees", "agent-cli-cleanup-failure");
  const runtime = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
    detached: true,
    stdio: "ignore"
  });
  runtime.unref();

  try {
    assert.ok(runtime.pid);
    await git(repoDir, ["branch", "agents/agent-cli-cleanup-failure"]);
    await mkdir(worktreePath, { recursive: true });

    await createSession(repoDir, {
      id: "session-cli-cleanup-failure",
      agentName: "agent-cli-cleanup-failure",
      branch: "agents/agent-cli-cleanup-failure",
      baseBranch: "main",
      worktreePath,
      state: "running",
      runtimePid: runtime.pid,
      createdAt: "2026-03-10T09:30:00.000Z",
      updatedAt: "2026-03-10T09:30:00.000Z"
    });

    await assert.rejects(
      () => execFileAsync(
        process.execPath,
        [tsxCliPath, cliEntryPath, "stop", "session-cli-cleanup-failure", "--cleanup"],
        { cwd: repoDir }
      ),
      (error: unknown) => {
        assert.ok(error && typeof error === "object" && "stdout" in error && "stderr" in error);
        const cliError = error as { stdout: string; stderr: string; code: number };
        assert.equal(cliError.code, 1);
        assert.match(cliError.stdout, /Stopped agent-cli-cleanup-failure/);
        assert.match(cliError.stdout, /Session: session-cli-cleanup-failure/);
        assert.match(cliError.stdout, /Cleanup failed after stop: Cleanup failed for agent-cli-cleanup-failure:/);
        assert.match(cliError.stderr, /STOP_ERROR: Cleanup failed for agent-cli-cleanup-failure:/);
        return true;
      }
    );

    const session = await getSessionById(repoDir, "session-cli-cleanup-failure");
    assert.equal(session?.state, "stopped");
    assert.equal(session?.runtimePid, null);

    const events = await listEvents(repoDir, { sessionId: "session-cli-cleanup-failure" });
    assert.equal(events.at(-1)?.eventType, "stop.completed");
    assert.equal(events.at(-1)?.payload.cleanupReason, "cleanup_failed");
  } finally {
    if (runtime.pid) {
      stopChildIfAlive(runtime.pid);
    }
    await removeTempDir(repoDir);
  }
});

test("sy stop reports the resolved session id before the repeated-stop failure output", async () => {
  const repoDir = await createInitializedRepo("switchyard-cli-stop-already-inactive-test-");

  try {
    await createSession(repoDir, {
      id: "session-cli-already-stopped",
      agentName: "agent-cli-already-stopped",
      branch: "agents/agent-cli-already-stopped",
      baseBranch: "main",
      worktreePath: join(repoDir, ".switchyard", "worktrees", "agent-cli-already-stopped"),
      state: "stopped",
      runtimePid: null,
      createdAt: "2026-03-10T09:35:00.000Z",
      updatedAt: "2026-03-10T09:35:00.000Z"
    });

    await assert.rejects(
      () => execFileAsync(process.execPath, [tsxCliPath, cliEntryPath, "stop", "agent cli already stopped"], {
        cwd: repoDir
      }),
      (error: unknown) => {
        assert.ok(error && typeof error === "object" && "stdout" in error && "stderr" in error);
        const cliError = error as { stdout: string; stderr: string; code: number };
        assert.equal(cliError.code, 1);
        assert.equal(cliError.stdout, "");
        assert.match(
          cliError.stderr,
          /^Session: session-cli-already-stopped\nSTOP_ERROR: Session 'agent cli already stopped' is already stopped\.\n$/
        );
        return true;
      }
    );
  } finally {
    await removeTempDir(repoDir);
  }
});

test("sy merge merges a preserved branch through the real CLI entrypoint", async () => {
  const repoDir = await createInitializedRepo("switchyard-cli-merge-test-");
  const notesPath = join(repoDir, "notes.txt");
  const worktreePath = join(repoDir, ".switchyard", "worktrees", "agent-cli-merge");

  try {
    await git(repoDir, ["config", "user.name", "Switchyard Test"]);
    await git(repoDir, ["config", "user.email", "switchyard@example.com"]);
    await git(repoDir, ["switch", "-c", "agents/agent-cli-merge"]);
    await git(repoDir, ["commit", "--allow-empty", "-m", "Agent branch start"]);
    await git(repoDir, ["switch", "main"]);
    await git(repoDir, ["switch", "--detach"]);
    await git(repoDir, ["worktree", "add", worktreePath, "agents/agent-cli-merge"]);

    await writeFileFromGitWorktree(worktreePath, notesPath, "agent change\n");

    await createSession(repoDir, {
      id: "session-cli-merge",
      agentName: "agent-cli-merge",
      branch: "agents/agent-cli-merge",
      baseBranch: "main",
      worktreePath,
      state: "stopped",
      runtimePid: null,
      createdAt: "2026-03-10T10:00:00.000Z",
      updatedAt: "2026-03-10T10:05:00.000Z"
    });

    const { stdout, stderr } = await execFileAsync(process.execPath, [tsxCliPath, cliEntryPath, "merge", "session-cli-merge"], {
      cwd: repoDir
    });

    assert.equal(stderr, "");
    assert.match(stdout, /Merged agent-cli-merge into main/);
    assert.match(stdout, /Session: session-cli-merge/);
    assert.match(stdout, /Branch: agents\/agent-cli-merge/);
    assert.match(stdout, /sy stop session-cli-merge --cleanup/);
    assert.equal(await git(repoDir, ["branch", "--show-current"]), "main");
    assert.equal(await readFile(notesPath, "utf8"), "agent change\n");

    const events = await listEvents(repoDir, { sessionId: "session-cli-merge" });
    assert.equal(events.at(-1)?.eventType, "merge.completed");
  } finally {
    await removeTempDir(repoDir);
  }
});

test("sy merge reports the resolved session id when a preserved merge stops with conflicts", async () => {
  const repoDir = await createInitializedRepo("switchyard-cli-merge-conflict-test-");
  const conflictPath = join(repoDir, "conflict.txt");
  const worktreePath = join(repoDir, ".switchyard", "worktrees", "agent-cli-conflict");

  try {
    await writeFile(conflictPath, "shared\n", "utf8");
    await git(repoDir, ["add", "conflict.txt"]);
    await git(repoDir, ["commit", "-m", "Add merge conflict base"]);
    await git(repoDir, ["switch", "-c", "agents/agent-cli-conflict"]);
    await writeFile(conflictPath, "agent version\n", "utf8");
    await git(repoDir, ["add", "conflict.txt"]);
    await git(repoDir, ["commit", "-m", "Agent merge conflict change"]);
    await git(repoDir, ["switch", "main"]);
    await writeFile(conflictPath, "main version\n", "utf8");
    await git(repoDir, ["add", "conflict.txt"]);
    await git(repoDir, ["commit", "-m", "Main merge conflict change"]);
    await git(repoDir, ["worktree", "add", worktreePath, "agents/agent-cli-conflict"]);

    await createSession(repoDir, {
      id: "session-cli-conflict",
      agentName: "agent-cli-conflict",
      branch: "agents/agent-cli-conflict",
      baseBranch: "main",
      worktreePath,
      state: "stopped",
      runtimePid: null,
      createdAt: "2026-03-10T10:10:00.000Z",
      updatedAt: "2026-03-10T10:15:00.000Z"
    });

    await assert.rejects(
      () => execFileAsync(process.execPath, [tsxCliPath, cliEntryPath, "merge", "agent-cli-conflict"], {
        cwd: repoDir
      }),
      (error: unknown) => {
        assert.ok(error && typeof error === "object" && "stdout" in error && "stderr" in error);
        const cliError = error as { stdout: string; stderr: string; code: number };
        assert.equal(cliError.code, 1);
        assert.equal(cliError.stdout, "");
        assert.match(cliError.stderr, /Session: session-cli-conflict/);
        assert.match(
          cliError.stderr,
          /MERGE_ERROR: Merge stopped with conflicts between 'main' and 'agents\/agent-cli-conflict'\. Conflicting paths: conflict\.txt\./
        );
        return true;
      }
    );

    const events = await listEvents(repoDir, { sessionId: "session-cli-conflict" });
    assert.equal(events.at(-1)?.eventType, "merge.failed");
    assert.equal(events.at(-1)?.payload.reason, "merge_conflict");
  } finally {
    await removeTempDir(repoDir);
  }
});

test("sy status shows next follow-up actions for concurrent sessions through the real CLI entrypoint", async () => {
  const repoDir = await createInitializedRepo("switchyard-cli-status-next-test-");
  const activeWorktreePath = join(repoDir, ".switchyard", "worktrees", "agent-cli-active");
  const reviewWorktreePath = join(repoDir, ".switchyard", "worktrees", "agent-cli-review");
  const freshActiveAt = new Date(Date.now() - 5 * 60_000).toISOString();
  const runtime = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
    detached: true,
    stdio: "ignore"
  });
  runtime.unref();

  try {
    assert.ok(runtime.pid);
    await git(repoDir, ["branch", "agents/agent-cli-active"]);
    await git(repoDir, ["switch", "-c", "agents/agent-cli-review"]);
    await git(repoDir, ["commit", "--allow-empty", "-m", "Review branch work"]);
    await git(repoDir, ["switch", "main"]);
    await mkdir(activeWorktreePath, { recursive: true });
    await mkdir(reviewWorktreePath, { recursive: true });

    await createSession(repoDir, {
      id: "session-cli-active",
      agentName: "agent-cli-active",
      branch: "agents/agent-cli-active",
      baseBranch: "main",
      worktreePath: activeWorktreePath,
      state: "running",
      runtimePid: runtime.pid,
      createdAt: freshActiveAt,
      updatedAt: freshActiveAt
    });
    await createSession(repoDir, {
      id: "session-cli-review",
      agentName: "agent-cli-review",
      branch: "agents/agent-cli-review",
      baseBranch: "main",
      worktreePath: reviewWorktreePath,
      state: "stopped",
      runtimePid: null,
      createdAt: "2026-03-10T10:25:00.000Z",
      updatedAt: "2026-03-10T10:25:00.000Z"
    });

    await createRun(repoDir, {
      id: "run-cli-active",
      sessionId: "session-cli-active",
      agentName: "agent-cli-active",
      taskSummary: "Keep working on the live branch.",
      state: "active",
      createdAt: freshActiveAt,
      updatedAt: freshActiveAt
    });
    await createRun(repoDir, {
      id: "run-cli-review",
      sessionId: "session-cli-review",
      agentName: "agent-cli-review",
      taskSummary: "Review the preserved branch before merge.",
      state: "finished",
      outcome: "stopped",
      createdAt: "2026-03-10T10:25:00.000Z",
      updatedAt: "2026-03-10T10:25:00.000Z",
      finishedAt: "2026-03-10T10:25:00.000Z"
    });

    const { stdout, stderr } = await execFileAsync(process.execPath, [tsxCliPath, cliEntryPath, "status"], {
      cwd: repoDir
    });

    assert.equal(stderr, "");
    assert.match(stdout, /STATE\tSESSION\tAGENT\tBRANCH\tWORKTREE\tUPDATED\tUNREAD\tCLEANUP\tTASK\tRUN\tNEXT\tRECENT/);
    assert.match(stdout, /running\tsession-cli-active\tagent-cli-active[^\n]*\tactive\twait\t-/);
    assert.match(stdout, /stopped\tsession-cli-review\tagent-cli-review[^\n]*\tfinished:stopped\treview-merge\t-/);
  } finally {
    if (runtime.pid) {
      stopChildIfAlive(runtime.pid);
    }
    await removeTempDir(repoDir);
  }
});

test("sy status orders actionable concurrent sessions ahead of newer wait-only rows", async () => {
  const repoDir = await createInitializedRepo("switchyard-cli-status-order-test-");
  const activeWorktreePath = join(repoDir, ".switchyard", "worktrees", "agent-cli-order-wait");
  const mailWorktreePath = join(repoDir, ".switchyard", "worktrees", "agent-cli-order-mail");
  const freshActiveAt = new Date(Date.now() - 5 * 60_000).toISOString();
  const runtime = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
    detached: true,
    stdio: "ignore"
  });
  runtime.unref();

  try {
    assert.ok(runtime.pid);
    await git(repoDir, ["branch", "agents/agent-cli-order-wait"]);
    await git(repoDir, ["branch", "agents/agent-cli-order-mail"]);
    await mkdir(activeWorktreePath, { recursive: true });
    await mkdir(mailWorktreePath, { recursive: true });

    await createSession(repoDir, {
      id: "session-cli-order-wait",
      agentName: "agent-cli-order-wait",
      branch: "agents/agent-cli-order-wait",
      baseBranch: "main",
      worktreePath: activeWorktreePath,
      state: "running",
      runtimePid: runtime.pid,
      createdAt: freshActiveAt,
      updatedAt: freshActiveAt
    });
    await createSession(repoDir, {
      id: "session-cli-order-mail",
      agentName: "agent-cli-order-mail",
      branch: "agents/agent-cli-order-mail",
      baseBranch: "main",
      worktreePath: mailWorktreePath,
      state: "stopped",
      runtimePid: null,
      createdAt: "2026-03-10T10:00:00.000Z",
      updatedAt: "2026-03-10T10:00:00.000Z"
    });

    await createRun(repoDir, {
      id: "run-cli-order-wait",
      sessionId: "session-cli-order-wait",
      agentName: "agent-cli-order-wait",
      taskSummary: "Keep processing the active branch.",
      state: "active",
      createdAt: freshActiveAt,
      updatedAt: freshActiveAt
    });
    await createRun(repoDir, {
      id: "run-cli-order-mail",
      sessionId: "session-cli-order-mail",
      agentName: "agent-cli-order-mail",
      taskSummary: "Send the merge-risk follow-up.",
      state: "finished",
      outcome: "stopped",
      createdAt: "2026-03-10T10:00:00.000Z",
      updatedAt: "2026-03-10T10:00:00.000Z",
      finishedAt: "2026-03-10T10:00:00.000Z"
    });
    await createMail(repoDir, {
      sessionId: "session-cli-order-mail",
      sender: "agent-cli-order-mail",
      recipient: "operator",
      body: "Need your merge decision.",
      createdAt: "2026-03-10T10:05:00.000Z"
    });

    const { stdout, stderr } = await execFileAsync(process.execPath, [tsxCliPath, cliEntryPath, "status"], {
      cwd: repoDir
    });

    assert.equal(stderr, "");
    assert.match(
      stdout,
      /stopped\tsession-cli-order-mail\tagent-cli-order-mail[^\n]*\tmail\t2026-03-10T10:05:00.000Z mail\.unread unreadCount=1, sender=agent-cli-order-mail, bodyPreview="Need your merge decision\."/
    );
    assert.match(stdout, /running\tsession-cli-order-wait\tagent-cli-order-wait[^\n]*\twait\t-/);
    assert.ok(stdout.indexOf("session-cli-order-mail") < stdout.indexOf("session-cli-order-wait"));
  } finally {
    if (runtime.pid) {
      stopChildIfAlive(runtime.pid);
    }
    await removeTempDir(repoDir);
  }
});

test("sy status orders mail rows by latest unread inbound mail through the real CLI entrypoint", async () => {
  const repoDir = await createInitializedRepo("switchyard-cli-status-mail-order-test-");
  const firstWorktreePath = join(repoDir, ".switchyard", "worktrees", "agent-cli-first-mail");
  const secondWorktreePath = join(repoDir, ".switchyard", "worktrees", "agent-cli-second-mail");

  try {
    await git(repoDir, ["branch", "agents/agent-cli-first-mail"]);
    await git(repoDir, ["branch", "agents/agent-cli-second-mail"]);
    await mkdir(firstWorktreePath, { recursive: true });
    await mkdir(secondWorktreePath, { recursive: true });

    await createSession(repoDir, {
      id: "session-cli-first-mail",
      agentName: "agent-cli-first-mail",
      branch: "agents/agent-cli-first-mail",
      baseBranch: "main",
      worktreePath: firstWorktreePath,
      state: "stopped",
      runtimePid: null,
      createdAt: "2026-03-10T11:00:00.000Z",
      updatedAt: "2026-03-10T11:00:00.000Z"
    });
    await createSession(repoDir, {
      id: "session-cli-second-mail",
      agentName: "agent-cli-second-mail",
      branch: "agents/agent-cli-second-mail",
      baseBranch: "main",
      worktreePath: secondWorktreePath,
      state: "stopped",
      runtimePid: null,
      createdAt: "2026-03-10T10:00:00.000Z",
      updatedAt: "2026-03-10T12:00:00.000Z"
    });

    await createMail(repoDir, {
      sessionId: "session-cli-first-mail",
      sender: "agent-cli-first-mail",
      recipient: "operator",
      body: "Newest unread mail.",
      createdAt: "2026-03-10T12:30:00.000Z"
    });
    await createMail(repoDir, {
      sessionId: "session-cli-second-mail",
      sender: "agent-cli-second-mail",
      recipient: "operator",
      body: "Older unread mail.",
      createdAt: "2026-03-10T12:15:00.000Z"
    });

    const { stdout, stderr } = await execFileAsync(process.execPath, [tsxCliPath, cliEntryPath, "status"], {
      cwd: repoDir
    });

    assert.equal(stderr, "");
    assert.match(
      stdout,
      /stopped\tsession-cli-first-mail\tagent-cli-first-mail[^\n]*\tmail\t2026-03-10T12:30:00.000Z mail\.unread unreadCount=1, sender=agent-cli-first-mail, bodyPreview="Newest unread mail\."/
    );
    assert.match(
      stdout,
      /stopped\tsession-cli-second-mail\tagent-cli-second-mail[^\n]*\tmail\t2026-03-10T12:15:00.000Z mail\.unread unreadCount=1, sender=agent-cli-second-mail, bodyPreview="Older unread mail\."/
    );
    assert.ok(stdout.indexOf("session-cli-first-mail") < stdout.indexOf("session-cli-second-mail"));
  } finally {
    await removeTempDir(repoDir);
  }
});

test("sy supports a two-session operator workflow through mail review, merge, and cleanup without losing concurrent state", async () => {
  const repoDir = await createInitializedRepo("switchyard-cli-concurrent-workflow-test-");
  const mailWorktreePath = join(repoDir, ".switchyard", "worktrees", "agent-cli-mail-flow");
  const mergeWorktreePath = join(repoDir, ".switchyard", "worktrees", "agent-cli-merge-flow");
  const mergeNotesPath = join(repoDir, "merge-flow.txt");

  try {
    await git(repoDir, ["config", "user.name", "Switchyard Test"]);
    await git(repoDir, ["config", "user.email", "switchyard@example.com"]);

    await git(repoDir, ["switch", "-c", "agents/agent-cli-mail-flow"]);
    await git(repoDir, ["commit", "--allow-empty", "-m", "Mail flow branch work"]);
    await git(repoDir, ["switch", "main"]);
    await mkdir(mailWorktreePath, { recursive: true });

    await git(repoDir, ["switch", "-c", "agents/agent-cli-merge-flow"]);
    await git(repoDir, ["commit", "--allow-empty", "-m", "Merge flow branch start"]);
    await git(repoDir, ["switch", "main"]);
    await git(repoDir, ["switch", "--detach"]);
    await git(repoDir, ["worktree", "add", mergeWorktreePath, "agents/agent-cli-merge-flow"]);
    await writeFile(join(mergeWorktreePath, "merge-flow.txt"), "merge candidate\n", "utf8");
    await git(mergeWorktreePath, ["add", "merge-flow.txt"]);
    await git(mergeWorktreePath, ["commit", "-m", "Add merge flow notes"]);

    await createSession(repoDir, {
      id: "session-cli-mail-flow",
      agentName: "agent-cli-mail-flow",
      branch: "agents/agent-cli-mail-flow",
      baseBranch: "main",
      worktreePath: mailWorktreePath,
      state: "stopped",
      runtimePid: null,
      createdAt: "2026-03-10T13:00:00.000Z",
      updatedAt: "2026-03-10T13:00:00.000Z"
    });
    await createSession(repoDir, {
      id: "session-cli-merge-flow",
      agentName: "agent-cli-merge-flow",
      branch: "agents/agent-cli-merge-flow",
      baseBranch: "main",
      worktreePath: mergeWorktreePath,
      state: "stopped",
      runtimePid: null,
      createdAt: "2026-03-10T13:05:00.000Z",
      updatedAt: "2026-03-10T13:05:00.000Z"
    });

    await createRun(repoDir, {
      id: "run-cli-mail-flow",
      sessionId: "session-cli-mail-flow",
      agentName: "agent-cli-mail-flow",
      taskSummary: "Review the preserved branch after the agent reply.",
      state: "finished",
      outcome: "stopped",
      createdAt: "2026-03-10T13:00:00.000Z",
      updatedAt: "2026-03-10T13:00:00.000Z",
      finishedAt: "2026-03-10T13:00:00.000Z"
    });
    await createRun(repoDir, {
      id: "run-cli-merge-flow",
      sessionId: "session-cli-merge-flow",
      agentName: "agent-cli-merge-flow",
      taskSummary: "Prepare the preserved branch for reintegration.",
      state: "finished",
      outcome: "stopped",
      createdAt: "2026-03-10T13:05:00.000Z",
      updatedAt: "2026-03-10T13:05:00.000Z",
      finishedAt: "2026-03-10T13:05:00.000Z"
    });
    await createMail(repoDir, {
      sessionId: "session-cli-mail-flow",
      sender: "agent-cli-mail-flow",
      recipient: "operator",
      body: "Need merge decision.",
      createdAt: "2026-03-10T13:10:00.000Z"
    });

    const initialStatus = await execFileAsync(process.execPath, [tsxCliPath, cliEntryPath, "status"], {
      cwd: repoDir
    });
    assert.equal(initialStatus.stderr, "");
    assert.match(
      initialStatus.stdout,
      /stopped\tsession-cli-mail-flow\tagent-cli-mail-flow[^\n]*\tfinished:stopped\tmail\t2026-03-10T13:10:00.000Z mail\.unread unreadCount=1, sender=agent-cli-mail-flow, bodyPreview="Need merge decision\."/
    );
    assert.match(
      initialStatus.stdout,
      /stopped\tsession-cli-merge-flow\tagent-cli-merge-flow[^\n]*\tfinished:stopped\treview-merge\t-/
    );
    assert.ok(
      initialStatus.stdout.indexOf("session-cli-mail-flow") < initialStatus.stdout.indexOf("session-cli-merge-flow")
    );

    const mailCheck = await execFileAsync(
      process.execPath,
      [tsxCliPath, cliEntryPath, "mail", "check", "session-cli-mail-flow"],
      { cwd: repoDir }
    );
    assert.equal(mailCheck.stderr, "");
    assert.match(mailCheck.stdout, /Unread mail for agent-cli-mail-flow:/);
    assert.match(mailCheck.stdout, /Session: session-cli-mail-flow/);
    assert.match(mailCheck.stdout, /Body:\n  Need merge decision\.\n/);

    const postMailStatus = await execFileAsync(process.execPath, [tsxCliPath, cliEntryPath, "status"], {
      cwd: repoDir
    });
    assert.equal(postMailStatus.stderr, "");
    assert.match(
      postMailStatus.stdout,
      /stopped\tsession-cli-mail-flow\tagent-cli-mail-flow[^\n]*\t0\tabandon-only:not-merged\tReview the preserved branch after the agent reply\.\tfinished:stopped\treview-merge\t/
    );
    assert.match(
      postMailStatus.stdout,
      /stopped\tsession-cli-merge-flow\tagent-cli-merge-flow[^\n]*\t0\tabandon-only:not-merged\tPrepare the preserved branch for reintegration\.\tfinished:stopped\treview-merge\t-/
    );

    const mergeResult = await execFileAsync(
      process.execPath,
      [tsxCliPath, cliEntryPath, "merge", "session-cli-merge-flow"],
      { cwd: repoDir }
    );
    assert.equal(mergeResult.stderr, "");
    assert.match(mergeResult.stdout, /Merged agent-cli-merge-flow into main/);
    assert.match(mergeResult.stdout, /Session: session-cli-merge-flow/);
    assert.equal(await readFile(mergeNotesPath, "utf8"), "merge candidate\n");

    const postMergeStatus = await execFileAsync(process.execPath, [tsxCliPath, cliEntryPath, "status"], {
      cwd: repoDir
    });
    assert.equal(postMergeStatus.stderr, "");
    assert.match(
      postMergeStatus.stdout,
      /stopped\tsession-cli-merge-flow\tagent-cli-merge-flow[^\n]*\tready:merged\tPrepare the preserved branch for reintegration\.\tfinished:merged\tcleanup\t/
    );
    assert.match(
      postMergeStatus.stdout,
      /stopped\tsession-cli-mail-flow\tagent-cli-mail-flow[^\n]*\tfinished:stopped\treview-merge\t/
    );

    const cleanupResult = await execFileAsync(
      process.execPath,
      [tsxCliPath, cliEntryPath, "stop", "session-cli-merge-flow", "--cleanup"],
      { cwd: repoDir }
    );
    assert.equal(cleanupResult.stderr, "");
    assert.match(cleanupResult.stdout, /Session agent-cli-merge-flow is already stopped\./);
    assert.match(cleanupResult.stdout, /Session: session-cli-merge-flow/);
    assert.match(cleanupResult.stdout, /Cleanup: removed worktree and branch after confirming merge into main\./);

    await assert.rejects(() => access(mergeWorktreePath));
    await assert.rejects(() => git(repoDir, ["rev-parse", "--verify", "agents/agent-cli-merge-flow"]));

    const finalStatus = await execFileAsync(process.execPath, [tsxCliPath, cliEntryPath, "status"], {
      cwd: repoDir
    });
    assert.equal(finalStatus.stderr, "");
    assert.match(
      finalStatus.stdout,
      /stopped\tsession-cli-mail-flow\tagent-cli-mail-flow[^\n]*\tabandon-only:not-merged\tReview the preserved branch after the agent reply\.\tfinished:stopped\treview-merge\t/
    );
    assert.match(
      finalStatus.stdout,
      /stopped\tsession-cli-merge-flow\tagent-cli-merge-flow[^\n]*\tready:absent\tPrepare the preserved branch for reintegration\.\tfinished:merged\tdone\t/
    );
  } finally {
    await removeTempDir(repoDir);
  }
});

test("sy mail send preserves the exact body and reports the resolved session id through the real CLI entrypoint", async () => {
  const repoDir = await createInitializedRepo("switchyard-cli-mail-send-test-");
  const body = "  Review the preserved branch diff.\nSecond line stays intact.  ";

  try {
    await createSession(repoDir, {
      id: "!!!",
      agentName: "agent-cli-send",
      branch: "agents/agent-cli-send",
      worktreePath: join(repoDir, ".switchyard", "worktrees", "agent-cli-send"),
      state: "running",
      runtimePid: 42424,
      createdAt: "2026-03-10T10:45:00.000Z",
      updatedAt: "2026-03-10T10:45:00.000Z"
    });

    const { stdout, stderr } = await execFileAsync(
      process.execPath,
      [tsxCliPath, cliEntryPath, "mail", "send", "!!!", body, "--from", "operator-review"],
      { cwd: repoDir }
    );

    assert.equal(stderr, "");
    assert.match(stdout, /Queued mail for agent-cli-send/);
    assert.match(stdout, /Session: !!!/);
    assert.match(stdout, /Mail id: [0-9a-f-]{36}/);

    const mailbox = await listMailForSession(repoDir, "!!!");
    assert.equal(mailbox.length, 1);
    assert.equal(mailbox[0]?.sender, "operator-review");
    assert.equal(mailbox[0]?.recipient, "agent-cli-send");
    assert.equal(mailbox[0]?.body, body);

    const events = await listEvents(repoDir, { sessionId: "!!!" });
    assert.equal(events.at(-1)?.eventType, "mail.sent");
    assert.equal(events.at(-1)?.payload.sender, "operator-review");
    assert.equal(events.at(-1)?.payload.bodyLength, body.length);
  } finally {
    await removeTempDir(repoDir);
  }
});

test("sy mail send can read the exact body from a file through the real CLI entrypoint", async () => {
  const repoDir = await createInitializedRepo("switchyard-cli-mail-send-file-test-");
  const nestedDir = join(repoDir, "notes");
  const body = "  Review the preserved branch diff from file.\nSecond line stays intact.  ";

  try {
    await mkdir(nestedDir, { recursive: true });
    await writeFile(join(nestedDir, "mail-body.txt"), body, "utf8");

    await createSession(repoDir, {
      id: "session-cli-mail-file",
      agentName: "agent-cli-mail-file",
      branch: "agents/agent-cli-mail-file",
      worktreePath: join(repoDir, ".switchyard", "worktrees", "agent-cli-mail-file"),
      state: "running",
      runtimePid: 52525,
      createdAt: "2026-03-10T10:50:00.000Z",
      updatedAt: "2026-03-10T10:50:00.000Z"
    });

    const { stdout, stderr } = await execFileAsync(
      process.execPath,
      [tsxCliPath, cliEntryPath, "mail", "send", "session-cli-mail-file", "--body-file", "mail-body.txt"],
      { cwd: nestedDir }
    );

    assert.equal(stderr, "");
    assert.match(stdout, /Queued mail for agent-cli-mail-file/);
    assert.match(stdout, /Session: session-cli-mail-file/);
    assert.match(stdout, /Mail id: [0-9a-f-]{36}/);

    const mailbox = await listMailForSession(repoDir, "session-cli-mail-file");
    assert.equal(mailbox.length, 1);
    assert.equal(mailbox[0]?.body, body);

    const events = await listEvents(repoDir, { sessionId: "session-cli-mail-file" });
    assert.equal(events.at(-1)?.eventType, "mail.sent");
    assert.equal(events.at(-1)?.payload.bodyLength, body.length);
  } finally {
    await removeTempDir(repoDir);
  }
});

test("sy mail send reports body-file read failures through the Switchyard error contract", async () => {
  const repoDir = await createInitializedRepo("switchyard-cli-mail-send-missing-file-test-");

  try {
    await createSession(repoDir, {
      id: "session-cli-mail-missing-file",
      agentName: "agent-cli-mail-missing-file",
      branch: "agents/agent-cli-mail-missing-file",
      worktreePath: join(repoDir, ".switchyard", "worktrees", "agent-cli-mail-missing-file"),
      state: "running",
      runtimePid: 53535,
      createdAt: "2026-03-10T10:55:00.000Z",
      updatedAt: "2026-03-10T10:55:00.000Z"
    });

    await assert.rejects(
      () => execFileAsync(
        process.execPath,
        [tsxCliPath, cliEntryPath, "mail", "send", "session-cli-mail-missing-file", "--body-file", "missing-body.txt"],
        { cwd: repoDir }
      ),
      (error: unknown) => {
        assert.ok(error && typeof error === "object" && "stdout" in error && "stderr" in error);
        const cliError = error as { stdout: string; stderr: string; code: number };
        assert.equal(cliError.code, 1);
        assert.equal(cliError.stdout, "");
        assert.match(
          cliError.stderr,
          /MAIL_ERROR: Failed to read body file 'missing-body\.txt': ENOENT: no such file or directory/
        );
        return true;
      }
    );
  } finally {
    await removeTempDir(repoDir);
  }
});

test("sy mail list --unread preserves unread state through the real CLI entrypoint", async () => {
  const repoDir = await createInitializedRepo("switchyard-cli-mail-test-");

  try {
    await createSession(repoDir, {
      id: "session-cli-mail",
      agentName: "agent-cli-mail",
      branch: "agents/agent-cli-mail",
      worktreePath: join(repoDir, ".switchyard", "worktrees", "agent-cli-mail"),
      state: "running",
      runtimePid: 31337,
      createdAt: "2026-03-10T11:00:00.000Z",
      updatedAt: "2026-03-10T11:00:00.000Z"
    });

    await createMail(repoDir, {
      sessionId: "session-cli-mail",
      sender: "operator",
      recipient: "agent-cli-mail",
      body: "Already read.",
      createdAt: "2026-03-10T11:01:00.000Z"
    });
    await readUnreadMailForSession(repoDir, "session-cli-mail");
    await createMail(repoDir, {
      sessionId: "session-cli-mail",
      sender: "operator",
      recipient: "agent-cli-mail",
      body: "Still unread.\nSecond line.",
      createdAt: "2026-03-10T11:02:00.000Z"
    });

    const { stdout, stderr } = await execFileAsync(
      process.execPath,
      [tsxCliPath, cliEntryPath, "mail", "list", "session-cli-mail", "--unread"],
      { cwd: repoDir }
    );

    assert.equal(stderr, "");
    assert.match(stdout, /Unread mail for agent-cli-mail \(read-only\):/);
    assert.match(stdout, /Session: session-cli-mail/);
    assert.match(stdout, /Body:\n  Still unread\.\n  Second line\.\n/);
    assert.doesNotMatch(stdout, /Already read\./);
    assert.match(stdout, /Listed 1 message; unread-only view, read state unchanged\./);

    const unreadMail = await readUnreadMailForSession(repoDir, "session-cli-mail");
    assert.equal(unreadMail.length, 1);
    assert.equal(unreadMail[0]?.body, "Still unread.\nSecond line.");

    const events = await listEvents(repoDir, { sessionId: "session-cli-mail" });
    assert.equal(events.at(-1)?.eventType, "mail.listed");
    assert.equal(events.at(-1)?.payload.view, "unread_only");
  } finally {
    await removeTempDir(repoDir);
  }
});

test("sy logs prints the default transcript tail through the real CLI entrypoint", async () => {
  const repoDir = await createInitializedRepo("switchyard-cli-logs-test-");
  const sessionId = "session-cli-logs";
  const agentName = "agent-cli-logs";
  const logPath = join(repoDir, ".switchyard", "logs", `${agentName}-${sessionId}.log`);

  try {
    await createSession(repoDir, {
      id: sessionId,
      agentName,
      branch: `agents/${agentName}`,
      baseBranch: "main",
      worktreePath: join(repoDir, ".switchyard", "worktrees", agentName),
      state: "running",
      runtimePid: 1919,
      createdAt: "2026-03-12T09:20:00.000Z",
      updatedAt: "2026-03-12T09:20:00.000Z"
    });
    await writeFile(
      logPath,
      Array.from({ length: 205 }, (_, index) => `line ${String(index + 1).padStart(3, "0")}`).join("\n") + "\n",
      "utf8"
    );

    const { stdout, stderr } = await execFileAsync(process.execPath, [tsxCliPath, cliEntryPath, "logs", sessionId], {
      cwd: repoDir
    });

    assert.equal(stderr, "");
    assert.match(stdout, /Logs for agent-cli-logs \(session-cli-logs\):/);
    assert.match(stdout, /Log: \.switchyard\/logs\/agent-cli-logs-session-cli-logs\.log/);
    assert.doesNotMatch(stdout, /line 001/);
    assert.match(stdout, /line 006/);
    assert.match(stdout, /line 205/);
  } finally {
    await removeTempDir(repoDir);
  }
});

test("sy sling reports task-file read failures through the Switchyard error contract", async () => {
  const repoDir = await createInitializedRepo("switchyard-cli-sling-test-");

  try {
    await assert.rejects(
      () => execFileAsync(
        process.execPath,
        [tsxCliPath, cliEntryPath, "sling", "agent-cli-task-file", "--task-file", "missing-task.md"],
        { cwd: repoDir }
      ),
      (error: unknown) => {
        assert.ok(error && typeof error === "object" && "stdout" in error && "stderr" in error);
        const cliError = error as { stdout: string; stderr: string; code: number };
        assert.equal(cliError.code, 1);
        assert.equal(cliError.stdout, "");
        assert.match(
          cliError.stderr,
          /SLING_ERROR: Failed to read task file 'missing-task\.md': ENOENT: no such file or directory/
        );
        return true;
      }
    );
  } finally {
    await removeTempDir(repoDir);
  }
});

async function createInitializedRepo(prefix: string): Promise<string> {
  const repoDir = await createTempGitRepo(prefix);
  await bootstrapSwitchyardLayout(repoDir);
  await writeConfig(buildDefaultConfig(repoDir, "switchyard-test", "main"));
  return repoDir;
}

async function writeFileFromGitWorktree(worktreePath: string, repoFilePath: string, contents: string): Promise<void> {
  const filename = basename(repoFilePath);
  const worktreeFilePath = join(worktreePath, filename);
  await writeFile(worktreeFilePath, contents, "utf8");
  await git(worktreePath, ["config", "user.name", "Switchyard Test"]);
  await git(worktreePath, ["config", "user.email", "switchyard@example.com"]);
  await git(worktreePath, ["switch", "agents/agent-cli-merge"]);
  await git(worktreePath, ["add", filename]);
  await git(worktreePath, ["commit", "-m", "Agent branch change"]);
}

function stopChildIfAlive(pid: number): void {
  try {
    process.kill(pid, "SIGKILL");
  } catch (error) {
    if (!(error instanceof Error) || !("code" in error) || error.code !== "ESRCH") {
      throw error;
    }
  }
}
