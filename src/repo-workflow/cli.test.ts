import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { stringify } from "yaml";
import { createTempGitRepo, git, removeTempDir } from "../test-helpers/git.js";

const execFileAsync = promisify(execFile);
const tsxCliPath = fileURLToPath(new URL("../../node_modules/tsx/dist/cli.mjs", import.meta.url));
const repoWorkflowCliPath = fileURLToPath(new URL("./cli.ts", import.meta.url));

const CAMPAIGN_ID = "rw-001";
const BUNDLE_ID = "repo-workflow-foundation";
const ACTIVE_CHUNK_ID = "c-001";
const ACTIVE_ATTEMPT_ID = "a-001";
const PRODUCT_MILESTONE_ID = "m7";
const STARTUP_MARKER = "repo-workflow-startup: repo-workflow-v1";

test("repo-workflow CLI prints one compact success line and exits 0 when validation succeeds", async () => {
  const repoDir = await createValidRepoWorkflowRepo();

  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, [tsxCliPath, repoWorkflowCliPath], {
      cwd: repoDir
    });

    assert.equal(stderr, "");
    assert.equal(stdout, "repo-workflow: valid campaign rw-001 chunk c-001 attempt a-001\n");
  } finally {
    await removeTempDir(repoDir);
  }
});

test("repo-workflow CLI prints one specific validation failure on stderr and exits 1 when validation fails", async () => {
  const repoDir = await createValidRepoWorkflowRepo();

  try {
    await writeFile(join(repoDir, "AGENTS.md"), "# AGENTS\n\nmissing marker\n", "utf8");
    await git(repoDir, ["add", "AGENTS.md"]);
    await git(repoDir, ["commit", "-m", "Break startup marker"]);

    await assert.rejects(
      () => execFileAsync(process.execPath, [tsxCliPath, repoWorkflowCliPath], { cwd: repoDir }),
      (error: unknown) => {
        assert.equal(typeof error, "object");
        assert.notEqual(error, null);

        const execError = error as { code?: number; stdout?: string; stderr?: string };
        assert.equal(execError.code, 1);
        assert.equal(execError.stdout, "");
        assert.match(execError.stderr ?? "", /^repo-workflow: invalid_startup_doc: /);
        assert.match(execError.stderr ?? "", /missing startup marker/i);
        return true;
      }
    );
  } finally {
    await removeTempDir(repoDir);
  }
});

async function createValidRepoWorkflowRepo(): Promise<string> {
  const repoDir = await createTempGitRepo("switchyard-repo-workflow-cli-");

  await writeFixtureFiles(repoDir);
  await git(repoDir, ["add", "."]);
  await git(repoDir, ["commit", "-m", "Add repo workflow CLI fixture"]);

  return repoDir;
}

