import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parse } from "yaml";
import type { RepoWorkflowDocuments } from "./types.js";

export const STARTUP_MARKER = "repo-workflow-startup: repo-workflow-v1";

export const MANDATORY_STARTUP_DOCS = [
  "AGENTS.md",
  "PLAN.md",
  "docs/dev-workflow.md",
  "docs/current-state.md",
  "docs/next-steps.md",
  "docs/focus-tracker.md",
  "docs/backlog.md",
  "docs/roadmap.md",
  "docs/milestones.md"
] as const;

export const PROJECTION_DOCS = [
  "docs/current-state.md",
  "docs/next-steps.md",
  "docs/focus-tracker.md"
] as const;

const PROJECTION_BLOCK_START = "<!-- repo-workflow-projection:start -->";
const PROJECTION_BLOCK_END = "<!-- repo-workflow-projection:end -->";
const MILESTONE_BLOCK_START = "<!-- repo-workflow-milestones:start -->";
const MILESTONE_BLOCK_END = "<!-- repo-workflow-milestones:end -->";

export async function loadRepoWorkflowDocuments(projectRoot: string): Promise<RepoWorkflowDocuments> {
  const projections: Record<string, unknown> = {};

  for (const relativePath of PROJECTION_DOCS) {
    projections[relativePath] = await readDelimitedYamlBlock(
      projectRoot,
      relativePath,
      PROJECTION_BLOCK_START,
      PROJECTION_BLOCK_END,
      "projection"
    );
  }

  return {
    campaign: await readYamlDocument(projectRoot, "docs/repo-workflow/campaign.yaml"),
    chunks: await readYamlDocument(projectRoot, "docs/repo-workflow/chunks.yaml"),
    attempts: await readYamlDocument(projectRoot, "docs/repo-workflow/attempts.yaml"),
    projections,
    milestoneRegistry: await readDelimitedYamlBlock(
      projectRoot,
      "docs/milestones.md",
      MILESTONE_BLOCK_START,
      MILESTONE_BLOCK_END,
      "milestone registry"
    ),
    sliceLedgerRowRefs: await readSliceLedgerRowRefs(projectRoot)
  };
}

export async function readStartupDoc(projectRoot: string, relativePath: string): Promise<string> {
  return await readFile(join(projectRoot, relativePath), "utf8");
}

async function readYamlDocument(projectRoot: string, relativePath: string): Promise<unknown> {
  const contents = await readTextFile(projectRoot, relativePath);
  return parseYaml(contents, relativePath, "YAML document");
}

async function readDelimitedYamlBlock(
  projectRoot: string,
  relativePath: string,
  startMarker: string,
  endMarker: string,
  blockKind: string
): Promise<unknown> {
  const contents = await readTextFile(projectRoot, relativePath);
  const yaml = extractDelimitedYamlBlock(contents, relativePath, startMarker, endMarker, blockKind);
  return parseYaml(yaml, relativePath, blockKind);
}

function extractDelimitedYamlBlock(
  contents: string,
  relativePath: string,
  startMarker: string,
  endMarker: string,
  blockKind: string
): string {
  const startIndexes = findAllIndexes(contents, startMarker);
  const endIndexes = findAllIndexes(contents, endMarker);
  const startIndex = startIndexes[0] ?? -1;
  const endIndex = endIndexes[0] ?? -1;

  if (startIndexes.length !== 1 || endIndexes.length !== 1 || endIndex <= startIndex) {
    throw new Error(`${relativePath} is missing ${blockKind} block delimiters.`);
  }

  const betweenMarkers = contents.slice(startIndex + startMarker.length, endIndex).trim();
  const fencedMatch = betweenMarkers.match(/^```yaml\s*\n([\s\S]*?)\n```$/);

  if (!fencedMatch?.[1]) {
    throw new Error(`${relativePath} has an invalid ${blockKind} block.`);
  }

  return fencedMatch[1];
}

async function readSliceLedgerRowRefs(projectRoot: string): Promise<Set<string>> {
  const contents = await readTextFile(projectRoot, "docs/slice-ledger.md");
  const rowRefs = new Set<string>();

  for (const line of contents.split("\n")) {
    const match = line.match(/^\|\s*(S\d+)\s*\|/);
    if (match?.[1]) {
      rowRefs.add(match[1]);
    }
  }

  return rowRefs;
}

function findAllIndexes(contents: string, needle: string): number[] {
  const indexes: number[] = [];
  let fromIndex = 0;

  while (fromIndex < contents.length) {
    const index = contents.indexOf(needle, fromIndex);
    if (index === -1) {
      break;
    }

    indexes.push(index);
    fromIndex = index + needle.length;
  }

  return indexes;
}

function parseYaml(contents: string, relativePath: string, kind: string): unknown {
  try {
    return parse(contents);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to parse ${kind} in ${relativePath}: ${message}`);
  }
}

async function readTextFile(projectRoot: string, relativePath: string): Promise<string> {
  try {
    return await readFile(join(projectRoot, relativePath), "utf8");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to read ${relativePath}: ${message}`);
  }
}
