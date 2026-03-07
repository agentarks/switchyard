import { Command } from "commander";

export function createPlaceholderCommand(name: string, description: string): Command {
  return new Command(name)
    .description(description)
    .allowUnknownOption(true)
    .action(() => {
      process.stdout.write(`${name} is planned but not implemented yet.\n`);
    });
}
