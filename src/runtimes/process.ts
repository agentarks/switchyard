import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";
import { RuntimeError } from "../errors.js";

const DEFAULT_STOP_TIMEOUT_MS = 1500;
const DEFAULT_POLL_INTERVAL_MS = 50;

type ProcessSignal = NodeJS.Signals | 0;
type SignalProcess = (pid: number, signal?: ProcessSignal) => void;

interface StopProcessOptions {
  timeoutMs?: number;
  pollIntervalMs?: number;
  signalProcess?: SignalProcess;
  isAlive?: (pid: number) => boolean;
}

export function isProcessAlive(pid: number, signalProcess: SignalProcess = process.kill.bind(process)): boolean {
  try {
    signalProcess(pid, 0);
    return true;
  } catch (error) {
    if (isMissingProcessError(error)) {
      return false;
    }

    if (isPermissionError(error)) {
      return true;
    }

    throw toRuntimeError(error, `Failed to check liveness for process ${pid}`);
  }
}

export async function stopProcess(pid: number, options: StopProcessOptions = {}): Promise<boolean> {
  const signalProcess = options.signalProcess ?? process.kill.bind(process);
  const isAlive = options.isAlive ?? ((candidatePid: number) => isProcessAlive(candidatePid, signalProcess));
  const timeoutMs = options.timeoutMs ?? DEFAULT_STOP_TIMEOUT_MS;
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;

  if (!isAlive(pid)) {
    return false;
  }

  const sigtermResult = trySignal(signalProcess, pid, "SIGTERM");
  if (sigtermResult === "gone") {
    return true;
  }

  if (await waitForExit(pid, isAlive, timeoutMs, pollIntervalMs)) {
    return true;
  }

  const sigkillResult = trySignal(signalProcess, pid, "SIGKILL");
  if (sigkillResult === "gone") {
    return true;
  }

  if (await waitForExit(pid, isAlive, timeoutMs, pollIntervalMs)) {
    return true;
  }

  throw new RuntimeError(`Timed out stopping process ${pid}.`);
}

async function waitForExit(
  pid: number,
  isAlive: (pid: number) => boolean,
  timeoutMs: number,
  pollIntervalMs: number
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (!isAlive(pid)) {
      return true;
    }

    await delay(pollIntervalMs);
  }

  return !isAlive(pid);
}

function trySignal(signalProcess: SignalProcess, pid: number, signal: NodeJS.Signals): "sent" | "gone" {
  try {
    signalProcess(pid, signal);
    return "sent";
  } catch (error) {
    if (isMissingProcessError(error)) {
      return "gone";
    }

    throw toRuntimeError(error, `Failed to send ${signal} to process ${pid}`);
  }
}

function isMissingProcessError(error: unknown): boolean {
  return isErrorWithCode(error, "ESRCH");
}

function isPermissionError(error: unknown): boolean {
  return isErrorWithCode(error, "EPERM");
}

function isErrorWithCode(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}

function toRuntimeError(error: unknown, prefix: string): RuntimeError {
  const message = error instanceof Error ? error.message : String(error);
  return new RuntimeError(`${prefix}: ${message}`);
}
