import type { ReviewPolicy, RunMergePolicy } from "./orchestration/types.js";

export interface SwitchyardConfig {
  project: {
    name: string;
    root: string;
    canonicalBranch: string;
  };
  runtime: {
    default: string;
    useTmux: boolean;
  };
  worktrees: {
    baseDir: string;
  };
  orchestration: {
    maxConcurrentSpecialists: number;
    reviewPolicy: ReviewPolicy;
    mergePolicy: RunMergePolicy;
  };
}
