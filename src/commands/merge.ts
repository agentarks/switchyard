import { execFile } from "node:child_process";
import { access, realpath } from "node:fs/promises";
import { relative } from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import { Command } from "commander";
import { loadConfig } from "../config.js";
import { recordEventBestEffort, recordEventWithFallback, type EventRecorder } from "../events/store.js";
import { MergeError } from "../errors.js";
import { listMeaningfulDirtyEntries } from "../git/status.js";
import { formatSessionSelectorAmbiguousMessage, resolveSessionByIdOrAgent } from "./session-selector.js";
import { updateLatestRunForSession } from "../runs/store.js";
import type { UpdateRunInput } from "../runs/types.js";
import { isActiveSessionState, type SessionRecord } from "../sessions/types.js";

const execFileAsync = promisify(execFile);
const MAX_DIRTY_ENTRY_DETAILS = 5;
const MAX_CONFLICT_PATH_DETAILS = 5;
type MergeFailurePayload = Record<string, string | number | boolean>;

class RecordedMergeError extends MergeError {
  readonly payload: MergeFailurePayload;

  constructor(message: string, payload: MergeFailurePayload) {
    super(message);
    this.payload = payload;
  }
}

interface MergeCommandOptions {
  selector: string;
  startDir?: string;
  recordEvent?: EventRecorder;
  updateLatestRun?: (projectRoot: string, sessionId: string, input: Omit<UpdateRunInput, "id">) => Promise<unknown>;
}

export function createMergeCommand(): Command {
  return new Command("merge")
    .description("Merge one preserved agent branch into the canonical branch")
    .argument("<session>", "Session id or agent name")
    .action(async (selector: string) => {
      await mergeCommand({ selector });
    });
}

export async function mergeCommand(options: MergeCommandOptions): Promise<void> {
  const config = await loadConfig(options.startDir);
  const recordEvent = options.recordEvent ?? recordEventBestEffort;
  const updateLatestRun = options.updateLatestRun ?? updateLatestRunForSession;
  const session = await resolveSession(config.project.root, options.selector);

  if (!session) {
    throw new MergeError(`No session found for '${options.selector}'.`);
  }

  try {
    await mergeResolvedSession(config.project.root, config.project.canonicalBranch, session, recordEvent, updateLatestRun, options.selector);
  } catch (error) {
    if (error instanceof RecordedMergeError) {
      await recordEventWithFallback(recordEvent, config.project.root, {
        sessionId: session.id,
        agentName: session.agentName,
        eventType: "merge.failed",
        payload: error.payload
      });
      process.stderr.write(`Session: ${session.id}\n`);
    }

    throw error;
  }
}

