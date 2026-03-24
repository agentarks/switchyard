import { writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import type { RunMergePolicy } from "../orchestration/types.js";
import { summarizeTask } from "./task.js";

interface WriteObjectiveSpecInput {
  projectRoot: string;
  runId: string;
  createdAt: string;
  objective: string;
  targetBranch: string;
  integrationBranch: string;
  mergePolicy: RunMergePolicy;
}

export interface ObjectiveSpecRecord {
  path: string;
  relativePath: string;
  objectiveSummary: string;
}

export async function writeObjectiveSpec(input: WriteObjectiveSpecInput): Promise<ObjectiveSpecRecord> {
  const path = join(input.projectRoot, ".switchyard", "objectives", `${input.runId}.md`);
  const objectiveSummary = summarizeTask(input.objective);

  await writeFile(path, buildObjectiveDocument(input), "utf8");

  return {
    path,
    relativePath: formatRelativePath(input.projectRoot, path),
    objectiveSummary
  };
}

function buildObjectiveDocument(input: WriteObjectiveSpecInput): string {
  return [
    "# Switchyard Objective Spec",
    "",
    `Run: ${input.runId}`,
    `Created: ${input.createdAt}`,
    `Target branch: ${input.targetBranch}`,
    `Integration branch: ${input.integrationBranch}`,
    `Merge policy: ${input.mergePolicy}`,
    "Role: lead",
    "",
    "## Objective",
    "",
    input.objective.trimEnd(),
    ""
  ].join("\n");
}

function formatRelativePath(projectRoot: string, path: string): string {
  const relativePath = relative(projectRoot, path);
  return relativePath.length > 0 ? relativePath : ".";
}
