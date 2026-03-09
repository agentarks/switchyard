import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, mkdir, readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { createTempGitRepo, removeTempDir } from "../test-helpers/git.js";

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
  } finally {
    await removeTempDir(repoDir);
  }
});

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
