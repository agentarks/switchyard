import { readFile } from "node:fs/promises";
import process from "node:process";
import { Command } from "commander";
import { loadConfig } from "../config.js";
import { LogsError } from "../errors.js";
import { getSessionLogPath } from "../logs/path.js";
import { resolveSessionByIdOrAgent, formatSessionSelectorAmbiguousMessage } from "./session-selector.js";
import type { SessionRecord } from "../sessions/types.js";

const DEFAULT_TAIL_LINES = 200;

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

  process.stdout.write(`Logs for ${session.agentName} (${session.id}):\n`);
  process.stdout.write(`Agent: ${session.agentName}\n`);
  process.stdout.write(`Session: ${session.id}\n`);
  process.stdout.write(`Log: ${sessionLog.relativePath}\n`);

  let transcript: string;

  try {
    transcript = await readFile(sessionLog.path, "utf8");
  } catch (error) {
    if (isMissingFileError(error)) {
      process.stdout.write(`No transcript file exists yet for session ${session.id}.\n`);
      return;
    }

    throw new LogsError(`Failed to read transcript for '${session.id}': ${formatErrorMessage(error)}`);
  }

  const renderedTranscript = options.showAll ? transcript : tailTranscript(transcript, DEFAULT_TAIL_LINES);
  process.stdout.write(renderedTranscript);

  if (!renderedTranscript.endsWith("\n")) {
    process.stdout.write("\n");
  }
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

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

function formatErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
