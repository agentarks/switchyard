import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import process from "node:process";
import { parse, stringify } from "yaml";
import { ConfigError } from "./errors.js";
import type { SwitchyardConfig } from "./types.js";

export const SWITCHYARD_DIR = ".switchyard";
export const CONFIG_FILE = "config.yaml";

export const DEFAULT_RUNTIME = "codex";

export function buildDefaultConfig(projectRoot: string, projectName: string, canonicalBranch: string): SwitchyardConfig {
  return {
    project: {
      name: projectName,
      root: projectRoot,
      canonicalBranch
    },
    runtime: {
      default: DEFAULT_RUNTIME,
      useTmux: true
    },
    worktrees: {
      baseDir: ".switchyard/worktrees"
    }
  };
}

export async function detectCanonicalBranch(projectRoot: string): Promise<string> {
  try {
    const ref = await runGit(projectRoot, ["symbolic-ref", "refs/remotes/origin/HEAD"]);
    const branch = ref.trim().split("/").pop();
    if (branch) {
      return branch;
    }
  } catch {
    // Fall through to the current branch when origin/HEAD is unavailable.
  }

  try {
    const branch = await runGit(projectRoot, ["branch", "--show-current"]);
    if (branch.trim()) {
      return branch.trim();
    }
  } catch {
    // Fall through to the default branch fallback.
  }

  return "main";
}

export async function branchPointsToCommit(projectRoot: string, branch: string): Promise<boolean> {
  return (await resolveBranchStartPoint(projectRoot, branch)) !== undefined;
}

export async function resolveBranchStartPoint(projectRoot: string, branch: string): Promise<string | undefined> {
  for (const [startPoint, candidate] of [
    [branch, branch],
    [branch, `refs/heads/${branch}`],
    [`origin/${branch}`, `refs/remotes/origin/${branch}`]
  ] as const) {
    try {
      await runGit(projectRoot, ["rev-parse", "--verify", `${candidate}^{commit}`]);
      return startPoint;
    } catch {
      // Try the next ref candidate.
    }
  }

  return undefined;
}

export async function detectProjectRoot(startDir = process.cwd()): Promise<string> {
  while (true) {
    try {
      const commonDir = await runGit(startDir, ["rev-parse", "--git-common-dir"]);
      const resolvedCommonDir = resolve(startDir, commonDir.trim());
      return dirname(resolvedCommonDir);
    } catch {
      throw new ConfigError("Not inside a git repository.");
    }
  }
}

export async function loadConfig(startDir = process.cwd()): Promise<SwitchyardConfig> {
  const projectRoot = await detectProjectRoot(startDir);
  const configPath = join(projectRoot, SWITCHYARD_DIR, CONFIG_FILE);

  let raw: string;
  try {
    raw = await readFile(configPath, "utf8");
  } catch {
    throw new ConfigError(`Missing ${SWITCHYARD_DIR}/${CONFIG_FILE}. Run 'sy init' first.`);
  }

  let parsed: unknown;
  try {
    parsed = parse(raw);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new ConfigError(`Failed to parse ${SWITCHYARD_DIR}/${CONFIG_FILE}: ${message}`);
  }

  if (!isSwitchyardConfig(parsed)) {
    throw new ConfigError(`Invalid ${SWITCHYARD_DIR}/${CONFIG_FILE} shape.`);
  }

  return {
    ...parsed,
    project: {
      ...parsed.project,
      root: projectRoot
    }
  };
}

export async function writeConfig(config: SwitchyardConfig): Promise<string> {
  const switchyardPath = join(config.project.root, SWITCHYARD_DIR);
  await mkdir(switchyardPath, { recursive: true });
  const configPath = join(switchyardPath, CONFIG_FILE);
  await writeFile(configPath, stringify(config), "utf8");
  return configPath;
}

export function getProjectName(projectRoot: string): string {
  return basename(projectRoot);
}

async function runGit(projectRoot: string, args: string[]): Promise<string> {
  const { execFile } = await import("node:child_process");

  return await new Promise<string>((resolvePromise, rejectPromise) => {
    execFile("git", args, { cwd: projectRoot }, (error, stdout) => {
      if (error) {
        rejectPromise(error);
        return;
      }
      resolvePromise(stdout);
    });
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isSwitchyardConfig(value: unknown): value is SwitchyardConfig {
  if (!isRecord(value)) return false;
  if (!isRecord(value.project) || !isRecord(value.runtime) || !isRecord(value.worktrees)) return false;

  return (
    typeof value.project.name === "string" &&
    typeof value.project.root === "string" &&
    typeof value.project.canonicalBranch === "string" &&
    typeof value.runtime.default === "string" &&
    typeof value.runtime.useTmux === "boolean" &&
    typeof value.worktrees.baseDir === "string"
  );
}
