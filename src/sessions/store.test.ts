import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { join } from "node:path";
import { promisify } from "node:util";
import { bootstrapSwitchyardLayout } from "../storage/bootstrap.js";
import { importSqlite } from "../storage/sqlite.js";
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
      baseBranch: "main",
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
      baseBranch: null,
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

test("listSessions upgrades older session rows without base_branch metadata", async () => {
  const repoDir = await createTempGitRepo("switchyard-session-store-test-");

  try {
    await bootstrapSwitchyardLayout(repoDir);
    const { DatabaseSync } = await importSqlite();
    const db = new DatabaseSync(join(repoDir, ".switchyard", "sessions.db"));

    try {
      db.exec(`
        CREATE TABLE sessions (
          id TEXT PRIMARY KEY,
          agent_name TEXT NOT NULL,
          branch TEXT NOT NULL,
          worktree_path TEXT NOT NULL,
          state TEXT NOT NULL,
          runtime_pid INTEGER,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `);
      db.prepare(`
        INSERT INTO sessions (id, agent_name, branch, worktree_path, state, runtime_pid, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        "legacy-agent",
        "legacy-agent",
        "agents/legacy-agent",
        join(repoDir, ".switchyard", "worktrees", "legacy-agent"),
        "stopped",
        null,
        "2026-03-07T09:00:00.000Z",
        "2026-03-07T09:05:00.000Z"
      );
    } finally {
      db.close();
    }

    const sessions = await listSessions(repoDir);

    assert.equal(sessions.length, 1);
    assert.equal(sessions[0]?.id, "legacy-agent");
    assert.equal(sessions[0]?.baseBranch, null);
  } finally {
    await removeTempDir(repoDir);
  }
});
