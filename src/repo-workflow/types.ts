export type RepoWorkflowValidationCode =
  | "invalid_startup_doc"
  | "dirty_worktree"
  | "invalid_yaml"
  | "invalid_projection"
  | "invalid_milestone_registry"
  | "invalid_git_state"
  | "invalid_state";

export type CampaignState = "active" | "blocked" | "complete" | "abandoned" | "superseded";
export type SliceLedgerDisposition = "pending" | "new-row" | "folded-into-existing-row";
export type ManifestState = "active" | "complete" | "superseded";
export type AttemptState =
  | "ready"
  | "implementing"
  | "awaiting-spec-review"
  | "awaiting-quality-review"
  | "review-failed"
  | "awaiting-verification"
  | "blocked"
  | "complete"
  | "abandoned";
export type BlockedReason = "none" | "operator-input" | "doc-reconciliation" | "execution-failure";
export type ImplementerStatus = "not-started" | "done" | "done-with-concerns" | "needs-context" | "blocked";
export type ReviewStatus = "not-started" | "approved" | "issues-found";
export type VerificationResult = "not-run" | "passed" | "failed";
export type SliceLedgerRowRef = `S${number}` | null;

export interface LoadedCampaign {
  schemaVersion: 1;
  campaignId: string;
  bundleId: string;
  productMilestoneId: string;
  campaignState: CampaignState;
  activeChunkId: string | null;
  activeAttemptId: string | null;
  branchRef: string;
  baselineCommand: string;
  sliceLedger: {
    disposition: SliceLedgerDisposition;
    rowRef: SliceLedgerRowRef;
  };
  lastUpdated: string;
}

export interface LoadedChunk {
  chunkId: string;
  nextChunkId: string | null;
  objective: string;
  scope: string;
  doneCondition: string;
  verificationCommand: string;
  ownerRole: string;
}

export interface LoadedChunkManifest {
  schemaVersion: 1;
  campaignId: string;
  bundleId: string;
  manifestState: ManifestState;
  chunks: LoadedChunk[];
  lastUpdated: string;
}

export interface LoadedAttempt {
  attemptId: string;
  chunkId: string;
  attemptNumber: number;
  state: AttemptState;
  blockedReason: BlockedReason;
  implementerStatus: ImplementerStatus;
  specReviewStatus: ReviewStatus;
  specReviewedCommit: string | null;
  qualityReviewStatus: ReviewStatus;
  qualityReviewedCommit: string | null;
  verificationResult: VerificationResult;
  verificationHeadCommit: string | null;
  verifiedAt: string | null;
  docsReconciled: boolean;
  summary: string;
  notes: string;
}

export interface LoadedAttemptDocument {
  schemaVersion: 1;
  campaignId: string;
  attempts: LoadedAttempt[];
  lastUpdated: string;
}

export interface LoadedProjection {
  schemaVersion: 1;
  activeRepoCampaignId: string;
  activeBundleId: string;
  activeChunkId?: string;
  lastUpdated: string;
}

export interface LoadedMilestone {
  milestoneId: string;
  title: string;
}

export interface LoadedMilestoneRegistry {
  milestones: LoadedMilestone[];
}

export interface RepoWorkflowDocuments {
  campaign: unknown;
  chunks: unknown;
  attempts: unknown;
  projections: Record<string, unknown>;
  milestoneRegistry: unknown;
}

export type RepoWorkflowValidationResult =
  | {
      ok: true;
      campaign: LoadedCampaign;
      activeAttempt: LoadedAttempt;
      currentBranchRef: string;
      currentHeadCommit: string;
    }
  | {
      ok: false;
      code: RepoWorkflowValidationCode;
      message: string;
    };
