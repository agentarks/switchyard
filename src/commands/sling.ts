import { relative } from "node:path";
import process from "node:process";
import { Command } from "commander";
import { loadConfig } from "../config.js";
import { SlingError } from "../errors.js";
import { createSession } from "../sessions/store.js";
import {
  type SpawnedRuntimeSession,
  spawnCodexSession
} from "../runtimes/codex/index.js";
import { createWorktree } from "../worktrees/manager.js";

interface SlingOptions {
  agentName: string;
  runtimeArgs?: string[];
  startDir?: string;
  spawnRuntime?: (options: { agentName: string; runtimeArgs: string[]; worktreePath: string }) => Promise<SpawnedRuntimeSession>;
}

export function createSlingCommand(): Command {
  return new Command("sling")
    .description("Spawn one Codex agent into an isolated worktree")
    .argument("<agent>", "Deterministic agent name")
    .argument("[args...]", "Arguments reserved for future Codex/runtime inputs")
    .action(async (agentName: string, runtimeArgs: string[]) => {
      await slingCommand({ agentName, runtimeArgs });
    });
}

export async function slingCommand(options: SlingOptions): Promise<void> {
  const config = await loadConfig(options.startDir);

  if (config.runtime.default !== "codex") {
    throw new SlingError(`Unsupported runtime '${config.runtime.default}'. Only 'codex' is implemented.`);
  }

  const managedWorktree = await createWorktree(config, options.agentName);
  const spawnRuntime = options.spawnRuntime ?? (async ({ runtimeArgs, worktreePath }) => {
    return await spawnCodexSession({ runtimeArgs, worktreePath });
  });
  const runtimeArgs = options.runtimeArgs ?? [];
  const createdAt = new Date().toISOString();
  let runtimeSession: SpawnedRuntimeSession;

  try {
    runtimeSession = await spawnRuntime({
      agentName: managedWorktree.agentName,
      runtimeArgs,
      worktreePath: managedWorktree.path
    });
  } catch (error) {
    await createSession(config.project.root, {
      id: managedWorktree.agentName,
      agentName: managedWorktree.agentName,
      branch: managedWorktree.branch,
      worktreePath: managedWorktree.path,
      state: "failed",
      createdAt,
      updatedAt: createdAt
    });

    throw error;
  }

  await createSession(config.project.root, {
    id: managedWorktree.agentName,
    agentName: managedWorktree.agentName,
    branch: managedWorktree.branch,
    worktreePath: managedWorktree.path,
    state: "running",
    createdAt,
    updatedAt: createdAt
  });

  process.stdout.write(`Spawned ${managedWorktree.agentName}\n`);
  process.stdout.write(`Branch: ${managedWorktree.branch}\n`);
  process.stdout.write(`Worktree: ${formatRelativePath(config.project.root, managedWorktree.path)}\n`);
  process.stdout.write(`Runtime: ${formatRuntimeCommand(runtimeSession)}\n`);
}

function formatRelativePath(projectRoot: string, path: string): string {
  const relativePath = relative(projectRoot, path);
  return relativePath.length > 0 ? relativePath : ".";
}

function formatRuntimeCommand(runtimeSession: SpawnedRuntimeSession): string {
  const parts = [runtimeSession.command.command, ...runtimeSession.command.args];
  return parts.join(" ");
}
