import { mkdir, writeFile } from "node:fs/promises";
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
- logs
- worktrees
- run markers
`;

export async function bootstrapSwitchyardLayout(projectRoot: string): Promise<void> {
  const switchyardDir = join(projectRoot, ".switchyard");

  await mkdir(join(switchyardDir, "worktrees"), { recursive: true });
  await mkdir(join(switchyardDir, "logs"), { recursive: true });
  await mkdir(join(switchyardDir, "agents"), { recursive: true });
  await mkdir(join(switchyardDir, "specs"), { recursive: true });

  await writeFile(join(switchyardDir, ".gitignore"), SWITCHYARD_GITIGNORE, "utf8");
  await writeFile(join(switchyardDir, "README.md"), SWITCHYARD_README, "utf8");

  await initializeDatabase(join(switchyardDir, "sessions.db"), `
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      agent_name TEXT NOT NULL UNIQUE,
      capability TEXT NOT NULL,
      runtime TEXT NOT NULL,
      task_id TEXT NOT NULL,
      branch_name TEXT NOT NULL,
      worktree_path TEXT NOT NULL,
      tmux_session TEXT,
      pid INTEGER,
      state TEXT NOT NULL,
      started_at TEXT NOT NULL,
      last_activity TEXT NOT NULL,
      run_id TEXT
    );
  `);

  await initializeDatabase(join(switchyardDir, "mail.db"), `
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      from_agent TEXT NOT NULL,
      to_agent TEXT NOT NULL,
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      type TEXT NOT NULL,
      priority TEXT NOT NULL,
      read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
  `);

  await initializeDatabase(join(switchyardDir, "events.db"), `
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id TEXT,
      agent_name TEXT NOT NULL,
      event_type TEXT NOT NULL,
      level TEXT NOT NULL,
      data TEXT,
      created_at TEXT NOT NULL
    );
  `);
}

async function initializeDatabase(path: string, schema: string): Promise<void> {
  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(path);
  db.exec(schema);
  db.close();
}
