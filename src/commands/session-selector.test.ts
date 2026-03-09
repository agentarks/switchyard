import test from "node:test";
import assert from "node:assert/strict";
import { buildDefaultConfig, writeConfig } from "../config.js";
import { createSession } from "../sessions/store.js";
import { bootstrapSwitchyardLayout } from "../storage/bootstrap.js";
import { createTempGitRepo, removeTempDir } from "../test-helpers/git.js";
import { resolveSessionByIdOrAgent } from "./session-selector.js";

test("resolveSessionByIdOrAgent resolves an exact session id even when the selector is not a valid agent name", async () => {
  const repoDir = await createInitializedRepo();

  try {
    const session = await createSession(repoDir, {
      id: "!!!",
      agentName: "agent-bang",
      branch: "agents/agent-bang",
      worktreePath: `${repoDir}/.switchyard/worktrees/agent-bang`,
      state: "running",
      runtimePid: 5151,
      createdAt: "2026-03-06T09:00:00.000Z",
      updatedAt: "2026-03-06T09:00:00.000Z"
    });

    const resolved = await resolveSessionByIdOrAgent(repoDir, "!!!", createAmbiguousError);

    assert.equal(resolved?.id, session.id);
  } finally {
    await removeTempDir(repoDir);
  }
});

test("resolveSessionByIdOrAgent returns undefined for an invalid selector when no exact session id exists", async () => {
  const repoDir = await createInitializedRepo();

  try {
    const resolved = await resolveSessionByIdOrAgent(repoDir, "!!!", createAmbiguousError);
    assert.equal(resolved, undefined);
  } finally {
    await removeTempDir(repoDir);
  }
});

async function createInitializedRepo(): Promise<string> {
  const repoDir = await createTempGitRepo("switchyard-session-selector-test-");
  await bootstrapSwitchyardLayout(repoDir);
  await writeConfig(buildDefaultConfig(repoDir, "switchyard-test", "main"));
  return repoDir;
}

function createAmbiguousError(): Error {
  return new Error("ambiguous");
}
