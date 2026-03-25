#!/usr/bin/env node

import process from "node:process";
import { detectProjectRoot } from "../config.js";
import { validateRepoWorkflow } from "./validator.js";

async function main(): Promise<void> {
  const startDir = process.argv[2] ?? process.cwd();
  const projectRoot = await detectProjectRoot(startDir);
  const result = await validateRepoWorkflow(projectRoot);

  if (result.ok) {
    process.stdout.write(
      `repo-workflow: valid campaign ${result.campaign.campaignId} chunk ${result.campaign.activeChunkId} attempt ${result.activeAttempt.attemptId}\n`
    );
    return;
  }

  process.stderr.write(`repo-workflow: ${result.code}: ${result.message}\n`);
  process.exitCode = 1;
}

void main();
