import {
  loadRepoWorkflowDocuments,
  MANDATORY_STARTUP_DOCS,
  PROJECTION_DOCS,
  readStartupDoc,
  STARTUP_MARKER
} from "./documents.js";
import {
  getCurrentBranchRef,
  getCurrentHeadCommit,
  listDirtyWorktreeEntries,
  verifyBranchRefPointsToCommit
} from "./git.js";
import type {
  AttemptState,
  BlockedReason,
  CampaignState,
  ImplementerStatus,
  LoadedAttempt,
  LoadedAttemptDocument,
  LoadedCampaign,
  LoadedChunk,
  LoadedChunkManifest,
  LoadedMilestoneRegistry,
  LoadedProjection,
  RepoWorkflowValidationCode,
  RepoWorkflowValidationResult,
  ReviewStatus,
  SliceLedgerDisposition,
  SliceLedgerRowRef,
  VerificationResult
} from "./types.js";

export async function validateRepoWorkflow(projectRoot: string): Promise<RepoWorkflowValidationResult> {
  try {
    for (const relativePath of MANDATORY_STARTUP_DOCS) {
      const contents = await readStartupDoc(projectRoot, relativePath);
      if (!contents.includes(STARTUP_MARKER)) {
        throw new RepoWorkflowValidationFailure(
          "invalid_startup_doc",
          `${relativePath} is missing startup marker '${STARTUP_MARKER}'.`
        );
      }
    }

    const dirtyEntries = await listDirtyWorktreeEntries(projectRoot);
    if (dirtyEntries.length > 0) {
      throw new RepoWorkflowValidationFailure(
        "dirty_worktree",
        `Repo workflow resume is fail-closed on a dirty worktree. Resolve these entries first: ${dirtyEntries.join(", ")}.`
      );
    }

    const documents = await loadRepoWorkflowDocuments(projectRoot);
    const campaign = parseCampaign(documents.campaign);
    const chunkManifest = parseChunkManifest(documents.chunks);
    const attemptDocument = parseAttemptDocument(documents.attempts);
    const milestoneRegistry = parseMilestoneRegistry(documents.milestoneRegistry);

    const projections = new Map<string, LoadedProjection>();
    for (const relativePath of PROJECTION_DOCS) {
      projections.set(relativePath, parseProjection(documents.projections[relativePath], relativePath));
    }

    const currentBranchRef = await getCurrentBranchRef(projectRoot).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      throw new RepoWorkflowValidationFailure("invalid_git_state", `Failed to resolve checked-out branch ref: ${message}`);
    });
    const currentHeadCommit = await getCurrentHeadCommit(projectRoot).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      throw new RepoWorkflowValidationFailure("invalid_git_state", `Failed to resolve current checked-out HEAD: ${message}`);
    });

    await verifyBranchRefPointsToCommit(projectRoot, campaign.branchRef).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      throw new RepoWorkflowValidationFailure(
        "invalid_git_state",
        `Canonical branch_ref '${campaign.branchRef}' does not point to a commit: ${message}`
      );
    });

    if (currentBranchRef !== campaign.branchRef) {
      throw new RepoWorkflowValidationFailure(
        "invalid_git_state",
        `Checked-out symbolic ref '${currentBranchRef}' does not match canonical branch_ref '${campaign.branchRef}'.`
      );
    }

    validateCrossFileIds(campaign, chunkManifest, attemptDocument);
    validateMilestoneRegistry(campaign, milestoneRegistry);
    validateProjections(campaign, projections);

    const activeAttempt = validateActiveState(campaign, chunkManifest, attemptDocument);
    validateReviewCurrency(activeAttempt, currentHeadCommit);

    return {
      ok: true,
      campaign,
      activeAttempt,
      currentBranchRef,
      currentHeadCommit
    };
  } catch (error) {
    if (error instanceof RepoWorkflowValidationFailure) {
      return {
        ok: false,
        code: error.code,
        message: error.message
      };
    }

    if (error instanceof Error) {
      if (error.message.includes("projection")) {
        return { ok: false, code: "invalid_projection", message: error.message };
      }

      if (error.message.includes("milestone registry")) {
        return { ok: false, code: "invalid_milestone_registry", message: error.message };
      }

      return { ok: false, code: "invalid_yaml", message: error.message };
    }

    return { ok: false, code: "invalid_yaml", message: String(error) };
  }
}

