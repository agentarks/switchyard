import { relative } from "node:path";
import process from "node:process";
import { Command } from "commander";
import { loadConfig } from "../config.js";
import { isProcessAlive } from "../runtimes/process.js";
import { listSessions, updateSessionState } from "../sessions/store.js";

interface StatusOptions {
  startDir?: string;
  isRuntimeAlive?: (pid: number) => boolean;
}

export function createStatusCommand(): Command {
  return new Command("status")
    .description("Show active and recent agent sessions")
    .argument("[args...]", "Arguments reserved for future filter support")
    .action(async () => {
      await statusCommand();
    });
}

export async function statusCommand(options: StatusOptions = {}): Promise<void> {
  const config = await loadConfig(options.startDir);
  await reconcileRunningSessions(config.project.root, options.isRuntimeAlive ?? isProcessAlive);
  const sessions = await listSessions(config.project.root);

  if (sessions.length === 0) {
    process.stdout.write("No Switchyard sessions recorded yet.\n");
    return;
  }

  process.stdout.write(`Sessions for ${config.project.name}:\n`);
  process.stdout.write("STATE\tAGENT\tBRANCH\tWORKTREE\tUPDATED\n");

  for (const session of sessions) {
    const worktree = formatWorktreePath(config.project.root, session.worktreePath);
    process.stdout.write(`${session.state}\t${session.agentName}\t${session.branch}\t${worktree}\t${session.updatedAt}\n`);
  }
}

async function reconcileRunningSessions(
  projectRoot: string,
  isRuntimeAlive: (pid: number) => boolean
): Promise<void> {
  const sessions = await listSessions(projectRoot);

  for (const session of sessions) {
    if (session.state !== "running") {
      continue;
    }

    if (typeof session.runtimePid !== "number" || !isRuntimeAlive(session.runtimePid)) {
      await updateSessionState(projectRoot, {
        id: session.id,
        state: "failed",
        runtimePid: null
      });
    }
  }
}

function formatWorktreePath(projectRoot: string, worktreePath: string): string {
  const relativePath = relative(projectRoot, worktreePath);
  return relativePath.length > 0 ? relativePath : ".";
}
