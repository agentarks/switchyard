import { relative } from "node:path";
import process from "node:process";
import { Command } from "commander";
import { loadConfig } from "../config.js";
import { StopError } from "../errors.js";
import { stopProcess, isProcessAlive } from "../runtimes/process.js";
import {
  findLatestSessionByAgent,
  getSessionById,
  updateSessionState
} from "../sessions/store.js";
import type { SessionRecord } from "../sessions/types.js";
import { normalizeAgentName } from "../worktrees/naming.js";
import { removeWorktree } from "../worktrees/manager.js";

interface StopCommandCliOptions {
  cleanup?: boolean;
}

interface StopCommandOptions {
  selector: string;
  cleanup?: boolean;
  startDir?: string;
  isRuntimeAlive?: (pid: number) => boolean;
  stopRuntime?: (pid: number) => Promise<boolean>;
  removeSessionWorktree?: typeof removeWorktree;
}

export function createStopCommand(): Command {
  return new Command("stop")
    .description("Stop a running agent")
    .argument("<session>", "Session id or agent name")
    .option("--cleanup", "Remove the worktree and branch after the runtime stops")
    .action(async (selector: string, options: StopCommandCliOptions) => {
      await stopCommand({
        selector,
        cleanup: options.cleanup
      });
    });
}

export async function stopCommand(options: StopCommandOptions): Promise<void> {
  const config = await loadConfig(options.startDir);
  const session = await resolveSession(config.project.root, options.selector);

  if (!session) {
    throw new StopError(`No session found for '${options.selector}'.`);
  }

  if (session.state !== "running") {
    throw new StopError(`Session '${options.selector}' is already ${session.state}.`);
  }

  if (typeof session.runtimePid !== "number") {
    await updateSessionState(config.project.root, {
      id: session.id,
      state: "failed",
      runtimePid: null
    });
    process.stdout.write(`Session ${session.agentName} has no recorded runtime pid. Marked failed.\n`);
    process.stdout.write(`Worktree preserved: ${formatRelativePath(config.project.root, session.worktreePath)}\n`);
    return;
  }

  const isRuntimeAlive = options.isRuntimeAlive ?? isProcessAlive;
  const stopRuntime = options.stopRuntime ?? stopProcess;
  let nextState: SessionRecord["state"] = "stopped";

  const wasAlive = isRuntimeAlive(session.runtimePid);
  const stopped = await stopRuntime(session.runtimePid);

  if (!wasAlive) {
    nextState = "failed";
  } else if (!stopped) {
    nextState = "stopped";
  }

  await updateSessionState(config.project.root, {
    id: session.id,
    state: nextState,
    runtimePid: null
  });

  if (options.cleanup) {
    const removeSessionWorktree = options.removeSessionWorktree ?? removeWorktree;

    try {
      await removeSessionWorktree(config.project.root, {
        agentName: session.agentName,
        branch: session.branch,
        path: session.worktreePath,
        baseBranch: config.project.canonicalBranch
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new StopError(`Stopped ${session.agentName}, but cleanup failed: ${message}`);
    }
  }

  if (nextState === "failed") {
    process.stdout.write(`Session ${session.agentName} was already not running. Marked failed.\n`);
  } else {
    process.stdout.write(`Stopped ${session.agentName}\n`);
  }

  if (options.cleanup) {
    process.stdout.write("Cleanup: removed worktree and branch.\n");
  } else {
    process.stdout.write(`Worktree preserved: ${formatRelativePath(config.project.root, session.worktreePath)}\n`);
  }
}

async function resolveSession(projectRoot: string, selector: string): Promise<SessionRecord | undefined> {
  const byId = await getSessionById(projectRoot, selector);

  if (byId) {
    return byId;
  }

  return await findLatestSessionByAgent(projectRoot, normalizeAgentName(selector));
}

function formatRelativePath(projectRoot: string, path: string): string {
  const relativePath = relative(projectRoot, path);
  return relativePath.length > 0 ? relativePath : ".";
}
