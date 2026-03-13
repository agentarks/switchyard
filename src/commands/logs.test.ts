import test from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { writeFile } from "node:fs/promises";
import { buildDefaultConfig, writeConfig } from "../config.js";
import { createSession } from "../sessions/store.js";
import { bootstrapSwitchyardLayout } from "../storage/bootstrap.js";
import { createTempGitRepo, removeTempDir } from "../test-helpers/git.js";
import { logsCommand } from "./logs.js";

test("logsCommand prints the most recent 200 transcript lines by default", async () => {
  const repoDir = await createInitializedRepo();
  const sessionId = "session-logs-tail";
  const logPath = join(repoDir, ".switchyard", "logs", `agent-logs-tail-${sessionId}.log`);

  try {
    await createSession(repoDir, {
      id: sessionId,
      agentName: "agent-logs-tail",
      branch: "agents/agent-logs-tail",
      baseBranch: "main",
      worktreePath: join(repoDir, ".switchyard", "worktrees", "agent-logs-tail"),
      state: "running",
      runtimePid: 1212,
      createdAt: "2026-03-12T09:00:00.000Z",
      updatedAt: "2026-03-12T09:00:00.000Z"
    });
    await writeFile(
      logPath,
      Array.from({ length: 250 }, (_, index) => `line ${String(index + 1).padStart(3, "0")}`).join("\n") + "\n",
      "utf8"
    );

    const output = await captureStdout(async () => {
      await logsCommand({ selector: sessionId, startDir: repoDir });
    });

    assert.match(output, /Logs for agent-logs-tail \(session-logs-tail\):/);
    assert.match(output, /Agent: agent-logs-tail/);
    assert.match(output, /Session: session-logs-tail/);
    assert.match(output, /Log: \.switchyard\/logs\/agent-logs-tail-session-logs-tail\.log/);
    assert.doesNotMatch(output, /line 001/);
    assert.doesNotMatch(output, /line 050/);
    assert.match(output, /line 051/);
    assert.match(output, /line 250/);
  } finally {
    await removeTempDir(repoDir);
  }
});

test("logsCommand prints the full transcript when --all is requested", async () => {
  const repoDir = await createInitializedRepo();
  const sessionId = "session-logs-all";
  const logPath = join(repoDir, ".switchyard", "logs", `agent-logs-all-${sessionId}.log`);

  try {
    await createSession(repoDir, {
      id: sessionId,
      agentName: "agent-logs-all",
      branch: "agents/agent-logs-all",
      baseBranch: "main",
      worktreePath: join(repoDir, ".switchyard", "worktrees", "agent-logs-all"),
      state: "stopped",
      runtimePid: null,
      createdAt: "2026-03-12T09:05:00.000Z",
      updatedAt: "2026-03-12T09:05:00.000Z"
    });
    await writeFile(logPath, "line 001\nline 002\nline 003\n", "utf8");

    const output = await captureStdout(async () => {
      await logsCommand({ selector: "agent logs all", startDir: repoDir, showAll: true });
    });

    assert.match(output, /line 001/);
    assert.match(output, /line 002/);
    assert.match(output, /line 003/);
  } finally {
    await removeTempDir(repoDir);
  }
});

test("logsCommand renders codex exec JSONL into readable operator output", async () => {
  const repoDir = await createInitializedRepo();
  const sessionId = "session-logs-jsonl";
  const logPath = join(repoDir, ".switchyard", "logs", `agent-logs-jsonl-${sessionId}.log`);

  try {
    await createSession(repoDir, {
      id: sessionId,
      agentName: "agent-logs-jsonl",
      branch: "agents/agent-logs-jsonl",
      baseBranch: "main",
      worktreePath: join(repoDir, ".switchyard", "worktrees", "agent-logs-jsonl"),
      state: "running",
      runtimePid: 1313,
      createdAt: "2026-03-12T09:06:00.000Z",
      updatedAt: "2026-03-12T09:06:00.000Z"
    });
    await writeFile(logPath, [
      "{\"type\":\"thread.started\",\"thread_id\":\"thread-1\"}",
      "{\"type\":\"turn.started\"}",
      "{\"type\":\"item.completed\",\"item\":{\"id\":\"item_0\",\"type\":\"agent_message\",\"text\":\"hello\"}}",
      "{\"type\":\"item.started\",\"item\":{\"id\":\"item_1\",\"type\":\"command_execution\",\"command\":\"printf 'hi\\\\n'\",\"aggregated_output\":\"\",\"exit_code\":null,\"status\":\"in_progress\"}}",
      "{\"type\":\"item.completed\",\"item\":{\"id\":\"item_1\",\"type\":\"command_execution\",\"command\":\"printf 'hi\\\\n'\",\"aggregated_output\":\"hi\\n\",\"exit_code\":0,\"status\":\"completed\"}}",
      "{\"type\":\"turn.completed\",\"usage\":{\"input_tokens\":10,\"cached_input_tokens\":4,\"output_tokens\":2}}"
    ].join("\n") + "\n", "utf8");

    const output = await captureStdout(async () => {
      await logsCommand({ selector: sessionId, startDir: repoDir, showAll: true });
    });

    assert.match(output, /hello/);
    assert.match(output, /Command started: printf 'hi\\n'/);
    assert.match(output, /Command exited with 0: printf 'hi\\n'/);
    assert.match(output, /Output:\n  hi/);
    assert.match(output, /Turn completed\./);
    assert.match(output, /Usage: input=10, cached=4, output=2/);
    assert.doesNotMatch(output, /thread\.started/);
    assert.doesNotMatch(output, /turn\.started/);
  } finally {
    await removeTempDir(repoDir);
  }
});