async function writeFixtureFiles(repoDir: string): Promise<void> {
  const docsDir = join(repoDir, "docs");
  const repoWorkflowDir = join(docsDir, "repo-workflow");
  await mkdir(repoWorkflowDir, { recursive: true });

  const startupDocs = new Map<string, string>([
    [
      "AGENTS.md",
      ["# AGENTS", "", STARTUP_MARKER, "", "Use canonical repo-workflow YAML for active development state."].join("\n")
    ],
    [
      "PLAN.md",
      ["# Plan", "", STARTUP_MARKER, "", "Product policy lives here; active repo workflow state lives in docs/repo-workflow/."].join(
        "\n"
      )
    ],
    [
      "docs/dev-workflow.md",
      ["# Dev Workflow", "", STARTUP_MARKER, "", "Validate the repo-workflow control plane before resuming implementation."].join(
        "\n"
      )
    ],
    [
      "docs/current-state.md",
      [
        "# Current State",
        "",
        STARTUP_MARKER,
        "",
        projectionBlock({ includeActiveChunkId: true }),
        "",
        "Projection doc."
      ].join("\n")
    ],
    [
      "docs/next-steps.md",
      [
        "# Next Steps",
        "",
        STARTUP_MARKER,
        "",
        projectionBlock({ includeActiveChunkId: true }),
        "",
        "Projection doc."
      ].join("\n")
    ],
    [
      "docs/focus-tracker.md",
      [
        "# Focus Tracker",
        "",
        STARTUP_MARKER,
        "",
        projectionBlock({ includeActiveChunkId: false }),
        "",
        "Projection doc."
      ].join("\n")
    ],
    [
      "docs/backlog.md",
      ["# Backlog", "", STARTUP_MARKER, "", "Product-policy context only."].join("\n")
    ],
    [
      "docs/roadmap.md",
      ["# Roadmap", "", STARTUP_MARKER, "", "Product-policy context only."].join("\n")
    ],
    [
      "docs/milestones.md",
      ["# Milestones", "", STARTUP_MARKER, "", milestonesBlock(), "", "## Active Milestone", "", "M7"].join("\n")
    ]
  ]);

  for (const [relativePath, contents] of startupDocs) {
    const absolutePath = join(repoDir, relativePath);
    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, `${contents}\n`, "utf8");
  }

  await writeFile(
    join(repoWorkflowDir, "campaign.yaml"),
    stringify({
      repo_workflow_campaign: {
        schema_version: 1,
        campaign_id: CAMPAIGN_ID,
        bundle_id: BUNDLE_ID,
        product_milestone_id: PRODUCT_MILESTONE_ID,
        campaign_state: "active",
        active_chunk_id: ACTIVE_CHUNK_ID,
        active_attempt_id: ACTIVE_ATTEMPT_ID,
        branch_ref: "refs/heads/main",
        baseline_command: "npm run check",
        slice_ledger: {
          disposition: "pending",
          row_ref: null
        },
        last_updated: "2026-03-25"
      }
    }),
    "utf8"
  );

  await writeFile(
    join(repoWorkflowDir, "chunks.yaml"),
    stringify({
      repo_workflow_chunks: {
        schema_version: 1,
        campaign_id: CAMPAIGN_ID,
        bundle_id: BUNDLE_ID,
        manifest_state: "active",
        chunks: [
          {
            chunk_id: ACTIVE_CHUNK_ID,
            next_chunk_id: null,
            objective: "freeze-control-plane-contract",
            scope: "repo-workflow-foundation",
            done_condition: "contract-and-validator-foundation-defined",
            verification_command: "node --import tsx --test src/repo-workflow/validator.test.ts src/repo-workflow/cli.test.ts",
            owner_role: "controller"
          }
        ],
        last_updated: "2026-03-25"
      }
    }),
    "utf8"
  );

  await writeFile(
    join(repoWorkflowDir, "attempts.yaml"),
    stringify({
      repo_workflow_attempts: {
        schema_version: 1,
        campaign_id: CAMPAIGN_ID,
        attempts: [
          {
            attempt_id: ACTIVE_ATTEMPT_ID,
            chunk_id: ACTIVE_CHUNK_ID,
            attempt_number: 1,
            state: "ready",
            blocked_reason: "none",
            implementer_status: "not-started",
            spec_review_status: "not-started",
            spec_reviewed_commit: null,
            quality_review_status: "not-started",
            quality_reviewed_commit: null,
            verification_result: "not-run",
            verification_head_commit: null,
            verified_at: null,
            docs_reconciled: false,
            summary: "",
            notes: ""
          }
        ],
        last_updated: "2026-03-25"
      }
    }),
    "utf8"
  );
}

function projectionBlock({ includeActiveChunkId }: { includeActiveChunkId: boolean }): string {
  const lines = [
    "<!-- repo-workflow-projection:start -->",
    "```yaml",
    "repo_workflow_projection:",
    "  schema_version: 1",
    `  active_repo_campaign_id: ${CAMPAIGN_ID}`,
    `  active_bundle_id: ${BUNDLE_ID}`
  ];

  if (includeActiveChunkId) {
    lines.push(`  active_chunk_id: ${ACTIVE_CHUNK_ID}`);
  }

  lines.push("  last_updated: 2026-03-25", "```", "<!-- repo-workflow-projection:end -->");

  return lines.join("\n");
}

function milestonesBlock(): string {
  return [
    "<!-- repo-workflow-milestones:start -->",
    "```yaml",
    "repo_workflow_milestones:",
    `  - milestone_id: ${PRODUCT_MILESTONE_ID}`,
    "    title: lead-host-recovery-and-stop-policy",
    "```",
    "<!-- repo-workflow-milestones:end -->"
  ].join("\n");
}