async function mergeResolvedSession(
  projectRoot: string,
  configuredCanonicalBranch: string,
  session: SessionRecord,
  recordEvent: EventRecorder,
  updateLatestRun: (projectRoot: string, sessionId: string, input: Omit<UpdateRunInput, "id">) => Promise<unknown>,
  selector: string
): Promise<void> {
  const branch = session.branch.trim();
  const normalizedCanonicalBranch = configuredCanonicalBranch.trim();
  const sessionBaseBranch = session.baseBranch?.trim() ?? "";

  if (isActiveSessionState(session.state)) {
    throw recordedMergeError(
      `Session '${selector}' is still ${session.state}. Stop it before merging.`,
      withBranchPayload(session, {
        reason: "session_active",
        state: session.state
      })
    );
  }

  if (branch.length === 0) {
    throw recordedMergeError(
      `Session ${session.id} has no preserved branch metadata.`,
      { reason: "missing_branch_metadata" }
    );
  }

  if (normalizedCanonicalBranch.length === 0) {
    throw recordedMergeError(
      "Configured canonical branch is empty.",
      withBranchPayload(session, {
        reason: "missing_canonical_branch_config"
      })
    );
  }

  if (sessionBaseBranch.length === 0) {
    throw recordedMergeError(
      `Session ${session.id} has no stored base branch metadata. Switchyard cannot safely choose a merge target for this legacy session; review it and merge manually with git.`,
      withBranchPayload(session, {
        reason: "missing_base_branch_metadata"
      })
    );
  }

  if (sessionBaseBranch !== normalizedCanonicalBranch) {
    throw recordedMergeError(
      `Session ${session.id} was created against '${sessionBaseBranch}', but Switchyard is now configured to merge into '${normalizedCanonicalBranch}'. Review the session and either restore that config target or merge manually with git.`,
      withBranchPayload(session, {
        reason: "canonical_branch_drift",
        canonicalBranch: sessionBaseBranch,
        configuredCanonicalBranch: normalizedCanonicalBranch
      })
    );
  }

  const canonicalBranch = sessionBaseBranch;

  if (branch === canonicalBranch) {
    throw recordedMergeError(
      `Session ${session.id} points at '${branch}', which matches the canonical branch.`,
      withBranchPayload(session, {
        reason: "branch_matches_canonical",
        canonicalBranch
      })
    );
  }

  await ensureLocalBranchExists(projectRoot, session, branch, canonicalBranch);
  await ensurePreservedWorktreeIsClean(projectRoot, session);
  await ensureNoMergeInProgress(projectRoot, session);
  await ensureProjectRootIsClean(projectRoot, session);

  const currentBranch = await getCurrentBranch(projectRoot);

  if (currentBranch !== canonicalBranch) {
    await switchToCanonicalBranch(projectRoot, session, canonicalBranch);
  }

  if (await isBranchAlreadyMerged(projectRoot, branch)) {
    await recordEventWithFallback(recordEvent, projectRoot, {
      sessionId: session.id,
      agentName: session.agentName,
      eventType: "merge.skipped",
      payload: {
        branch,
        canonicalBranch,
        reason: "already_up_to_date"
      }
    });
    await markRunMergedBestEffort(projectRoot, session.id, updateLatestRun);

    process.stdout.write(`Session ${session.agentName} is already merged into ${canonicalBranch}\n`);
    process.stdout.write(`Session: ${session.id}\n`);
    process.stdout.write(`Branch: ${branch}\n`);
    process.stdout.write(`Next: if you no longer need the preserved worktree, run 'sy stop ${session.id} --cleanup'.\n`);
    return;
  }

  try {
    await runGit(projectRoot, ["merge", "--no-ff", branch]);
  } catch (error) {
    const failure = await inspectMergeFailure(projectRoot);

    if (failure.reason === "merge_conflict") {
      throw recordedMergeError(
        formatMergeConflictMessage(canonicalBranch, branch, failure.conflictPaths),
        buildMergeFailurePayload(branch, canonicalBranch, failure)
      );
    }

    throw recordedMergeError(
      `Failed to merge '${branch}' into '${canonicalBranch}': ${formatGitError(error)}`,
      {
        branch,
        canonicalBranch,
        reason: "git_error",
        errorMessage: formatGitError(error)
      }
    );
  }

  await recordEventWithFallback(recordEvent, projectRoot, {
    sessionId: session.id,
    agentName: session.agentName,
    eventType: "merge.completed",
    payload: {
      branch,
      canonicalBranch
    }
  });
  await markRunMergedBestEffort(projectRoot, session.id, updateLatestRun);

  process.stdout.write(`Merged ${session.agentName} into ${canonicalBranch}\n`);
  process.stdout.write(`Session: ${session.id}\n`);
  process.stdout.write(`Branch: ${branch}\n`);
  process.stdout.write(`Next: run your normal checks on ${canonicalBranch}, then 'sy stop ${session.id} --cleanup' when ready.\n`);
}

async function resolveSession(projectRoot: string, selector: string): Promise<SessionRecord | undefined> {
  return await resolveSessionByIdOrAgent(projectRoot, selector, (ambiguity) => {
    return new MergeError(formatSessionSelectorAmbiguousMessage(selector, ambiguity));
  });
}

async function ensureProjectRootIsClean(projectRoot: string, session: SessionRecord): Promise<void> {
  const dirtyEntries = await listMeaningfulDirtyEntries(projectRoot);

  if (dirtyEntries.length > 0) {
    throw recordedMergeError(
      `Canonical branch worktree is not clean. Resolve these repo-root entries before merging: ${formatDirtyEntrySummary(dirtyEntries)}.`,
      withBranchPayload(session, {
        reason: "repo_root_dirty",
        target: "repo_root",
        dirtyCount: dirtyEntries.length,
        ...(dirtyEntries[0] ? { firstDirtyEntry: dirtyEntries[0] } : {})
      })
    );
  }
}

async function ensureNoMergeInProgress(projectRoot: string, session: SessionRecord): Promise<void> {
  try {
    await runGit(projectRoot, ["rev-parse", "--verify", "--quiet", "MERGE_HEAD"]);
  } catch {
    return;
  }

  const conflictPaths = await listMergeConflictPaths(projectRoot);
  throw recordedMergeError(
    formatMergeAlreadyInProgressMessage(conflictPaths),
    withBranchPayload(session, {
      reason: "merge_in_progress",
      target: "repo_root",
      conflictCount: conflictPaths.length,
      ...(conflictPaths[0] ? { firstConflictPath: conflictPaths[0] } : {})
    })
  );
}

