import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { join } from "node:path";
import { promisify } from "node:util";
import { bootstrapSwitchyardLayout } from "../storage/bootstrap.js";
import { createTempGitRepo, removeTempDir } from "../test-helpers/git.js";
import { createSession, initializeSessionStore, listSessions } from "./store.js";

const execFileAsync = promisify(execFile);
const storeModuleUrl = new URL("./store.ts", import.meta.url).href;

test("initializeSessionStore creates the sessions schema without records", async () => {
  const repoDir = await createTempGitRepo("switchyard-session-store-test-");

  try {
    await bootstrapSwitchyardLayout(repoDir);
    await initializeSessionStore(repoDir);

    const sessions = await listSessions(repoDir);
    assert.deepEqual(sessions, []);
  } finally {
    await removeTempDir(repoDir);
  }
});

test("concurrent cold-start imports restore process.emitWarning", async () => {
  const repoDir = await createTempGitRepo("switchyard-session-store-test-");

  try {
    await bootstrapSwitchyardLayout(repoDir);

    const script = `
      import process from "node:process";
      import { listSessions } from ${JSON.stringify(storeModuleUrl)};

      const repoDir = process.env.REPO_DIR;
      if (!repoDir) {
        throw new Error("REPO_DIR is required");
      }

      const original = process.emitWarning;
      await Promise.all([listSessions(repoDir), listSessions(repoDir)]);
      process.stdout.write(String(process.emitWarning === original));
    `;

    const { stdout } = await execFileAsync(process.execPath, ["--import", "tsx", "--eval", script], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        REPO_DIR: repoDir
      }
    });

    assert.equal(stdout.trim(), "true");
  } finally {
    await removeTempDir(repoDir);
  }
});

test("listSessions returns inserted sessions ordered by most recent update", async () => {
  const repoDir = await createTempGitRepo("switchyard-session-store-test-");

  try {
    await bootstrapSwitchyardLayout(repoDir);

    await createSession(repoDir, {
      id: "agent-one",
      agentName: "agent-one",
      branch: "agents/agent-one",
      worktreePath: join(repoDir, ".switchyard", "worktrees", "agent-one"),
      state: "running",
      runtimePid: 1234,
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

    const sessions = await listSessions(repoDir);

    assert.equal(sessions.length, 2);
    assert.equal(sessions[0]?.id, "agent-two");
    assert.equal(sessions[1]?.id, "agent-one");
    assert.deepEqual(sessions[0], {
      id: "agent-two",
      agentName: "agent-two",
      branch: "agents/agent-two",
      worktreePath: join(repoDir, ".switchyard", "worktrees", "agent-two"),
      state: "stopped",
      runtimePid: null,
      createdAt: "2026-03-06T11:00:00.000Z",
      updatedAt: "2026-03-06T12:00:00.000Z"
    });
  } finally {
    await removeTempDir(repoDir);
  }
});
