#!/usr/bin/env node

import { Command } from "commander";
import { createEventsCommand } from "./commands/events.js";
import { createInitCommand } from "./commands/init.js";
import { createLogsCommand } from "./commands/logs.js";
import { createMailCommand } from "./commands/mail.js";
import { createMergeCommand } from "./commands/merge.js";
import { createSlingCommand } from "./commands/sling.js";
import { createStopCommand } from "./commands/stop.js";
import { createStatusCommand } from "./commands/status.js";
import { SwitchyardError } from "./errors.js";

async function main(): Promise<void> {
  const program = new Command();

  program
    .name("sy")
    .description("CLI-first multi-agent orchestration for coding agents")
    .version("0.1.0");

  program.addCommand(createInitCommand());
  program.addCommand(createEventsCommand());
  program.addCommand(createLogsCommand());
  program.addCommand(createSlingCommand());
  program.addCommand(createStatusCommand());
  program.addCommand(createStopCommand());
  program.addCommand(createMergeCommand());
  program.addCommand(createMailCommand());

  try {
    await program.parseAsync(process.argv);
  } catch (error) {
    if (error instanceof SwitchyardError) {
      process.stderr.write(`${error.code}: ${error.message}\n`);
      process.exitCode = 1;
      return;
    }

    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`UNHANDLED_ERROR: ${message}\n`);
    process.exitCode = 1;
  }
}

void main();
