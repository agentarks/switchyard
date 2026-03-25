import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function listDirtyWorktreeEntries(projectRoot: string): Promise<string[]> {
  const { stdout } = await execFileAsync("git", ["status", "--short", "--untracked-files=all"], { cwd: projectRoot });
  return stdout
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0);
}

export async function getCurrentBranchRef(projectRoot: string): Promise<string> {
  const { stdout } = await execFileAsync("git", ["symbolic-ref", "HEAD"], { cwd: projectRoot });
  return stdout.trim();
}

export async function getCurrentHeadCommit(projectRoot: string): Promise<string> {
  const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: projectRoot });
  return stdout.trim();
}

export async function verifyBranchRefPointsToCommit(projectRoot: string, branchRef: string): Promise<void> {
  await execFileAsync("git", ["rev-parse", "--verify", `${branchRef}^{commit}`], { cwd: projectRoot });
}