async function ensurePreservedWorktreeIsClean(projectRoot: string, session: SessionRecord): Promise<void> {
  if (!(await pathExists(session.worktreePath))) {
    throw recordedMergeError(
      `Preserved worktree for ${session.agentName} is missing (${formatRelativePath(projectRoot, session.worktreePath)}).`,
      withBranchPayload(session, {
        reason: "worktree_missing",
        target: "preserved_worktree",
        worktreePath: formatRelativePath(projectRoot, session.worktreePath)
      })
    );
  }

  const resolvedExpectedPath = await resolveExistingPath(session.worktreePath);
  const worktreeRoot = await getGitWorktreeRoot(projectRoot, session);
  const resolvedWorktreeRoot = await resolveExistingPath(worktreeRoot);

  if (resolvedExpectedPath !== resolvedWorktreeRoot) {
    throw recordedMergeError(
      `Preserved worktree for ${session.agentName} is not a git worktree rooted at ${formatRelativePath(projectRoot, session.worktreePath)}.`,
      withBranchPayload(session, {
        reason: "worktree_root_mismatch",
        target: "preserved_worktree",
        worktreePath: formatRelativePath(projectRoot, session.worktreePath)
      })
    );
  }

  const dirtyEntries = await listMeaningfulDirtyEntries(session.worktreePath);

  if (dirtyEntries.length > 0) {
    throw recordedMergeError(
      `Preserved worktree for ${session.agentName} is not clean (${formatRelativePath(projectRoot, session.worktreePath)}). Resolve these entries there before merging: ${formatDirtyEntrySummary(dirtyEntries)}.`,
      withBranchPayload(session, {
        reason: "worktree_dirty",
        target: "preserved_worktree",
        dirtyCount: dirtyEntries.length,
        worktreePath: formatRelativePath(projectRoot, session.worktreePath),
        ...(dirtyEntries[0] ? { firstDirtyEntry: dirtyEntries[0] } : {})
      })
    );
  }
}

async function getGitWorktreeRoot(projectRoot: string, session: SessionRecord): Promise<string> {
  try {
    const { stdout } = await runGit(session.worktreePath, ["rev-parse", "--show-toplevel"]);
    return stdout.trim();
  } catch {
    throw recordedMergeError(
      `Preserved worktree for ${session.agentName} is not a usable git worktree (${formatRelativePath(projectRoot, session.worktreePath)}).`,
      withBranchPayload(session, {
        reason: "worktree_unusable",
        target: "preserved_worktree",
        worktreePath: formatRelativePath(projectRoot, session.worktreePath)
      })
    );
  }
}

