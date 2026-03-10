import test from "node:test";
import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { access, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { buildDefaultConfig, writeConfig } from "./config.js";
import { listEvents } from "./events/store.js";
import { createMail, readUnreadMailForSession } from "./mail/store.js";
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