class RepoWorkflowValidationFailure extends Error {
  readonly code: RepoWorkflowValidationCode;

  constructor(code: RepoWorkflowValidationCode, message: string) {
    super(message);
    this.name = "RepoWorkflowValidationFailure";
    this.code = code;
  }
}

function parseCampaign(value: unknown): LoadedCampaign {
  const filePath = "docs/repo-workflow/campaign.yaml";
  const record = requireRecord(value, filePath, "campaign document");
  const root = requireRecord(record.repo_workflow_campaign, filePath, "repo_workflow_campaign");

  if ("verification_command" in root) {
    throw new RepoWorkflowValidationFailure(
      "invalid_yaml",
      `${filePath} must not define verification_command; it belongs only in docs/repo-workflow/chunks.yaml.`
    );
  }

  assertAllowedKeys(root, filePath, "repo_workflow_campaign", [
    "schema_version",
    "campaign_id",
    "bundle_id",
    "product_milestone_id",
    "campaign_state",
    "active_chunk_id",
    "active_attempt_id",
    "branch_ref",
    "baseline_command",
    "slice_ledger",
    "last_updated"
  ]);

  const sliceLedger = requireRecord(root.slice_ledger, filePath, "slice_ledger");
  assertAllowedKeys(sliceLedger, filePath, "slice_ledger", ["disposition", "row_ref"]);

  const disposition = requireEnum<SliceLedgerDisposition>(
    sliceLedger.disposition,
    ["pending", "new-row", "folded-into-existing-row"],
    filePath,
    "slice_ledger.disposition"
  );
  const rowRef = requireNullableString(sliceLedger.row_ref, filePath, "slice_ledger.row_ref");

  if (disposition === "pending" && rowRef !== null) {
    throw new RepoWorkflowValidationFailure("invalid_state", `${filePath} requires slice_ledger.row_ref to be null when disposition is pending.`);
  }

  if (disposition !== "pending" && (rowRef === null || !/^S\d+$/.test(rowRef))) {
    throw new RepoWorkflowValidationFailure(
      "invalid_yaml",
      `${filePath} requires slice_ledger.row_ref to reference a stable slice row such as S09 when disposition is not pending.`
    );
  }

  return {
    schemaVersion: requireLiteralNumber(root.schema_version, 1, filePath, "schema_version"),
    campaignId: requireId(root.campaign_id, filePath, "campaign_id"),
    bundleId: requireId(root.bundle_id, filePath, "bundle_id"),
    productMilestoneId: requireId(root.product_milestone_id, filePath, "product_milestone_id"),
    campaignState: requireEnum<CampaignState>(
      root.campaign_state,
      ["active", "blocked", "complete", "abandoned", "superseded"],
      filePath,
      "campaign_state"
    ),
    activeChunkId: requireNullableId(root.active_chunk_id, filePath, "active_chunk_id"),
    activeAttemptId: requireNullableId(root.active_attempt_id, filePath, "active_attempt_id"),
    branchRef: requireString(root.branch_ref, filePath, "branch_ref"),
    baselineCommand: requireString(root.baseline_command, filePath, "baseline_command"),
    sliceLedger: {
      disposition,
      rowRef: rowRef as SliceLedgerRowRef
    },
    lastUpdated: requireDate(root.last_updated, filePath, "last_updated")
  };
}

