import { writeFile } from "node:fs/promises";
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

export async function writeTaskSpec(input: WriteTaskSpecInput): Promise<TaskSpecRecord> {
  const path = join(input.projectRoot, ".switchyard", "specs", `${input.agentName}-${input.sessionId}.md`);
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

function formatRelativePath(projectRoot: string, path: string): string {
  const relativePath = relative(projectRoot, path);
  return relativePath.length > 0 ? relativePath : ".";
}
