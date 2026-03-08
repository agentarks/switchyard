import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { RuntimeError } from "../../errors.js";

const DEFAULT_READY_TIMEOUT_MS = 500;

export interface RuntimeCommand {
  command: string;
  args: string[];
}

export interface SpawnedRuntimeProcess {
  command: RuntimeCommand;
  pid: number;
}

export interface SpawnedRuntimeSession extends SpawnedRuntimeProcess {
  readyAfterMs: number;
}

export interface SpawnCodexSessionOptions {
  runtimeArgs?: string[];
  worktreePath: string;
  readyTimeoutMs?: number;
  onSpawned?: (runtime: SpawnedRuntimeProcess) => void | Promise<void>;
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

  return await waitForChildReady(child, command, {
    readyTimeoutMs: options.readyTimeoutMs ?? DEFAULT_READY_TIMEOUT_MS,
    onSpawned: options.onSpawned
  });
}

async function waitForChildReady(
  child: ChildProcess,
  command: RuntimeCommand,
  options: { readyTimeoutMs: number; onSpawned?: (runtime: SpawnedRuntimeProcess) => void | Promise<void> }
): Promise<SpawnedRuntimeSession> {
  return await new Promise<SpawnedRuntimeSession>((resolve, reject) => {
    let settled = false;
    let readyTimer: NodeJS.Timeout | undefined;

    const cleanup = (): void => {
      child.removeListener("error", handleError);
      child.removeListener("exit", handleExit);

      if (readyTimer) {
        clearTimeout(readyTimer);
        readyTimer = undefined;
      }
    };

    const fail = (error: RuntimeError): void => {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();
      reject(error);
    };

    const succeed = (pid: number): void => {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();
      child.unref();
      resolve({
        command,
        pid,
        readyAfterMs: options.readyTimeoutMs
      });
    };

    const handleError = (error: Error): void => {
      fail(new RuntimeError(`Failed to start Codex: ${error.message}`));
    };

    const handleExit = (code: number | null, signal: NodeJS.Signals | null): void => {
      fail(new RuntimeError(formatEarlyExitMessage(code, signal)));
    };

    child.once("error", handleError);
    child.once("exit", handleExit);
    child.once("spawn", () => {
      if (typeof child.pid !== "number") {
        fail(new RuntimeError("Codex started without a process id."));
        return;
      }

      const runtime = {
        command,
        pid: child.pid
      };

      Promise.resolve(options.onSpawned?.(runtime))
        .then(() => {
          if (settled) {
            return;
          }

          readyTimer = setTimeout(() => {
            succeed(runtime.pid);
          }, options.readyTimeoutMs);
        })
        .catch((error: unknown) => {
          const message = error instanceof Error ? error.message : String(error);
          fail(new RuntimeError(`Codex spawned but readiness setup failed: ${message}`));
        });
    });
  });
}

function formatEarlyExitMessage(code: number | null, signal: NodeJS.Signals | null): string {
  const outcome = signal
    ? `signal ${signal}`
    : code === null
      ? "an unknown status"
      : `exit code ${code}`;

  return `Codex exited before Switchyard marked the session ready (${outcome}).`;
}
