#!/usr/bin/env node

import { Command } from "commander";
import { createInitCommand } from "./commands/init.js";
import { createPlaceholderCommand } from "./commands/placeholder.js";
import { SwitchyardError } from "./errors.js";

async function main(): Promise<void> {
  const program = new Command();

  program
    .name("sy")
    .description("CLI-first multi-agent orchestration for coding agents")
    .version("0.1.0");

  program.addCommand(createInitCommand());
  program.addCommand(createPlaceholderCommand("sling", "Spawn an agent into an isolated worktree"));
  program.addCommand(createPlaceholderCommand("status", "Show active agent sessions"));
  program.addCommand(createPlaceholderCommand("stop", "Stop a running agent"));
  program.addCommand(createPlaceholderCommand("mail", "Send or check inter-agent mail"));

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
