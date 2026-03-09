import test from "node:test";
import assert from "node:assert/strict";
import { buildDefaultConfig, writeConfig } from "../config.js";
import { createSession } from "../sessions/store.js";
import { bootstrapSwitchyardLayout } from "../storage/bootstrap.js";
import { createTempGitRepo, removeTempDir } from "../test-helpers/git.js";
import { formatSessionSelectorAmbiguousMessage, resolveSessionByIdOrAgent, type SessionSelectorAmbiguity } from "./session-selector.js";

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

    const resolved = await resolveSessionByIdOrAgent(repoDir, "!!!", createAmbiguousError("!!!"));

    assert.equal(resolved?.id, session.id);
  } finally {
    await removeTempDir(repoDir);
  }
});

test("resolveSessionByIdOrAgent returns undefined for an invalid selector when no exact session id exists", async () => {
  const repoDir = await createInitializedRepo();

  try {
    const resolved = await resolveSessionByIdOrAgent(repoDir, "!!!", createAmbiguousError("!!!"));
    assert.equal(resolved, undefined);
  } finally {
    await removeTempDir(repoDir);
  }
});

test("resolveSessionByIdOrAgent rejects selectors that match multiple sessions by agent name", async () => {
  const repoDir = await createInitializedRepo();

  try {
    await createSession(repoDir, {
      id: "session-one",
      agentName: "shared-agent",
      branch: "agents/shared-agent",
      worktreePath: `${repoDir}/.switchyard/worktrees/shared-agent-one`,
      state: "running",
      runtimePid: 5151,
      createdAt: "2026-03-06T09:00:00.000Z",
      updatedAt: "2026-03-06T10:00:00.000Z"
    });
    await createSession(repoDir, {
      id: "session-two",
      agentName: "shared-agent",
      branch: "agents/shared-agent",
      worktreePath: `${repoDir}/.switchyard/worktrees/shared-agent-two`,
      state: "stopped",
      runtimePid: null,
      createdAt: "2026-03-06T09:05:00.000Z",
      updatedAt: "2026-03-06T11:00:00.000Z"
    });

    await assert.rejects(
      () => resolveSessionByIdOrAgent(repoDir, "shared-agent", createAmbiguousError("shared-agent")),
      /Selector 'shared-agent' is ambiguous: it matches multiple sessions by agent name \('session-two', 'session-one'\)\. Use an exact session id from 'sy status'\./
    );
  } finally {
    await removeTempDir(repoDir);
  }
});

test("resolveSessionByIdOrAgent rejects selectors that match one session by id and multiple sessions by agent name", async () => {
  const repoDir = await createInitializedRepo();

  try {
    await createSession(repoDir, {
      id: "shared-agent",
      agentName: "other-agent",
      branch: "agents/other-agent",
      worktreePath: `${repoDir}/.switchyard/worktrees/other-agent`,
      state: "running",
      runtimePid: 5252,
      createdAt: "2026-03-06T09:00:00.000Z",
      updatedAt: "2026-03-06T09:00:00.000Z"
    });
    await createSession(repoDir, {
      id: "session-three",
      agentName: "shared-agent",
      branch: "agents/shared-agent",
      worktreePath: `${repoDir}/.switchyard/worktrees/shared-agent-three`,
      state: "running",
      runtimePid: 5353,
      createdAt: "2026-03-06T09:05:00.000Z",
      updatedAt: "2026-03-06T11:00:00.000Z"
    });
    await createSession(repoDir, {
      id: "session-four",
      agentName: "shared-agent",
      branch: "agents/shared-agent",
      worktreePath: `${repoDir}/.switchyard/worktrees/shared-agent-four`,
      state: "stopped",
      runtimePid: null,
      createdAt: "2026-03-06T09:10:00.000Z",
      updatedAt: "2026-03-06T10:30:00.000Z"
    });

    await assert.rejects(
      () => resolveSessionByIdOrAgent(repoDir, "shared-agent", createAmbiguousError("shared-agent")),
      /Selector 'shared-agent' is ambiguous: it matches session 'shared-agent' by id and multiple sessions by agent name \('session-three', 'session-four'\)\. Use an exact session id from 'sy status'\./
    );
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

function createAmbiguousError(selector: string) {
  return (ambiguity: SessionSelectorAmbiguity): Error => {
    return new Error(formatSessionSelectorAmbiguousMessage(selector, ambiguity));
  };
}
