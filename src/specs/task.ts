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
  runId?: string;
  role?: string;
  objectiveTaskId?: string;
  taskSummary?: string;
  targetBranch?: string;
  integrationBranch?: string;
  objectiveSpecPath?: string;
  resultEnvelopePath?: string;
  mergePolicy?: string;
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
  const taskSpecPath = getRelativeTaskSpecPath(projectRoot, agentName, sessionId);
  const document = await readTaskSpecDocument(projectRoot, agentName, sessionId);

  if (!document) {
    return undefined;
  }

  const instruction = extractTaskInstruction(document);
  const taskSummary = extractMetadataValue(document, "Task summary");

  if (!instruction) {
    return undefined;
  }

  return {
    taskSummary: taskSummary ?? summarizeTask(instruction),
    taskSpecPath
  };
}

export async function readTaskInstruction(
  projectRoot: string,
  agentName: string,
  sessionId: string
): Promise<string | undefined> {
  const document = await readTaskSpecDocument(projectRoot, agentName, sessionId);
  if (!document) {
    return undefined;
  }
  return extractTaskInstruction(document);
}

export function getRelativeTaskSpecPath(projectRoot: string, agentName: string, sessionId: string): string {
  return formatRelativePath(projectRoot, getTaskSpecPath(projectRoot, agentName, sessionId));
}

function buildTaskSpecDocument(input: WriteTaskSpecInput): string {
  return [
    "# Switchyard Task Handoff",
    "",
    `Session: ${input.sessionId}`,
    ...(typeof input.runId === "string" ? [`Run: ${input.runId}`] : []),
    `Agent: ${input.agentName}`,
    ...(typeof input.role === "string" ? [`Role: ${input.role}`] : []),
    `Created: ${input.createdAt}`,
    ...(typeof input.objectiveTaskId === "string" ? [`Objective task: ${input.objectiveTaskId}`] : []),
    ...(typeof input.taskSummary === "string" ? [`Task summary: ${input.taskSummary}`] : []),
    ...(typeof input.targetBranch === "string" ? [`Target branch: ${input.targetBranch}`] : []),
    ...(typeof input.integrationBranch === "string" ? [`Integration branch: ${input.integrationBranch}`] : []),
    `Branch: ${input.branch}`,
    `Base: ${input.baseBranch ?? "-"}`,
    `Worktree: ${formatRelativePath(input.projectRoot, input.worktreePath)}`,
    ...(typeof input.objectiveSpecPath === "string" ? [`Objective spec: ${input.objectiveSpecPath}`] : []),
    ...(typeof input.resultEnvelopePath === "string" ? [`Result envelope: ${input.resultEnvelopePath}`] : []),
    ...(typeof input.mergePolicy === "string" ? [`Merge policy: ${input.mergePolicy}`] : []),
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

async function readTaskSpecDocument(
  projectRoot: string,
  agentName: string,
  sessionId: string
): Promise<string | undefined> {
  const path = getTaskSpecPath(projectRoot, agentName, sessionId);

  try {
    return await readFile(path, "utf8");
  } catch {
    return undefined;
  }
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

function extractMetadataValue(document: string, label: string): string | undefined {
  const pattern = new RegExp(`^${escapeRegExp(label)}: (.+)$`, "m");
  const match = document.match(pattern);
  return match?.[1]?.trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function formatRelativePath(projectRoot: string, path: string): string {
  const relativePath = relative(projectRoot, path);
  return relativePath.length > 0 ? relativePath : ".";
}
