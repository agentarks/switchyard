import { execFile } from "node:child_process";
import { mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd });
  return stdout.trim();
}

export async function createTempGitRepo(prefix = "switchyard-git-test-"): Promise<string> {
  const repoDir = await realpath(await mkdtemp(join(tmpdir(), prefix)));
  await git(repoDir, ["init", "-b", "main"]);
  await git(repoDir, ["config", "user.name", "Switchyard Test"]);
  await git(repoDir, ["config", "user.email", "switchyard@example.com"]);
  await writeFile(join(repoDir, "README.md"), "# temp repo\n", "utf8");
  await git(repoDir, ["add", "README.md"]);
  await git(repoDir, ["commit", "-m", "Initial commit"]);
  return repoDir;
}

export async function createUnbornTempGitRepo(prefix = "switchyard-git-test-"): Promise<string> {
  const repoDir = await realpath(await mkdtemp(join(tmpdir(), prefix)));
  await git(repoDir, ["init", "-b", "main"]);
  await git(repoDir, ["config", "user.name", "Switchyard Test"]);
  await git(repoDir, ["config", "user.email", "switchyard@example.com"]);
  return repoDir;
}

export async function createRemoteTrackingOnlyCanonicalRepo(prefix = "switchyard-git-test-"): Promise<string> {
  const repoDir = await createTempGitRepo(prefix);
  const bareOriginDir = await realpath(await mkdtemp(join(tmpdir(), `${prefix}origin-`)));

  await git(bareOriginDir, ["init", "--bare", "-b", "main"]);
  await git(repoDir, ["remote", "add", "origin", bareOriginDir]);
  await git(repoDir, ["push", "-u", "origin", "main"]);
  await git(repoDir, ["switch", "-c", "feature/test"]);
  await git(repoDir, ["branch", "-D", "main"]);
  await git(repoDir, ["fetch", "origin"]);

  return repoDir;
}

export async function removeTempDir(path: string): Promise<void> {
  await rm(path, { recursive: true, force: true });
}
