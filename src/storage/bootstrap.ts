import { mkdir, open, writeFile } from "node:fs/promises";
import { join } from "node:path";

const SWITCHYARD_GITIGNORE = `*
!.gitignore
!README.md
!config.yaml
`;

const SWITCHYARD_README = `# .switchyard

Local runtime state for Switchyard.

Tracked files:
- config.yaml

Ignored files:
- SQLite databases
- objective specs and agent result envelopes
- logs
- worktrees
- run markers and generated artifacts

Database schema is created lazily by the store layer when each database is first opened.
`;

export async function bootstrapSwitchyardLayout(projectRoot: string): Promise<void> {
  const switchyardDir = join(projectRoot, ".switchyard");

  await mkdir(join(switchyardDir, "worktrees"), { recursive: true });
  await mkdir(join(switchyardDir, "logs"), { recursive: true });
  await mkdir(join(switchyardDir, "agents"), { recursive: true });
  await mkdir(join(switchyardDir, "specs"), { recursive: true });
  await mkdir(join(switchyardDir, "objectives"), { recursive: true });
  await mkdir(join(switchyardDir, "agent-results"), { recursive: true });

  await writeFile(join(switchyardDir, ".gitignore"), SWITCHYARD_GITIGNORE, "utf8");
  await writeFile(join(switchyardDir, "README.md"), SWITCHYARD_README, "utf8");

  await ensureFile(join(switchyardDir, "sessions.db"));
  await ensureFile(join(switchyardDir, "runs.db"));
  await ensureFile(join(switchyardDir, "orchestration.db"));
  await ensureFile(join(switchyardDir, "mail.db"));
  await ensureFile(join(switchyardDir, "events.db"));
}

async function ensureFile(path: string): Promise<void> {
  const handle = await open(path, "a");
  await handle.close();
}
