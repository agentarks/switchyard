import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { stringify } from "yaml";
import { buildDefaultConfig, detectCanonicalBranch, detectProjectRoot, loadConfig } from "./config.js";

const execFileAsync = promisify(execFile);

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd });
  return stdout.trim();
}

async function createTempRepo(): Promise<string> {
  const repoDir = await realpath(await mkdtemp(join(tmpdir(), "switchyard-config-test-")));
  await git(repoDir, ["init", "-b", "main"]);
  await git(repoDir, ["config", "user.name", "Switchyard Test"]);
  await git(repoDir, ["config", "user.email", "switchyard@example.com"]);
  await writeFile(join(repoDir, "README.md"), "# temp repo\n", "utf8");
  await git(repoDir, ["add", "README.md"]);
  await git(repoDir, ["commit", "-m", "Initial commit"]);
  return repoDir;
}

test("detectProjectRoot resolves the common repo root from a git worktree", async () => {
  const repoDir = await createTempRepo();

  try {
    const worktreeDir = join(repoDir, ".worktrees", "agent-one");
    await mkdir(join(repoDir, ".worktrees"), { recursive: true });
    await git(repoDir, ["worktree", "add", "-b", "agent-one", worktreeDir, "main"]);

    const detectedRoot = await detectProjectRoot(worktreeDir);
    assert.equal(detectedRoot, repoDir);
  } finally {
    await rm(repoDir, { recursive: true, force: true });
  }
});

test("detectCanonicalBranch prefers origin HEAD over the current feature branch", async () => {
  const repoDir = await createTempRepo();

  try {
    const mainSha = await git(repoDir, ["rev-parse", "HEAD"]);
    await git(repoDir, ["update-ref", "refs/remotes/origin/main", mainSha]);
    await git(repoDir, ["symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/main"]);
    await git(repoDir, ["checkout", "-b", "feature/test"]);

    const branch = await detectCanonicalBranch(repoDir);
    assert.equal(branch, "main");
  } finally {
    await rm(repoDir, { recursive: true, force: true });
  }
});

test("loadConfig normalizes project.root to the canonical repo root", async () => {
  const repoDir = await createTempRepo();

  try {
    const config = buildDefaultConfig("/tmp/old-location", "switchyard", "main");
    await mkdir(join(repoDir, ".switchyard"), { recursive: true });
    await writeFile(join(repoDir, ".switchyard", "config.yaml"), stringify(config), "utf8");

    const loaded = await loadConfig(repoDir);
    assert.equal(loaded.project.root, repoDir);
  } finally {
    await rm(repoDir, { recursive: true, force: true });
  }
});
