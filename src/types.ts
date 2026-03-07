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
}
