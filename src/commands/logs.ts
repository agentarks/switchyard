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
  const normalizedTranscript = normalizeTranscriptForDisplay(renderStructuredTranscript(renderedTranscript));
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

function renderStructuredTranscript(transcript: string): string {
  const lines = transcript.split(/\r?\n/);
  const renderedLines: string[] = [];

  for (const line of lines) {
    if (line.length === 0) {
      continue;
    }

    renderedLines.push(...renderTranscriptLine(line));
  }

  return renderedLines.join("\n");
}

function renderTranscriptLine(line: string): string[] {
  const event = parseJsonLine(line);

  if (!event || typeof event.type !== "string") {
    return [line];
  }

  switch (event.type) {
    case "thread.started":
    case "turn.started":
      return [];
    case "turn.completed":
      return renderTurnCompleted(event);
    case "turn.failed":
      return [`Turn failed: ${formatEventMessage(event.error?.message, "unknown error")}`];
    case "error":
      return [`Error: ${formatEventMessage(event.message, "unknown error")}`];
    case "item.started":
    case "item.completed":
      return renderItemEvent(event.item);
    default:
      return [line];
  }
}

function renderTurnCompleted(event: {
  usage?: {
    input_tokens?: number;
    cached_input_tokens?: number;
    output_tokens?: number;
  };
}): string[] {
  const lines = ["Turn completed."];

  if (event.usage) {
    lines.push(
      `Usage: input=${formatTokenCount(event.usage.input_tokens)}, cached=${formatTokenCount(event.usage.cached_input_tokens)}, output=${formatTokenCount(event.usage.output_tokens)}`
    );
  }

  return lines;
}

function renderItemEvent(item: unknown): string[] {
  if (!item || typeof item !== "object" || !("type" in item) || typeof item.type !== "string") {
    return [];
  }

  if (item.type === "agent_message") {
    const text = "text" in item && typeof item.text === "string" ? item.text.trim() : "";
    return text.length > 0 ? [text] : [];
  }

  if (item.type === "command_execution") {
    return renderCommandExecutionItem(item);
  }

  if (item.type === "error") {
    const message = "message" in item && typeof item.message === "string" ? item.message : "unknown error";
    return [`Error: ${message}`];
  }

  return [];
}

function renderCommandExecutionItem(item: Record<string, unknown>): string[] {
  const command = typeof item.command === "string" ? item.command : "unknown command";
  const status = typeof item.status === "string" ? item.status : "";
  const lines: string[] = [];

  if (status === "in_progress") {
    lines.push(`Command started: ${command}`);
    return lines;
  }

  if (typeof item.exit_code === "number") {
    lines.push(`Command exited with ${item.exit_code}: ${command}`);
  } else {
    lines.push(`Command finished: ${command}`);
  }

  if (typeof item.aggregated_output === "string" && item.aggregated_output.length > 0) {
    lines.push("Output:");
    lines.push(...formatIndentedBlock(item.aggregated_output));
  }

  return lines;
}

function formatIndentedBlock(text: string): string[] {
  return text
    .replace(/\n$/, "")
    .split(/\r?\n/)
    .map((line) => `  ${line}`);
}

function parseJsonLine(line: string): Record<string, any> | undefined {
  try {
    return JSON.parse(line) as Record<string, any>;
  } catch {
    return undefined;
  }
}

function formatEventMessage(value: unknown, fallback: string): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function formatTokenCount(value: unknown): string {
  return typeof value === "number" ? String(value) : "?";
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
