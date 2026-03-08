import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { RuntimeError } from "../../errors.js";

export interface RuntimeCommand {
  command: string;
  args: string[];
}

export interface SpawnedRuntimeSession {
  command: RuntimeCommand;
  pid: number;
}

export interface SpawnCodexSessionOptions {
  runtimeArgs?: string[];
  worktreePath: string;
  spawnProcess?: typeof spawn;
}

export function buildCodexCommand(runtimeArgs: string[] = []): RuntimeCommand {
  return {
    command: "codex",
    args: runtimeArgs
  };
}

export async function spawnCodexSession(options: SpawnCodexSessionOptions): Promise<SpawnedRuntimeSession> {
  const command = buildCodexCommand(options.runtimeArgs);
  const spawnProcess = options.spawnProcess ?? spawn;
  const child = spawnProcess(command.command, command.args, {
    cwd: options.worktreePath,
    detached: true,
    stdio: "ignore"
  });

  return await waitForChildSpawn(child, command);
}

async function waitForChildSpawn(child: ChildProcess, command: RuntimeCommand): Promise<SpawnedRuntimeSession> {
  return await new Promise<SpawnedRuntimeSession>((resolve, reject) => {
    let settled = false;

    child.once("error", (error) => {
      if (settled) {
        return;
      }

      settled = true;
      reject(new RuntimeError(`Failed to start Codex: ${error.message}`));
    });

    child.once("spawn", () => {
      if (settled) {
        return;
      }

      if (typeof child.pid !== "number") {
        settled = true;
        reject(new RuntimeError("Codex started without a process id."));
        return;
      }

      settled = true;
      child.unref();
      resolve({
        command,
        pid: child.pid
      });
    });
  });
}
