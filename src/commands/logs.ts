import { readFile } from "node:fs/promises";
import process from "node:process";
import { Command } from "commander";
import { loadConfig } from "../config.js";
import { LogsError } from "../errors.js";
import { getSessionLogPath } from "../logs/path.js";
import { resolveSessionByIdOrAgent, formatSessionSelectorAmbiguousMessage } from "./session-selector.js";
import type { SessionRecord } from "../sessions/types.js";

const DEFAULT_TAIL_LINES = 200;
const BSD_SCRIPT_CONTROL_PREFIX = /^(?:\^[A-Z@\[\\\]\^_?]\x08\x08)+/;

interface LogsCommandOptions {
  selector: string;
  showAll?: boolean;
  startDir?: string;
}

export function createLogsCommand(): Command {
  return new Command("logs")
    .description("Show the detached runtime transcript for one session")
    .argument("<session>", "Session id or agent name")
    .option("--all", "Show the full transcript instead of the last 200 lines")
    .action(async (selector: string, options: { all?: boolean }) => {
      await logsCommand({ selector, showAll: options.all === true });
    });
}

export async function logsCommand(options: LogsCommandOptions): Promise<void> {
  const config = await loadConfig(options.startDir);
  const session = await resolveSession(config.project.root, options.selector);

  if (!session) {
    throw new LogsError(`No session found for '${options.selector}'.`);
  }

  const sessionLog = getSessionLogPath(config.project.root, session.agentName, session.id);
  const heading = [
    `Logs for ${session.agentName} (${session.id}):`,
    `Agent: ${session.agentName}`,
    `Session: ${session.id}`,
    `Log: ${sessionLog.relativePath}`
  ].join("\n");

  let transcript: string;

  try {
    transcript = await readFile(sessionLog.path, "utf8");
  } catch (error) {
    if (isMissingFileError(error)) {
      await writeLogsOutput(`${heading}\nNo transcript file exists yet for session ${session.id}.\n`);
      return;
    }

    throw new LogsError(`Failed to read transcript for '${session.id}': ${formatErrorMessage(error)}`);
  }

  const renderedTranscript = options.showAll ? transcript : tailTranscript(transcript, DEFAULT_TAIL_LINES);
  const normalizedTranscript = normalizeTranscriptForDisplay(renderedTranscript);
  const output = `${heading}\n${normalizedTranscript}${normalizedTranscript.endsWith("\n") ? "" : "\n"}`;
  await writeLogsOutput(output);
}

async function resolveSession(projectRoot: string, selector: string): Promise<SessionRecord | undefined> {
  try {
    return await resolveSessionByIdOrAgent(projectRoot, selector, (ambiguity) => {
      return new LogsError(formatSessionSelectorAmbiguousMessage(selector, ambiguity));
    });
  } catch (error) {
    if (error instanceof LogsError) {
      throw error;
    }

    throw error;
  }
}

function tailTranscript(transcript: string, lineCount: number): string {
  const lines = transcript.split(/\r?\n/);

  if (lines.at(-1) === "") {
    lines.pop();
  }

  return lines.slice(-lineCount).join("\n");
}

function normalizeTranscriptForDisplay(transcript: string): string {
  return transcript.replace(BSD_SCRIPT_CONTROL_PREFIX, "");
}

async function writeLogsOutput(output: string): Promise<void> {
  const wroteOutput = await writeStdout(output);

  if (!wroteOutput) {
    return;
  }
}

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

function isBrokenPipeError(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === "object" && error !== null && "code" in error && error.code === "EPIPE";
}

async function writeStdout(output: string): Promise<boolean> {
  return await new Promise<boolean>((resolve, reject) => {
    let settled = false;

    const finish = (result: boolean, error?: unknown): void => {
      if (settled) {
        return;
      }

      settled = true;
      process.stdout.off("error", handleError);

      if (error !== undefined) {
        reject(error);
        return;
      }

      resolve(result);
    };

    const handleError = (error: unknown): void => {
      if (isBrokenPipeError(error)) {
        finish(false);
        return;
      }

      finish(false, new LogsError(`Failed to write transcript output: ${formatErrorMessage(error)}`));
    };

    process.stdout.once("error", handleError);

    try {
      process.stdout.write(output, (error?: Error | null) => {
        if (error) {
          if (isBrokenPipeError(error)) {
            finish(false);
            return;
          }

          finish(false, new LogsError(`Failed to write transcript output: ${formatErrorMessage(error)}`));
          return;
        }

        finish(true);
      });
    } catch (error) {
      if (isBrokenPipeError(error)) {
        finish(false);
        return;
      }

      finish(false, error);
    }
  });
}

function formatErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
