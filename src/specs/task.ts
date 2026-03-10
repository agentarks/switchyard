import { readFile, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";

const TASK_SUMMARY_LIMIT = 120;

interface WriteTaskSpecInput {
  projectRoot: string;
  sessionId: string;
  agentName: string;
  task: string;
  createdAt: string;
  branch: string;
  baseBranch: string | null;
  worktreePath: string;
}

export interface TaskSpecRecord {
  path: string;
  relativePath: string;
  taskSummary: string;
}

export interface StoredTaskHandoff {
  taskSummary: string;
  taskSpecPath: string;
}

export async function writeTaskSpec(input: WriteTaskSpecInput): Promise<TaskSpecRecord> {
  const path = getTaskSpecPath(input.projectRoot, input.agentName, input.sessionId);
  const taskSummary = summarizeTask(input.task);

  await writeFile(path, buildTaskSpecDocument(input), "utf8");

  return {
    path,
    relativePath: formatRelativePath(input.projectRoot, path),
    taskSummary
  };
}

export function summarizeTask(task: string): string {
  const normalizedTask = task.replace(/\s+/g, " ").trim();

  if (normalizedTask.length <= TASK_SUMMARY_LIMIT) {
    return normalizedTask;
  }

  return `${normalizedTask.slice(0, TASK_SUMMARY_LIMIT - 3)}...`;
}

export async function readTaskSpecHandoff(
  projectRoot: string,
  agentName: string,
  sessionId: string
): Promise<StoredTaskHandoff | undefined> {
  const path = getTaskSpecPath(projectRoot, agentName, sessionId);
  const taskSpecPath = formatRelativePath(projectRoot, path);

  let document: string;
  try {
    document = await readFile(path, "utf8");
  } catch {
    return undefined;
  }

  const instruction = extractTaskInstruction(document);

  if (!instruction) {
    return undefined;
  }

  return {
    taskSummary: summarizeTask(instruction),
    taskSpecPath
  };
}

function buildTaskSpecDocument(input: WriteTaskSpecInput): string {
  return [
    "# Switchyard Task Handoff",
    "",
    `Session: ${input.sessionId}`,
    `Agent: ${input.agentName}`,
    `Created: ${input.createdAt}`,
    `Branch: ${input.branch}`,
    `Base: ${input.baseBranch ?? "-"}`,
    `Worktree: ${formatRelativePath(input.projectRoot, input.worktreePath)}`,
    "",
    "## Instruction",
    "",
    input.task.trimEnd(),
    ""
  ].join("\n");
}

function getTaskSpecPath(projectRoot: string, agentName: string, sessionId: string): string {
  return join(projectRoot, ".switchyard", "specs", `${agentName}-${sessionId}.md`);
}

function extractTaskInstruction(document: string): string | undefined {
  const marker = "\n## Instruction\n\n";
  const markerIndex = document.indexOf(marker);

  if (markerIndex === -1) {
    return undefined;
  }

  const instruction = document.slice(markerIndex + marker.length).trim();
  return instruction.length > 0 ? instruction : undefined;
}

function formatRelativePath(projectRoot: string, path: string): string {
  const relativePath = relative(projectRoot, path);
  return relativePath.length > 0 ? relativePath : ".";
}
