import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { stringify } from "yaml";
import {
  branchPointsToCommit,
  buildDefaultConfig,
  detectCanonicalBranch,
  detectProjectRoot,
  loadConfig,
  resolveBranchStartPoint
} from "./config.js";
import { createRemoteTrackingOnlyCanonicalRepo, createTempGitRepo, git, removeTempDir } from "./test-helpers/git.js";

test("detectProjectRoot resolves the common repo root from a git worktree", async () => {
  const repoDir = await createTempGitRepo("switchyard-config-test-");

  try {
    const worktreeDir = join(repoDir, ".worktrees", "agent-one");
    await mkdir(join(repoDir, ".worktrees"), { recursive: true });
    await git(repoDir, ["worktree", "add", "-b", "agent-one", worktreeDir, "main"]);

    const detectedRoot = await detectProjectRoot(worktreeDir);
    assert.equal(detectedRoot, repoDir);
  } finally {
    await removeTempDir(repoDir);
  }
});

test("detectCanonicalBranch prefers origin HEAD over the current feature branch", async () => {
  const repoDir = await createTempGitRepo("switchyard-config-test-");

  try {
    const mainSha = await git(repoDir, ["rev-parse", "HEAD"]);
    await git(repoDir, ["update-ref", "refs/remotes/origin/main", mainSha]);
    await git(repoDir, ["symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/main"]);
    await git(repoDir, ["checkout", "-b", "feature/test"]);

    const branch = await detectCanonicalBranch(repoDir);
    assert.equal(branch, "main");
  } finally {
    await removeTempDir(repoDir);
  }
});

test("loadConfig normalizes project.root to the canonical repo root", async () => {
  const repoDir = await createTempGitRepo("switchyard-config-test-");

  try {
    const config = buildDefaultConfig("/tmp/old-location", "switchyard", "main");
    await mkdir(join(repoDir, ".switchyard"), { recursive: true });
    await writeFile(join(repoDir, ".switchyard", "config.yaml"), stringify(config), "utf8");

    const loaded = await loadConfig(repoDir);
    assert.equal(loaded.project.root, repoDir);
    assert.equal(loaded.orchestration.maxConcurrentSpecialists, 3);
    assert.equal(loaded.orchestration.reviewPolicy, "required");
    assert.equal(loaded.orchestration.mergePolicy, "manual-ready");
  } finally {
    await removeTempDir(repoDir);
  }
});

test("loadConfig backfills orchestration defaults for legacy config files", async () => {
  const repoDir = await createTempGitRepo("switchyard-config-test-");

  try {
    await mkdir(join(repoDir, ".switchyard"), { recursive: true });
    await writeFile(
      join(repoDir, ".switchyard", "config.yaml"),
      stringify({
        project: {
          name: "switchyard",
          root: "/tmp/old-location",
          canonicalBranch: "main"
        },
        runtime: {
          default: "codex",
          useTmux: true
        },
        worktrees: {
          baseDir: ".switchyard/worktrees"
        }
      }),
      "utf8"
    );

    const loaded = await loadConfig(repoDir);
    assert.deepEqual(loaded.orchestration, {
      maxConcurrentSpecialists: 3,
      reviewPolicy: "required",
      mergePolicy: "manual-ready"
    });
  } finally {
    await removeTempDir(repoDir);
  }
});

test("buildDefaultConfig includes orchestration defaults", () => {
  const config = buildDefaultConfig("/tmp/repo", "switchyard", "main");

  assert.deepEqual(config.orchestration, {
    maxConcurrentSpecialists: 3,
    reviewPolicy: "required",
    mergePolicy: "manual-ready"
  });
});

test("loadConfig preserves explicit orchestration settings", async () => {
  const repoDir = await createTempGitRepo("switchyard-config-test-");

  try {
    const config = buildDefaultConfig(repoDir, "switchyard", "main");
    config.orchestration.maxConcurrentSpecialists = 5;
    config.orchestration.reviewPolicy = "optional";
    config.orchestration.mergePolicy = "auto-after-verify";
    await mkdir(join(repoDir, ".switchyard"), { recursive: true });
    await writeFile(join(repoDir, ".switchyard", "config.yaml"), stringify(config), "utf8");

    const loaded = await loadConfig(repoDir);
    assert.equal(loaded.orchestration.maxConcurrentSpecialists, 5);
    assert.equal(loaded.orchestration.reviewPolicy, "optional");
    assert.equal(loaded.orchestration.mergePolicy, "auto-after-verify");
  } finally {
    await removeTempDir(repoDir);
  }
});

test("loadConfig rejects a non-positive orchestration concurrency cap", async () => {
  const repoDir = await createTempGitRepo("switchyard-config-test-");

  try {
    const config = buildDefaultConfig(repoDir, "switchyard", "main");
    config.orchestration.maxConcurrentSpecialists = 0;
    await mkdir(join(repoDir, ".switchyard"), { recursive: true });
    await writeFile(join(repoDir, ".switchyard", "config.yaml"), stringify(config), "utf8");

    await assert.rejects(() => loadConfig(repoDir), /Invalid \.switchyard\/config\.yaml shape\./);
  } finally {
    await removeTempDir(repoDir);
  }
});

test("branchPointsToCommit accepts a canonical branch that is only available via origin tracking", async () => {
  const repoDir = await createRemoteTrackingOnlyCanonicalRepo("switchyard-config-test-");

  try {
    assert.equal(await branchPointsToCommit(repoDir, "main"), true);
  } finally {
    await removeTempDir(repoDir);
  }
});

test("resolveBranchStartPoint accepts an already-qualified remote ref verbatim", async () => {
  const repoDir = await createRemoteTrackingOnlyCanonicalRepo("switchyard-config-test-");

  try {
    assert.equal(await resolveBranchStartPoint(repoDir, "origin/main"), "origin/main");
    assert.equal(await branchPointsToCommit(repoDir, "origin/main"), true);
  } finally {
    await removeTempDir(repoDir);
  }
});
