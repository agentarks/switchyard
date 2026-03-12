import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, mkdir, readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import {
  createRemoteTrackingOnlyCanonicalRepo,
  createTempGitRepo,
  createUnbornTempGitRepo,
  removeTempDir
} from "../test-helpers/git.js";

const execFileAsync = promisify(execFile);
const tsxCliPath = fileURLToPath(new URL("../../node_modules/tsx/dist/cli.mjs", import.meta.url));
const cliEntryPath = fileURLToPath(new URL("../index.ts", import.meta.url));

test("sy init bootstraps the repo root when invoked from a nested directory", async () => {
  const repoDir = await createTempGitRepo();
  const nestedDir = join(repoDir, "nested", "deeper");

  try {
    await mkdir(nestedDir, { recursive: true });

    const { stdout, stderr } = await execFileAsync(process.execPath, [tsxCliPath, cliEntryPath, "init"], {
      cwd: nestedDir
    });

    assert.equal(stderr, "");
    assert.match(stdout, new RegExp(`Initialized Switchyard in ${escapeRegExp(repoDir)}`));
    assert.match(stdout, new RegExp(`Config: ${escapeRegExp(join(repoDir, ".switchyard", "config.yaml"))}`));

    const configPath = join(repoDir, ".switchyard", "config.yaml");
    const config = parse(await readFile(configPath, "utf8")) as Record<string, unknown>;

    assert.deepEqual(config, {
      project: {
        name: basename(repoDir),
        root: repoDir,
        canonicalBranch: "main"
      },
      runtime: {
        default: "codex",
        useTmux: true
      },
      worktrees: {
        baseDir: ".switchyard/worktrees"
      }
    });

    for (const relativePath of [
      ".switchyard/.gitignore",
      ".switchyard/README.md",
      ".switchyard/worktrees",
      ".switchyard/logs",
      ".switchyard/agents",
      ".switchyard/specs",
      ".switchyard/sessions.db",
      ".switchyard/mail.db",
      ".switchyard/events.db"
    ]) {
      await access(join(repoDir, relativePath));
    }

    await assert.rejects(() => access(join(nestedDir, ".switchyard", "config.yaml")));
  } finally {
    await removeTempDir(repoDir);
  }
});

test("sy init warns when the chosen canonical branch does not point to a commit yet", async () => {
  const repoDir = await createUnbornTempGitRepo();

  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, [tsxCliPath, cliEntryPath, "init"], {
      cwd: repoDir
    });

    assert.match(stdout, new RegExp(`Initialized Switchyard in ${escapeRegExp(repoDir)}`));
    assert.match(stdout, new RegExp(`Config: ${escapeRegExp(join(repoDir, ".switchyard", "config.yaml"))}`));
    assert.match(
      stderr,
      /WARN: Canonical branch 'main' does not point to a commit yet\. Create an initial commit on that branch before running 'sy sling'\./
    );

    const configPath = join(repoDir, ".switchyard", "config.yaml");
    const config = parse(await readFile(configPath, "utf8")) as Record<string, unknown>;

    assert.deepEqual(config, {
      project: {
        name: basename(repoDir),
        root: repoDir,
        canonicalBranch: "main"
      },
      runtime: {
        default: "codex",
        useTmux: true
      },
      worktrees: {
        baseDir: ".switchyard/worktrees"
      }
    });
  } finally {
    await removeTempDir(repoDir);
  }
});

test("sy init does not warn when the canonical branch resolves via origin tracking", async () => {
  const repoDir = await createRemoteTrackingOnlyCanonicalRepo();

  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, [tsxCliPath, cliEntryPath, "init"], {
      cwd: repoDir
    });

    assert.match(stdout, new RegExp(`Initialized Switchyard in ${escapeRegExp(repoDir)}`));
    assert.equal(stderr, "");
  } finally {
    await removeTempDir(repoDir);
  }
});

test("sy init does not warn when the configured canonical branch is an already-qualified remote ref", async () => {
  const repoDir = await createRemoteTrackingOnlyCanonicalRepo();

  try {
    const { stdout, stderr } = await execFileAsync(
      process.execPath,
      [tsxCliPath, cliEntryPath, "init", "--canonical-branch", "origin/main"],
      { cwd: repoDir }
    );

    assert.match(stdout, new RegExp(`Initialized Switchyard in ${escapeRegExp(repoDir)}`));
    assert.equal(stderr, "");
  } finally {
    await removeTempDir(repoDir);
  }
});

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