async function ensureLocalBranchExists(
  projectRoot: string,
  session: SessionRecord,
  branch: string,
  canonicalBranch: string
): Promise<void> {
  try {
    await runGit(projectRoot, ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`]);
  } catch {
    throw recordedMergeError(
      `Preserved branch '${branch}' is missing. Cleanup may already have removed it.`,
      withBranchPayload(session, {
        reason: "branch_missing",
        canonicalBranch
      })
    );
  }
}

async function getCurrentBranch(projectRoot: string): Promise<string> {
  const { stdout } = await runGit(projectRoot, ["branch", "--show-current"]);
  return stdout.trim();
}

async function switchToCanonicalBranch(
  projectRoot: string,
  session: SessionRecord,
  canonicalBranch: string
): Promise<void> {
  try {
    await runGit(projectRoot, ["switch", canonicalBranch]);
  } catch (error) {
    throw recordedMergeError(
      `Failed to switch the repo root to '${canonicalBranch}': ${formatGitError(error)}`,
      withBranchPayload(session, {
        reason: "canonical_branch_switch_failed",
        canonicalBranch,
        errorMessage: formatGitError(error)
      })
    );
  }
}

async function isBranchAlreadyMerged(projectRoot: string, branch: string): Promise<boolean> {
  try {
    await runGit(projectRoot, ["merge-base", "--is-ancestor", branch, "HEAD"]);
    return true;
  } catch {
    return false;
  }
}

async function inspectMergeFailure(projectRoot: string): Promise<{
  reason: string;
  conflictPaths: string[];
}> {
  try {
    await runGit(projectRoot, ["rev-parse", "--verify", "--quiet", "MERGE_HEAD"]);
    return {
      reason: "merge_conflict",
      conflictPaths: await listMergeConflictPaths(projectRoot)
    };
  } catch {
    return {
      reason: "git_error",
      conflictPaths: []
    };
  }
}

async function listMergeConflictPaths(projectRoot: string): Promise<string[]> {
  try {
    const { stdout } = await runGit(projectRoot, ["diff", "--name-only", "--diff-filter=U"]);
    return stdout
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  } catch {
    return [];
  }
}

async function runGit(projectRoot: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  const { stdout, stderr } = await execFileAsync("git", args, { cwd: projectRoot });
  return {
    stdout: stdout.trimEnd(),
    stderr: stderr.trimEnd()
  };
}

function formatGitError(error: unknown): string {
  if (error && typeof error === "object") {
    const stdout = "stdout" in error && typeof error.stdout === "string" ? error.stdout.trim() : "";
    const stderr = "stderr" in error && typeof error.stderr === "string" ? error.stderr.trim() : "";
    const combined = stderr || stdout;

    if (combined.length > 0) {
      return combined;
    }
  }

  return error instanceof Error ? error.message : String(error);
}

function formatErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function buildMergeFailurePayload(
  branch: string,
  canonicalBranch: string,
  failure: { reason: string; conflictPaths: string[] }
): MergeFailurePayload {
  const payload: MergeFailurePayload = {
    branch,
    canonicalBranch,
    reason: failure.reason
  };

  if (failure.conflictPaths.length > 0) {
    payload.conflictCount = failure.conflictPaths.length;
    payload.firstConflictPath = failure.conflictPaths[0] ?? "";
  }

  return payload;
}

function withBranchPayload(
  session: SessionRecord,
  payload: MergeFailurePayload
): MergeFailurePayload {
  const branch = session.branch.trim();

  if (branch.length === 0 || "branch" in payload) {
    return payload;
  }

  return {
    ...payload,
    branch
  };
}

function recordedMergeError(message: string, payload: MergeFailurePayload): RecordedMergeError {
  return new RecordedMergeError(message, payload);
}

function formatMergeConflictMessage(canonicalBranch: string, branch: string, conflictPaths: string[]): string {
  const summary = formatConflictPathSummary(conflictPaths);

  if (summary.length === 0) {
    return `Merge stopped with conflicts between '${canonicalBranch}' and '${branch}'. Resolve them in the repo root or run 'git merge --abort'.`;
  }

  return `Merge stopped with conflicts between '${canonicalBranch}' and '${branch}'. Conflicting paths: ${summary}. Resolve them in the repo root or run 'git merge --abort'.`;
}

function formatMergeAlreadyInProgressMessage(conflictPaths: string[]): string {
  const summary = formatConflictPathSummary(conflictPaths);

  if (summary.length === 0) {
    return "Canonical branch worktree already has an in-progress merge. Resolve it in the repo root or run 'git merge --abort' before running 'sy merge' again.";
  }

  return `Canonical branch worktree already has an in-progress merge. Conflicting paths: ${summary}. Resolve it in the repo root or run 'git merge --abort' before running 'sy merge' again.`;
}

function formatConflictPathSummary(paths: string[]): string {
  const visiblePaths = paths.slice(0, MAX_CONFLICT_PATH_DETAILS);
  const remainingCount = paths.length - visiblePaths.length;

  if (remainingCount > 0) {
    visiblePaths.push(`+${remainingCount} more`);
  }

  return visiblePaths.join("; ");
}

function formatDirtyEntrySummary(entries: string[]): string {
  const visibleEntries = entries.slice(0, MAX_DIRTY_ENTRY_DETAILS);

  const remainingCount = entries.length - visibleEntries.length;

  if (remainingCount > 0) {
    visibleEntries.push(`+${remainingCount} more`);
  }

  return visibleEntries.join("; ");
}

function formatRelativePath(projectRoot: string, path: string): string {
  const relativePath = relative(projectRoot, path);
  return relativePath.length > 0 ? relativePath : ".";
}

async function markRunMergedBestEffort(
  projectRoot: string,
  sessionId: string,
  updateLatestRun: (projectRoot: string, sessionId: string, input: Omit<UpdateRunInput, "id">) => Promise<unknown>
): Promise<void> {
  const finishedAt = new Date().toISOString();

  try {
    await updateLatestRun(projectRoot, sessionId, {
      state: "finished",
      outcome: "merged",
      updatedAt: finishedAt,
      finishedAt
    });
  } catch (error) {
    process.stderr.write(`WARN: failed to persist run state for session '${sessionId}': ${formatErrorMessage(error)}\n`);
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function resolveExistingPath(path: string): Promise<string> {
  return await realpath(path);
}