function parseChunkManifest(value: unknown): LoadedChunkManifest {
  const filePath = "docs/repo-workflow/chunks.yaml";
  const record = requireRecord(value, filePath, "chunk manifest");
  const root = requireRecord(record.repo_workflow_chunks, filePath, "repo_workflow_chunks");

  assertAllowedKeys(root, filePath, "repo_workflow_chunks", [
    "schema_version",
    "campaign_id",
    "bundle_id",
    "manifest_state",
    "chunks",
    "last_updated"
  ]);

  const chunksValue = requireArray(root.chunks, filePath, "chunks");
  const chunks = chunksValue.map((entry, index) => parseChunk(entry, index));
  const chunkIds = new Set(chunks.map((chunk) => chunk.chunkId));
  if (chunkIds.size !== chunks.length) {
    throw new RepoWorkflowValidationFailure("invalid_yaml", `${filePath} contains duplicate chunk_id values.`);
  }

  const terminalChunks = chunks.filter((chunk) => chunk.nextChunkId === null);
  if (terminalChunks.length !== 1) {
    throw new RepoWorkflowValidationFailure("invalid_yaml", `${filePath} must contain exactly one terminal chunk with next_chunk_id: null.`);
  }

  for (const chunk of chunks) {
    if (chunk.nextChunkId !== null && !chunkIds.has(chunk.nextChunkId)) {
      throw new RepoWorkflowValidationFailure(
        "invalid_yaml",
        `${filePath} chunk '${chunk.chunkId}' references unknown next_chunk_id '${chunk.nextChunkId}'.`
      );
    }
  }

  return {
    schemaVersion: requireLiteralNumber(root.schema_version, 1, filePath, "schema_version"),
    campaignId: requireId(root.campaign_id, filePath, "campaign_id"),
    bundleId: requireId(root.bundle_id, filePath, "bundle_id"),
    manifestState: requireEnum<"active" | "complete" | "superseded">(
      root.manifest_state,
      ["active", "complete", "superseded"],
      filePath,
      "manifest_state"
    ),
    chunks,
    lastUpdated: requireDate(root.last_updated, filePath, "last_updated")
  };
}

function parseChunk(value: unknown, index: number): LoadedChunk {
  const filePath = "docs/repo-workflow/chunks.yaml";
  const record = requireRecord(value, filePath, `chunks[${index}]`);
  assertAllowedKeys(record, filePath, `chunks[${index}]`, [
    "chunk_id",
    "next_chunk_id",
    "objective",
    "scope",
    "done_condition",
    "verification_command",
    "owner_role"
  ]);

  return {
    chunkId: requireId(record.chunk_id, filePath, `chunks[${index}].chunk_id`),
    nextChunkId: requireNullableId(record.next_chunk_id, filePath, `chunks[${index}].next_chunk_id`),
    objective: requireString(record.objective, filePath, `chunks[${index}].objective`),
    scope: requireString(record.scope, filePath, `chunks[${index}].scope`),
    doneCondition: requireString(record.done_condition, filePath, `chunks[${index}].done_condition`),
    verificationCommand: requireString(record.verification_command, filePath, `chunks[${index}].verification_command`),
    ownerRole: requireString(record.owner_role, filePath, `chunks[${index}].owner_role`)
  };
}

function parseAttemptDocument(value: unknown): LoadedAttemptDocument {
  const filePath = "docs/repo-workflow/attempts.yaml";
  const record = requireRecord(value, filePath, "attempt document");
  const root = requireRecord(record.repo_workflow_attempts, filePath, "repo_workflow_attempts");

  assertAllowedKeys(root, filePath, "repo_workflow_attempts", ["schema_version", "campaign_id", "attempts", "last_updated"]);

  const attemptsValue = requireArray(root.attempts, filePath, "attempts");
  const attempts = attemptsValue.map((entry, index) => parseAttempt(entry, index));
  const attemptIds = new Set(attempts.map((attempt) => attempt.attemptId));
  if (attemptIds.size !== attempts.length) {
    throw new RepoWorkflowValidationFailure("invalid_yaml", `${filePath} contains duplicate attempt_id values.`);
  }

  return {
    schemaVersion: requireLiteralNumber(root.schema_version, 1, filePath, "schema_version"),
    campaignId: requireId(root.campaign_id, filePath, "campaign_id"),
    attempts,
    lastUpdated: requireDate(root.last_updated, filePath, "last_updated")
  };
}

