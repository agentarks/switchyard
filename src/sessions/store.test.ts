import test from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { bootstrapSwitchyardLayout } from "../storage/bootstrap.js";
import { createTempGitRepo, removeTempDir } from "../test-helpers/git.js";
import { createSession, initializeSessionStore, listSessions } from "./store.js";

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
      createdAt: "2026-03-06T09:00:00.000Z",
      updatedAt: "2026-03-06T10:00:00.000Z"
    });
    await createSession(repoDir, {
      id: "agent-two",
      agentName: "agent-two",
      branch: "agents/agent-two",
      worktreePath: join(repoDir, ".switchyard", "worktrees", "agent-two"),
      state: "stopped",
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
      createdAt: "2026-03-06T11:00:00.000Z",
      updatedAt: "2026-03-06T12:00:00.000Z"
    });
  } finally {
    await removeTempDir(repoDir);
  }
});
