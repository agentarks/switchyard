import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function listMeaningfulDirtyEntries(cwd: string): Promise<string[]> {
  const { stdout } = await execFileAsync("git", ["status", "--porcelain", "--untracked-files=all"], { cwd });
  return parseMeaningfulDirtyEntries(stdout);
}

export function parseMeaningfulDirtyEntries(stdout: string): string[] {
  return stdout
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0)
    .filter((line) => !isSwitchyardStateEntry(line));
}

function isSwitchyardStateEntry(line: string): boolean {
  const normalizedPath = line.slice(3);

  if (normalizedPath.includes(" -> ")) {
    const [fromPath, toPath] = normalizedPath.split(" -> ").map((part) => unquoteGitPath(part.trim()));
    return typeof fromPath === "string"
      && typeof toPath === "string"
      && isSwitchyardPath(fromPath)
      && isSwitchyardPath(toPath);
  }

  return isSwitchyardPath(normalizedPath);
}

function isSwitchyardPath(path: string): boolean {
  return path === ".switchyard" || path.startsWith(".switchyard/");
}

function unquoteGitPath(path: string): string {
  if (path.startsWith("\"") && path.endsWith("\"")) {
    return path.slice(1, -1);
  }

  return path;
}