test("logsCommand preserves malformed JSONL lines while still rendering terminal failure events", async () => {
  const repoDir = await createInitializedRepo();
  const sessionId = "session-logs-jsonl-malformed";
  const logPath = join(repoDir, ".switchyard", "logs", `agent-logs-jsonl-malformed-${sessionId}.log`);

  try {
    await createSession(repoDir, {
      id: sessionId,
      agentName: "agent-logs-jsonl-malformed",
      branch: "agents/agent-logs-jsonl-malformed",
      baseBranch: "main",
      worktreePath: join(repoDir, ".switchyard", "worktrees", "agent-logs-jsonl-malformed"),
      state: "failed",
      runtimePid: null,
      createdAt: "2026-03-12T09:07:00.000Z",
      updatedAt: "2026-03-12T09:07:00.000Z"
    });
    await writeFile(logPath, [
      "{\"type\":\"item.completed\",\"item\":{\"id\":\"item_0\",\"type\":\"agent_message\",\"text\":\"partial transcript\"}}",
      "{\"type\":\"item.started\"",
      "raw trailing line",
      "{\"type\":\"turn.failed\",\"error\":{\"message\":\"boom\"}}"
    ].join("\n") + "\n", "utf8");

    const output = await captureStdout(async () => {
      await logsCommand({ selector: sessionId, startDir: repoDir, showAll: true });
    });

    assert.match(output, /partial transcript/);
    assert.match(output, /\{\"type\":\"item\.started\"/);
    assert.match(output, /raw trailing line/);
    assert.match(output, /Turn failed: boom/);
  } finally {
    await removeTempDir(repoDir);
  }
});

test("logsCommand reports an explicit message when the session exists but the transcript file does not", async () => {
  const repoDir = await createInitializedRepo();
  const sessionId = "session-logs-missing";

  try {
    await createSession(repoDir, {
      id: sessionId,
      agentName: "agent-logs-missing",
      branch: "agents/agent-logs-missing",
      baseBranch: "main",
      worktreePath: join(repoDir, ".switchyard", "worktrees", "agent-logs-missing"),
      state: "running",
      runtimePid: 1515,
      createdAt: "2026-03-12T09:10:00.000Z",
      updatedAt: "2026-03-12T09:10:00.000Z"
    });

    const output = await captureStdout(async () => {
      await logsCommand({ selector: sessionId, startDir: repoDir });
    });

    assert.match(output, /Logs for agent-logs-missing \(session-logs-missing\):/);
    assert.match(output, /Session: session-logs-missing/);
    assert.match(output, /Log: \.switchyard\/logs\/agent-logs-missing-session-logs-missing\.log/);
    assert.match(output, /No transcript file exists yet for session session-logs-missing\./);
  } finally {
    await removeTempDir(repoDir);
  }
});

test("logsCommand rejects selectors that match multiple sessions by agent name", async () => {
  const repoDir = await createInitializedRepo();

  try {
    await createSession(repoDir, {
      id: "session-logs-duplicate-1",
      agentName: "agent-logs-duplicate",
      branch: "agents/agent-logs-duplicate-1",
      baseBranch: "main",
      worktreePath: join(repoDir, ".switchyard", "worktrees", "agent-logs-duplicate-1"),
      state: "running",
      runtimePid: 1717,
      createdAt: "2026-03-12T09:15:00.000Z",
      updatedAt: "2026-03-12T09:15:00.000Z"
    });
    await createSession(repoDir, {
      id: "session-logs-duplicate-2",
      agentName: "agent-logs-duplicate",
      branch: "agents/agent-logs-duplicate-2",
      baseBranch: "main",
      worktreePath: join(repoDir, ".switchyard", "worktrees", "agent-logs-duplicate-2"),
      state: "stopped",
      runtimePid: null,
      createdAt: "2026-03-12T09:16:00.000Z",
      updatedAt: "2026-03-12T09:16:00.000Z"
    });

    await assert.rejects(
      () => logsCommand({ selector: "agent logs duplicate", startDir: repoDir }),
      /Selector 'agent logs duplicate' is ambiguous: it matches multiple sessions by agent name/
    );
  } finally {
    await removeTempDir(repoDir);
  }
});

test("logsCommand strips the leading BSD script control-character artifact from displayed transcripts", async () => {
  const repoDir = await createInitializedRepo();
  const sessionId = "session-logs-bsd-artifact";
  const logPath = join(repoDir, ".switchyard", "logs", `agent-logs-bsd-${sessionId}.log`);

  try {
    await createSession(repoDir, {
      id: sessionId,
      agentName: "agent-logs-bsd",
      branch: "agents/agent-logs-bsd",
      baseBranch: "main",
      worktreePath: join(repoDir, ".switchyard", "worktrees", "agent-logs-bsd"),
      state: "running",
      runtimePid: 1818,
      createdAt: "2026-03-12T09:17:00.000Z",
      updatedAt: "2026-03-12T09:17:00.000Z"
    });
    await writeFile(logPath, "^D\b\bhello\r\nworld\r\n", "utf8");

    const output = await captureStdout(async () => {
      await logsCommand({ selector: sessionId, startDir: repoDir, showAll: true });
    });

    assert.doesNotMatch(output, /\^D\b\b/);
    assert.match(output, /hello/);
    assert.match(output, /world/);
  } finally {
    await removeTempDir(repoDir);
  }
});

test("logsCommand stops cleanly when stdout closes with EPIPE", async () => {
  const repoDir = await createInitializedRepo();
  const sessionId = "session-logs-epipe";
  const logPath = join(repoDir, ".switchyard", "logs", `agent-logs-epipe-${sessionId}.log`);

  try {
    await createSession(repoDir, {
      id: sessionId,
      agentName: "agent-logs-epipe",
      branch: "agents/agent-logs-epipe",
      baseBranch: "main",
      worktreePath: join(repoDir, ".switchyard", "worktrees", "agent-logs-epipe"),
      state: "running",
      runtimePid: 1919,
      createdAt: "2026-03-12T09:18:00.000Z",
      updatedAt: "2026-03-12T09:18:00.000Z"
    });
    await writeFile(logPath, "line 001\nline 002\n", "utf8");

    await assert.doesNotReject(async () => {
      await captureStdout(
        async () => {
          await logsCommand({ selector: sessionId, startDir: repoDir });
        },
        {
          failAfterWrites: 1,
          error: Object.assign(new Error("write EPIPE"), { code: "EPIPE" })
        }
      );
    });
  } finally {
    await removeTempDir(repoDir);
  }
});

async function createInitializedRepo(): Promise<string> {
  const repoDir = await createTempGitRepo("switchyard-logs-command-test-");

  await bootstrapSwitchyardLayout(repoDir);
  await writeConfig(buildDefaultConfig(repoDir, "switchyard-test", "main"));

  return repoDir;
}

async function captureStdout(
  run: () => Promise<void>,
  options?: {
    failAfterWrites?: number;
    error?: Error;
  }
): Promise<string> {
  const writes: string[] = [];
  const originalWrite = process.stdout.write.bind(process.stdout);
  let writeCount = 0;

  process.stdout.write = ((chunk: string | Uint8Array, callback?: (error?: Error | null) => void) => {
    writeCount += 1;

    if (typeof options?.failAfterWrites === "number" && writeCount > options.failAfterWrites) {
      throw options.error ?? new Error("stdout write failed");
    }

    writes.push(typeof chunk === "string" ? chunk : chunk.toString());
    callback?.(null);
    return true;
  }) as typeof process.stdout.write;

  try {
    await run();
  } finally {
    process.stdout.write = originalWrite;
  }

  return writes.join("");
}