function parseAttempt(value: unknown, index: number): LoadedAttempt {
  const filePath = "docs/repo-workflow/attempts.yaml";
  const record = requireRecord(value, filePath, `attempts[${index}]`);

  if ("verification_command" in record) {
    throw new RepoWorkflowValidationFailure(
      "invalid_yaml",
      `${filePath} must not define verification_command; it belongs only in docs/repo-workflow/chunks.yaml.`
    );
  }

  assertAllowedKeys(record, filePath, `attempts[${index}]`, [
    "attempt_id",
    "chunk_id",
    "attempt_number",
    "state",
    "blocked_reason",
    "implementer_status",
    "spec_review_status",
    "spec_reviewed_commit",
    "quality_review_status",
    "quality_reviewed_commit",
    "verification_result",
    "verification_head_commit",
    "verified_at",
    "docs_reconciled",
    "summary",
    "notes"
  ]);

  const specReviewStatus = requireEnum<ReviewStatus>(
    record.spec_review_status,
    ["not-started", "approved", "issues-found"],
    filePath,
    `attempts[${index}].spec_review_status`
  );
  const qualityReviewStatus = requireEnum<ReviewStatus>(
    record.quality_review_status,
    ["not-started", "approved", "issues-found"],
    filePath,
    `attempts[${index}].quality_review_status`
  );
  const verificationResult = requireEnum<VerificationResult>(
    record.verification_result,
    ["not-run", "passed", "failed"],
    filePath,
    `attempts[${index}].verification_result`
  );
  const specReviewedCommit = requireNullableCommit(record.spec_reviewed_commit, filePath, `attempts[${index}].spec_reviewed_commit`);
  const qualityReviewedCommit = requireNullableCommit(
    record.quality_reviewed_commit,
    filePath,
    `attempts[${index}].quality_reviewed_commit`
  );
  const verificationHeadCommit = requireNullableCommit(
    record.verification_head_commit,
    filePath,
    `attempts[${index}].verification_head_commit`
  );
  const verifiedAt = requireNullableTimestamp(record.verified_at, filePath, `attempts[${index}].verified_at`);

  if (specReviewStatus === "not-started" && specReviewedCommit !== null) {
    throw new RepoWorkflowValidationFailure(
      "invalid_yaml",
      `${filePath} requires spec_reviewed_commit to be null when spec_review_status is not-started.`
    );
  }

  if (qualityReviewStatus === "not-started" && qualityReviewedCommit !== null) {
    throw new RepoWorkflowValidationFailure(
      "invalid_yaml",
      `${filePath} requires quality_reviewed_commit to be null when quality_review_status is not-started.`
    );
  }

  if (verificationResult === "not-run" && (verificationHeadCommit !== null || verifiedAt !== null)) {
    throw new RepoWorkflowValidationFailure(
      "invalid_yaml",
      `${filePath} requires verification_head_commit and verified_at to be null when verification_result is not-run.`
    );
  }

  return {
    attemptId: requireId(record.attempt_id, filePath, `attempts[${index}].attempt_id`),
    chunkId: requireId(record.chunk_id, filePath, `attempts[${index}].chunk_id`),
    attemptNumber: requirePositiveInteger(record.attempt_number, filePath, `attempts[${index}].attempt_number`),
    state: requireEnum<AttemptState>(
      record.state,
      [
        "ready",
        "implementing",
        "awaiting-spec-review",
        "awaiting-quality-review",
        "review-failed",
        "awaiting-verification",
        "blocked",
        "complete",
        "abandoned"
      ],
      filePath,
      `attempts[${index}].state`
    ),
    blockedReason: requireEnum<BlockedReason>(
      record.blocked_reason,
      ["none", "operator-input", "doc-reconciliation", "execution-failure"],
      filePath,
      `attempts[${index}].blocked_reason`
    ),
    implementerStatus: requireEnum<ImplementerStatus>(
      record.implementer_status,
      ["not-started", "done", "done-with-concerns", "needs-context", "blocked"],
      filePath,
      `attempts[${index}].implementer_status`
    ),
    specReviewStatus,
    specReviewedCommit,
    qualityReviewStatus,
    qualityReviewedCommit,
    verificationResult,
    verificationHeadCommit,
    verifiedAt,
    docsReconciled: requireBoolean(record.docs_reconciled, filePath, `attempts[${index}].docs_reconciled`),
    summary: requireString(record.summary, filePath, `attempts[${index}].summary`),
    notes: requireString(record.notes, filePath, `attempts[${index}].notes`)
  };
}

