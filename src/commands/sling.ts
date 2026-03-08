import { randomUUID } from "node:crypto";
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
import { createWorktree, type ManagedWorktree, removeWorktree } from "../worktrees/manager.js";

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
  const sessionId = randomUUID();
  let runtimeSession: SpawnedRuntimeSession;

  try {
    runtimeSession = await spawnRuntime({
      agentName: managedWorktree.agentName,
      runtimeArgs,
      worktreePath: managedWorktree.path
    });
  } catch (error) {
    const cleanupError = await cleanupFailedLaunch(config.project.root, managedWorktree);

    await createSession(config.project.root, {
      id: sessionId,
      agentName: managedWorktree.agentName,
      branch: managedWorktree.branch,
      worktreePath: managedWorktree.path,
      state: "failed",
      createdAt,
      updatedAt: createdAt
    });

    if (cleanupError) {
      throw new SlingError(`${formatErrorMessage(error)} Cleanup also failed: ${cleanupError.message}`);
    }

    throw error;
  }

  await createSession(config.project.root, {
    id: sessionId,
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

async function cleanupFailedLaunch(projectRoot: string, worktree: ManagedWorktree): Promise<Error | undefined> {
  try {
    await removeWorktree(projectRoot, worktree);
    return undefined;
  } catch (error) {
    return error instanceof Error ? error : new Error(String(error));
  }
}

function formatErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
