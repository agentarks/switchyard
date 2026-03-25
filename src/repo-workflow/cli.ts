#!/usr/bin/env node

import process from "node:process";
import { detectProjectRoot } from "../config.js";
import { validateRepoWorkflow } from "./validator.js";

async function main(): Promise<void> {
  const startDir = process.argv[2] ?? process.cwd();
  const projectRoot = await detectProjectRoot(startDir);
  const result = await validateRepoWorkflow(projectRoot);

  if (result.ok) {
    if (result.activeAttempt !== null && result.campaign.activeChunkId !== null) {
      process.stdout.write(
        `repo-workflow: valid campaign ${result.campaign.campaignId} chunk ${result.campaign.activeChunkId} attempt ${result.activeAttempt.attemptId}\n`
      );
      return;
    }

    process.stdout.write(`repo-workflow: valid campaign ${result.campaign.campaignId} state ${result.campaign.campaignState}\n`);
    return;
  }

  process.stderr.write(`repo-workflow: ${result.code}: ${result.message}\n`);
  process.exitCode = 1;
}

void main();