function parseProjection(value: unknown, relativePath: string): LoadedProjection {
  const record = requireRecord(value, relativePath, "projection block");
  const root = requireRecord(record.repo_workflow_projection, relativePath, "repo_workflow_projection");
  assertAllowedKeys(root, relativePath, "repo_workflow_projection", [
    "schema_version",
    "active_repo_campaign_id",
    "active_bundle_id",
    "active_chunk_id",
    "last_updated"
  ]);

  const projection: LoadedProjection = {
    schemaVersion: requireLiteralNumber(root.schema_version, 1, relativePath, "schema_version"),
    activeRepoCampaignId: requireId(root.active_repo_campaign_id, relativePath, "active_repo_campaign_id"),
    activeBundleId: requireId(root.active_bundle_id, relativePath, "active_bundle_id"),
    lastUpdated: requireDate(root.last_updated, relativePath, "last_updated")
  };

  if (root.active_chunk_id !== undefined) {
    projection.activeChunkId = requireId(root.active_chunk_id, relativePath, "active_chunk_id");
  }

  return projection;
}

function parseMilestoneRegistry(value: unknown): LoadedMilestoneRegistry {
  const filePath = "docs/milestones.md";
  const record = requireRecord(value, filePath, "milestone registry");
  const entries = requireArray(record.repo_workflow_milestones, filePath, "repo_workflow_milestones");

  return {
    milestones: entries.map((entry, index) => {
      const milestone = requireRecord(entry, filePath, `repo_workflow_milestones[${index}]`);
      assertAllowedKeys(milestone, filePath, `repo_workflow_milestones[${index}]`, ["milestone_id", "title"]);
      return {
        milestoneId: requireId(milestone.milestone_id, filePath, `repo_workflow_milestones[${index}].milestone_id`),
        title: requireString(milestone.title, filePath, `repo_workflow_milestones[${index}].title`)
      };
    })
  };
}

function validateCrossFileIds(
  campaign: LoadedCampaign,
  chunkManifest: LoadedChunkManifest,
  attemptDocument: LoadedAttemptDocument
): void {
  if (campaign.campaignId !== chunkManifest.campaignId || campaign.campaignId !== attemptDocument.campaignId) {
    throw new RepoWorkflowValidationFailure("invalid_state", "Canonical repo-workflow campaign ids do not match across YAML documents.");
  }

  if (campaign.bundleId !== chunkManifest.bundleId) {
    throw new RepoWorkflowValidationFailure("invalid_state", "Canonical repo-workflow bundle ids do not match across campaign.yaml and chunks.yaml.");
  }
}

function validateMilestoneRegistry(campaign: LoadedCampaign, registry: LoadedMilestoneRegistry): void {
  const milestone = registry.milestones.find((entry) => entry.milestoneId === campaign.productMilestoneId);
  if (!milestone) {
    throw new RepoWorkflowValidationFailure(
      "invalid_milestone_registry",
      `docs/milestones.md milestone registry does not contain product_milestone_id '${campaign.productMilestoneId}'.`
    );
  }
}

function validateProjections(campaign: LoadedCampaign, projections: Map<string, LoadedProjection>): void {
  for (const relativePath of PROJECTION_DOCS) {
    const projection = projections.get(relativePath);
    if (!projection) {
      throw new RepoWorkflowValidationFailure("invalid_projection", `${relativePath} is missing projection data.`);
    }

    if (projection.activeRepoCampaignId !== campaign.campaignId || projection.activeBundleId !== campaign.bundleId) {
      throw new RepoWorkflowValidationFailure(
        "invalid_projection",
        `Projection ids do not match canonical repo-workflow state in ${relativePath}.`
      );
    }

    const requiresChunkId = relativePath !== "docs/focus-tracker.md";
    if (requiresChunkId && projection.activeChunkId === undefined) {
      throw new RepoWorkflowValidationFailure(
        "invalid_projection",
        `${relativePath} is missing required active_chunk_id in its projection block.`
      );
    }

    if (projection.activeChunkId !== undefined && projection.activeChunkId !== campaign.activeChunkId) {
      throw new RepoWorkflowValidationFailure(
        "invalid_projection",
        `Projection ids do not match canonical repo-workflow state in ${relativePath}.`
      );
    }
  }
}

