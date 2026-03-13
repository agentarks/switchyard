import { readFile } from "node:fs/promises";

export interface CodexTerminalState {
  outcome: "completed" | "failed";
  errorMessage?: string;
}

export async function readCodexTerminalState(logPath: string): Promise<CodexTerminalState | undefined> {
  let transcript: string;

  try {
    transcript = await readFile(logPath, "utf8");
  } catch (error) {
    if (isMissingFileError(error)) {
      return undefined;
    }

    throw error;
  }

  return parseCodexTerminalState(transcript);
}

export function parseCodexTerminalState(transcript: string): CodexTerminalState | undefined {
  const lines = transcript.split(/\r?\n/);

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index]?.trim();

    if (!line) {
      continue;
    }

    const event = parseJsonLine(line);

    if (!event || typeof event.type !== "string") {
      continue;
    }

    if (event.type === "turn.completed") {
      return {
        outcome: "completed"
      };
    }

    if (event.type === "turn.failed") {
      const error = typeof event.error === "object" && event.error !== null
        ? event.error as Record<string, unknown>
        : undefined;

      return {
        outcome: "failed",
        errorMessage: extractErrorMessage(error?.message)
      };
    }

    if (event.type === "error") {
      return {
        outcome: "failed",
        errorMessage: extractErrorMessage(event.message)
      };
    }
  }

  return undefined;
}

function parseJsonLine(line: string): Record<string, unknown> | undefined {
  try {
    return JSON.parse(line) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

function extractErrorMessage(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
