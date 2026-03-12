import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { closeSync, openSync } from "node:fs";
import process from "node:process";
import { RuntimeError } from "../../errors.js";

const DEFAULT_READY_TIMEOUT_MS = 500;
const SCRIPT_TYPESCRIPT_PATH = "/dev/null";

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
  logPath?: string;
  worktreePath: string;
  readyTimeoutMs?: number;
  onSpawned?: (runtime: SpawnedRuntimeProcess) => void | Promise<void>;
  spawnProcess?: typeof spawn;
  platform?: NodeJS.Platform;
}

export function buildCodexCommand(runtimeArgs: string[] = []): RuntimeCommand {
  return {
    command: "codex",
    args: runtimeArgs
  };
}

export async function spawnCodexSession(options: SpawnCodexSessionOptions): Promise<SpawnedRuntimeSession> {
  const command = buildCodexCommand(options.runtimeArgs);
  const launchCommand = buildCodexLaunchCommand(command, options.platform ?? process.platform, options.logPath);
  const spawnProcess = options.spawnProcess ?? spawn;
  let logFileDescriptor: number | undefined;

  if (launchCommand.command === command.command && typeof options.logPath === "string") {
    try {
      logFileDescriptor = openSync(options.logPath, "a");
    } catch (error) {
      throw new RuntimeError(
        `Failed to start Codex: unable to open transcript log '${options.logPath}': ${formatErrorMessage(error)}`
      );
    }
  }

  let child: ChildProcess;

  try {
    child = spawnProcess(launchCommand.command, launchCommand.args, {
      cwd: options.worktreePath,
      detached: true,
      stdio: typeof logFileDescriptor === "number"
        ? ["ignore", logFileDescriptor, logFileDescriptor]
        : "ignore"
    });
  } catch (error) {
    if (typeof logFileDescriptor === "number") {
      closeSync(logFileDescriptor);
    }

    throw error;
  }

  if (typeof logFileDescriptor === "number") {
    closeSync(logFileDescriptor);
  }

  return await waitForChildReady(child, {
    command,
    launchCommand,
    readyTimeoutMs: options.readyTimeoutMs ?? DEFAULT_READY_TIMEOUT_MS,
    onSpawned: options.onSpawned
  });
}

function buildCodexLaunchCommand(command: RuntimeCommand, platform: NodeJS.Platform, logPath?: string): RuntimeCommand {
  switch (platform) {
    case "darwin":
    case "freebsd":
    case "netbsd":
    case "openbsd":
      return {
        command: "script",
        args: ["-q", "-e", logPath ?? SCRIPT_TYPESCRIPT_PATH, command.command, ...command.args]
      };
    case "linux":
      return {
        command: "script",
        args: ["-q", "-e", logPath ?? SCRIPT_TYPESCRIPT_PATH, "--", command.command, ...command.args]
      };
    default:
      return command;
  }
}

async function waitForChildReady(
  child: ChildProcess,
  options: {
    command: RuntimeCommand;
    launchCommand: RuntimeCommand;
    readyTimeoutMs: number;
    onSpawned?: (runtime: SpawnedRuntimeProcess) => void | Promise<void>;
  }
): Promise<SpawnedRuntimeSession> {
  return await new Promise<SpawnedRuntimeSession>((resolve, reject) => {
    let settled = false;
    let readyTimer: NodeJS.Timeout | undefined;
    let readinessStartedAt = 0;

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
        command: options.command,
        pid,
        readyAfterMs: Math.max(0, Date.now() - readinessStartedAt)
      });
    };

    const handleError = (error: Error): void => {
      fail(new RuntimeError(formatSpawnError(error, options.launchCommand, options.command)));
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

      readinessStartedAt = Date.now();

      const runtime = {
        command: options.command,
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

function formatSpawnError(error: Error, launchCommand: RuntimeCommand, command: RuntimeCommand): string {
  if (launchCommand.command !== command.command && "code" in error && error.code === "ENOENT") {
    return "Failed to start Codex: pseudo-terminal wrapper 'script' is not available on PATH.";
  }

  return `Failed to start Codex: ${error.message}`;
}

function formatErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