function validateActiveState(
  campaign: LoadedCampaign,
  chunkManifest: LoadedChunkManifest,
  attemptDocument: LoadedAttemptDocument
): LoadedAttempt {
  const activeStateRequiresIds = campaign.campaignState === "active" || campaign.campaignState === "blocked";

  if (activeStateRequiresIds && (campaign.activeChunkId === null || campaign.activeAttemptId === null)) {
    throw new RepoWorkflowValidationFailure(
      "invalid_state",
      `campaign.yaml requires non-null active_chunk_id and active_attempt_id when campaign_state is '${campaign.campaignState}'.`
    );
  }

  if (!activeStateRequiresIds && (campaign.activeChunkId !== null || campaign.activeAttemptId !== null)) {
    throw new RepoWorkflowValidationFailure(
      "invalid_state",
      `campaign.yaml requires null active ids when campaign_state is '${campaign.campaignState}'.`
    );
  }

  if (campaign.activeChunkId === null || campaign.activeAttemptId === null) {
    throw new RepoWorkflowValidationFailure("invalid_state", "Campaign has no active chunk/attempt to validate.");
  }

  const activeChunk = chunkManifest.chunks.find((chunk) => chunk.chunkId === campaign.activeChunkId);
  if (!activeChunk) {
    throw new RepoWorkflowValidationFailure("invalid_state", `Canonical active chunk '${campaign.activeChunkId}' does not exist in chunks.yaml.`);
  }

  const activeAttempt = attemptDocument.attempts.find((attempt) => attempt.attemptId === campaign.activeAttemptId);
  if (!activeAttempt) {
    throw new RepoWorkflowValidationFailure("invalid_state", `Canonical active attempt '${campaign.activeAttemptId}' does not exist in attempts.yaml.`);
  }

  if (activeAttempt.chunkId !== activeChunk.chunkId) {
    throw new RepoWorkflowValidationFailure("invalid_state", "Canonical active attempt chunk does not match the active chunk.");
  }

  if (campaign.campaignState === "blocked" && activeAttempt.state !== "blocked") {
    throw new RepoWorkflowValidationFailure("invalid_state", "campaign_state 'blocked' requires the active attempt state to be blocked.");
  }

  if (
    campaign.campaignState === "active" &&
    !new Set<AttemptState>([
      "ready",
      "implementing",
      "awaiting-spec-review",
      "awaiting-quality-review",
      "awaiting-verification",
      "review-failed",
      "blocked",
      "complete"
    ]).has(activeAttempt.state)
  ) {
    throw new RepoWorkflowValidationFailure(
      "invalid_state",
      `campaign_state 'active' does not allow active attempt state '${activeAttempt.state}'.`
    );
  }

  return activeAttempt;
}

function validateReviewCurrency(attempt: LoadedAttempt, currentHeadCommit: string): void {
  if (attempt.specReviewStatus !== "not-started" && attempt.specReviewedCommit !== currentHeadCommit) {
    throw new RepoWorkflowValidationFailure(
      "invalid_state",
      `spec_reviewed_commit must equal the current checked-out HEAD '${currentHeadCommit}'.`
    );
  }

  if (attempt.qualityReviewStatus !== "not-started" && attempt.qualityReviewedCommit !== currentHeadCommit) {
    throw new RepoWorkflowValidationFailure(
      "invalid_state",
      `quality_reviewed_commit must equal the current checked-out HEAD '${currentHeadCommit}'.`
    );
  }

  if (attempt.verificationResult !== "not-run" && attempt.verificationHeadCommit !== currentHeadCommit) {
    throw new RepoWorkflowValidationFailure(
      "invalid_state",
      `verification_head_commit must equal the current checked-out HEAD '${currentHeadCommit}'.`
    );
  }
}

