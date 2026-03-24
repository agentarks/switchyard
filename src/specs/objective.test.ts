import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildDefaultConfig, writeConfig } from "../config.js";
import { bootstrapSwitchyardLayout } from "../storage/bootstrap.js";
import { createTempGitRepo, removeTempDir } from "../test-helpers/git.js";
import { writeObjectiveSpec } from "./objective.js";

test("writeObjectiveSpec writes a deterministic run-scoped objective document", async () => {
  const repoDir = await createTempGitRepo("switchyard-objective-spec-test-");

  try {
    await bootstrapSwitchyardLayout(repoDir);
    await writeConfig(buildDefaultConfig(repoDir, "switchyard-test", "main"));

    const record = await writeObjectiveSpec({
      projectRoot: repoDir,
      runId: "run-1234abcd",
      createdAt: "2026-03-20T09:30:00.000Z",
      objective: "Inspect the current bounded launch path and cut it over to a lead-owned run bootstrap.",
      targetBranch: "main",
      integrationBranch: "runs/run-1234abcd/lead",
      mergePolicy: "manual-ready"
    });

    const document = await readFile(record.path, "utf8");

    assert.equal(record.relativePath, ".switchyard/objectives/run-1234abcd.md");
    assert.equal(record.objectiveSummary, "Inspect the current bounded launch path and cut it over to a lead-owned run bootstrap.");
    assert.match(document, /# Switchyard Objective Spec/);
    assert.match(document, /Run: run-1234abcd/);
    assert.match(document, /Created: 2026-03-20T09:30:00.000Z/);
    assert.match(document, /Target branch: main/);
    assert.match(document, /Integration branch: runs\/run-1234abcd\/lead/);
    assert.match(document, /Merge policy: manual-ready/);
    assert.match(document, /Role: lead/);
  } finally {
    await removeTempDir(repoDir);
  }
});
