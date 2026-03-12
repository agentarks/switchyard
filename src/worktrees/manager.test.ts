import test from "node:test";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { buildDefaultConfig, loadConfig, writeConfig } from "../config.js";
import { WorktreeError } from "../errors.js";
import { bootstrapSwitchyardLayout } from "../storage/bootstrap.js";
import {
  createRemoteTrackingOnlyCanonicalRepo,
  createTempGitRepo,
  createUnbornTempGitRepo,
  git,
  removeTempDir
} from "../test-helpers/git.js";
import { createWorktree } from "./manager.js";

test("createWorktree creates a deterministic branch and path from the repo root", async () => {
  const repoDir = await createInitializedRepo("switchyard-worktree-test-");

  try {
    const config = await loadConfig(repoDir);
    const worktree = await createWorktree(config, "Agent One");

    assert.equal(worktree.agentName, "agent-one");
    assert.equal(worktree.branch, "agents/agent-one");
    assert.equal(worktree.path, join(repoDir, ".switchyard", "worktrees", "agent-one"));

    const listedPaths = await git(repoDir, ["worktree", "list", "--porcelain"]);
    assert.match(listedPaths, new RegExp(escapeRegExp(worktree.path)));

    const branchCommit = await git(repoDir, ["rev-parse", worktree.branch]);
    const baseCommit = await git(repoDir, ["rev-parse", "main"]);
    assert.equal(branchCommit, baseCommit);
  } finally {
    await removeTempDir(repoDir);
  }
});

test("createWorktree uses the canonical repo root even when config is loaded from a nested directory", async () => {
  const repoDir = await createInitializedRepo("switchyard-worktree-test-");

  try {
    const nestedDir = join(repoDir, "packages", "feature");
    await mkdir(nestedDir, { recursive: true });

    const config = await loadConfig(nestedDir);
    const worktree = await createWorktree(config, "Nested Agent");

    assert.equal(worktree.path, join(repoDir, ".switchyard", "worktrees", "nested-agent"));
    assert.equal(await git(worktree.path, ["rev-parse", "--show-toplevel"]), worktree.path);
  } finally {
    await removeTempDir(repoDir);
  }
});

test("createWorktree rejects deterministic name collisions", async () => {
  const repoDir = await createInitializedRepo("switchyard-worktree-test-");

  try {
    const config = await loadConfig(repoDir);
    await createWorktree(config, "Agent One");

    await assert.rejects(async () => {
      await createWorktree(config, "agent-one");
    }, (error: unknown) => {
      assert.ok(error instanceof WorktreeError);
      assert.match(error.message, /already exists/);
      return true;
    });
  } finally {
    await removeTempDir(repoDir);
  }
});

test("createWorktree fails explicitly when the canonical branch does not point to a commit yet", async () => {
  const repoDir = await createUnbornInitializedRepo("switchyard-worktree-test-");

  try {
    const config = await loadConfig(repoDir);

    await assert.rejects(
      () => createWorktree(config, "Writer"),
      /Configured canonical branch 'main' does not point to a commit yet\. Make an initial commit on that branch before running 'sy sling'\./
    );
  } finally {
    await removeTempDir(repoDir);
  }
});

test("createWorktree accepts a canonical branch that is only available via origin tracking", async () => {
  const repoDir = await createRemoteTrackingInitializedRepo("switchyard-worktree-test-");

  try {
    const config = await loadConfig(repoDir);
    const worktree = await createWorktree(config, "Writer Remote");

    assert.equal(worktree.branch, "agents/writer-remote");
    assert.equal(await git(worktree.path, ["branch", "--show-current"]), "agents/writer-remote");
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

async function createUnbornInitializedRepo(prefix: string): Promise<string> {
  const repoDir = await createUnbornTempGitRepo(prefix);
  await bootstrapSwitchyardLayout(repoDir);
  await writeConfig(buildDefaultConfig(repoDir, "switchyard-test", "main"));
  return repoDir;
}

async function createRemoteTrackingInitializedRepo(prefix: string): Promise<string> {
  const repoDir = await createRemoteTrackingOnlyCanonicalRepo(prefix);
  await bootstrapSwitchyardLayout(repoDir);
  await writeConfig(buildDefaultConfig(repoDir, "switchyard-test", "main"));
  return repoDir;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