function requireRecord(value: unknown, filePath: string, label: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new RepoWorkflowValidationFailure("invalid_yaml", `${filePath} must define ${label} as a mapping.`);
  }

  return value;
}

function requireArray(value: unknown, filePath: string, field: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new RepoWorkflowValidationFailure("invalid_yaml", `${filePath} must define ${field} as a list.`);
  }

  return value;
}

function assertAllowedKeys(record: Record<string, unknown>, filePath: string, label: string, keys: string[]): void {
  const allowed = new Set(keys);
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) {
      throw new RepoWorkflowValidationFailure("invalid_yaml", `${filePath} contains unexpected key '${key}' in ${label}.`);
    }
  }
}

function requireLiteralNumber(value: unknown, expected: number, filePath: string, field: string): 1 {
  if (value !== expected) {
    throw new RepoWorkflowValidationFailure("invalid_yaml", `${filePath} requires ${field} to equal ${expected}.`);
  }

  return 1;
}

function requireString(value: unknown, filePath: string, field: string): string {
  if (typeof value !== "string") {
    throw new RepoWorkflowValidationFailure("invalid_yaml", `${filePath} requires ${field} to be a string.`);
  }

  return value;
}

function requireBoolean(value: unknown, filePath: string, field: string): boolean {
  if (typeof value !== "boolean") {
    throw new RepoWorkflowValidationFailure("invalid_yaml", `${filePath} requires ${field} to be a boolean.`);
  }

  return value;
}

function requirePositiveInteger(value: unknown, filePath: string, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new RepoWorkflowValidationFailure("invalid_yaml", `${filePath} requires ${field} to be an integer >= 1.`);
  }

  return value;
}

function requireId(value: unknown, filePath: string, field: string): string {
  const stringValue = requireString(value, filePath, field);
  if (!/^[a-z0-9-]+$/.test(stringValue)) {
    throw new RepoWorkflowValidationFailure("invalid_yaml", `${filePath} requires ${field} to match [a-z0-9-]+.`);
  }

  return stringValue;
}

function requireNullableId(value: unknown, filePath: string, field: string): string | null {
  if (value === null) {
    return null;
  }

  return requireId(value, filePath, field);
}

function requireDate(value: unknown, filePath: string, field: string): string {
  const stringValue = requireString(value, filePath, field);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(stringValue)) {
    throw new RepoWorkflowValidationFailure("invalid_yaml", `${filePath} requires ${field} to use YYYY-MM-DD.`);
  }

  return stringValue;
}

function requireNullableString(value: unknown, filePath: string, field: string): string | null {
  if (value === null) {
    return null;
  }

  return requireString(value, filePath, field);
}

function requireNullableCommit(value: unknown, filePath: string, field: string): string | null {
  if (value === null) {
    return null;
  }

  const stringValue = requireString(value, filePath, field);
  if (!/^[0-9a-f]{40}$/.test(stringValue)) {
    throw new RepoWorkflowValidationFailure("invalid_yaml", `${filePath} requires ${field} to be a full 40-character lowercase git SHA or null.`);
  }

  return stringValue;
}

function requireNullableTimestamp(value: unknown, filePath: string, field: string): string | null {
  if (value === null) {
    return null;
  }

  const stringValue = requireString(value, filePath, field);
  if (Number.isNaN(Date.parse(stringValue))) {
    throw new RepoWorkflowValidationFailure("invalid_yaml", `${filePath} requires ${field} to be an ISO 8601 timestamp or null.`);
  }

  return stringValue;
}

function requireEnum<T extends string>(value: unknown, allowed: T[], filePath: string, field: string): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new RepoWorkflowValidationFailure(
      "invalid_yaml",
      `${filePath} has illegal enum value for ${field}. Allowed values: ${allowed.join(", ")}.`
    );
  }

  return value as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
