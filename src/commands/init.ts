import { access } from "node:fs/promises";
import { join } from "node:path";
import { Command } from "commander";
import {
  buildDefaultConfig,
  detectCanonicalBranch,
  detectProjectRoot,
  getProjectName,
  writeConfig
} from "../config.js";
import { InitError } from "../errors.js";
import { bootstrapSwitchyardLayout } from "../storage/bootstrap.js";

interface InitOptions {
  force?: boolean;
  name?: string;
  canonicalBranch?: string;
}

export function createInitCommand(): Command {
  return new Command("init")
    .description("Initialize Switchyard in the current git repository")
    .option("--force", "Overwrite an existing .switchyard/config.yaml")
    .option("--name <name>", "Override the detected project name")
    .option("--canonical-branch <branch>", "Override the detected canonical branch")
    .action(async (options: InitOptions) => {
      await initCommand(options);
    });
}

export async function initCommand(options: InitOptions): Promise<void> {
  const projectRoot = await detectProjectRoot();
  const configPath = join(projectRoot, ".switchyard", "config.yaml");

  if (!options.force) {
    let exists = false;
    try {
      await access(configPath);
      exists = true;
    } catch {
      // Missing config is expected for first init.
    }
    if (exists) {
      throw new InitError("Switchyard is already initialized. Re-run with --force to overwrite config.");
    }
  }

  const projectName = options.name ?? getProjectName(projectRoot);
  const canonicalBranch = options.canonicalBranch ?? (await detectCanonicalBranch(projectRoot));
  const config = buildDefaultConfig(projectRoot, projectName, canonicalBranch);

  await bootstrapSwitchyardLayout(projectRoot);
  await writeConfig(config);

  process.stdout.write(`Initialized Switchyard in ${projectRoot}\n`);
  process.stdout.write(`Config: ${configPath}\n`);
  process.stdout.write("Next step: implement spawn/status/stop workflows.\n");
}
