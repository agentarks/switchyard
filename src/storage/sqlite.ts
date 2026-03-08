import process from "node:process";

let sqliteModulePromise: Promise<typeof import("node:sqlite")> | undefined;

export async function importSqlite(): Promise<typeof import("node:sqlite")> {
  if (!sqliteModulePromise) {
    sqliteModulePromise = importSqliteOnce().catch((error: unknown) => {
      sqliteModulePromise = undefined;
      throw error;
    });
  }

  return await sqliteModulePromise;
}

async function importSqliteOnce(): Promise<typeof import("node:sqlite")> {
  const originalEmitWarning = process.emitWarning;

  process.emitWarning = ((warning: string | Error, ...args: unknown[]) => {
    const warningName = typeof warning === "string" ? args[0] : warning.name;
    const warningCode = typeof warning === "string" ? args[1] : ("code" in warning ? warning.code : undefined);

    if (warningName === "ExperimentalWarning" || warningCode === "ExperimentalWarning") {
      return;
    }

    return originalEmitWarning.call(process, warning as never, ...(args as []));
  }) as typeof process.emitWarning;

  try {
    return await import("node:sqlite");
  } finally {
    process.emitWarning = originalEmitWarning;
  }
}
