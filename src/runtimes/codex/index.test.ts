import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import type { ChildProcess, spawn, SpawnOptions } from "node:child_process";
import { access, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { setTimeout as delay } from "node:timers/promises";
import { spawnCodexSession } from "./index.js";

test("spawnCodexSession reports the observed readiness delay from spawn through launch setup", async () => {
  const child = new FakeChildProcess();
  const spawned: Array<{ pid: number; command: string }> = [];

  const sessionPromise = spawnCodexSession({
    worktreePath: "/tmp/switchyard-test",
    readyTimeoutMs: 5,
    spawnProcess: (() => {
      queueMicrotask(() => {
        child.emit("spawn");
      });
      return child as unknown as ChildProcess;
    }) as unknown as typeof spawn,
    onSpawned: async (runtime) => {
      spawned.push({
        pid: runtime.pid,
        command: [runtime.command.command, ...runtime.command.args].join(" ")
      });

      await delay(40);
    }
  });

  const session = await sessionPromise;

  assert.equal(session.pid, 4242);
  assert.ok(session.readyAfterMs >= 40);
  assert.equal(child.unrefCalled, true);
  assert.deepEqual(spawned, [{ pid: 4242, command: "codex" }]);
});

test("spawnCodexSession rejects when Codex exits before the readiness window completes", async () => {
  const child = new FakeChildProcess();

  const sessionPromise = spawnCodexSession({
    worktreePath: "/tmp/switchyard-test",
    readyTimeoutMs: 25,
    spawnProcess: (() => {
      queueMicrotask(() => {
        child.emit("spawn");
        queueMicrotask(() => {
          child.emit("exit", 1, null);
        });
      });
      return child as unknown as ChildProcess;
    }) as unknown as typeof spawn
  });

  await assert.rejects(sessionPromise, /Codex exited before Switchyard marked the session ready \(exit code 1\)\./);
  assert.equal(child.unrefCalled, false);
});

test("spawnCodexSession launches Codex through script on darwin while reporting the logical Codex command", async () => {
  const child = new FakeChildProcess();
  const spawns: Array<{ command: string; args: string[]; detached?: boolean; stdio?: SpawnOptions["stdio"] }> = [];
  const logPath = "/tmp/switchyard-test/agent-one-session.log";

  const session = await spawnCodexSession({
    runtimeArgs: ["--model", "gpt-5"],
    logPath,
    worktreePath: "/tmp/switchyard-test",
    readyTimeoutMs: 0,
    platform: "darwin",
    spawnProcess: ((command: string, args: readonly string[], options?: SpawnOptions) => {
      spawns.push({
        command,
        args: [...args],
        detached: options?.detached,
        stdio: options?.stdio
      });
      queueMicrotask(() => {
        child.emit("spawn");
      });
      return child as unknown as ChildProcess;
    }) as unknown as typeof spawn
  });

  assert.deepEqual(spawns, [{
    command: "script",
    args: ["-q", "-e", logPath, "codex", "--model", "gpt-5"],
    detached: true,
    stdio: "ignore"
  }]);
  assert.equal(session.command.command, "codex");
  assert.deepEqual(session.command.args, ["--model", "gpt-5"]);
});

test("spawnCodexSession launches Codex through script with util-linux syntax on linux", async () => {
  const child = new FakeChildProcess();
  const spawns: Array<{ command: string; args: string[] }> = [];
  const logPath = "/tmp/switchyard-test/agent-one-session.log";

  await spawnCodexSession({
    runtimeArgs: ["--model", "gpt-5"],
    logPath,
    worktreePath: "/tmp/switchyard-test",
    readyTimeoutMs: 0,
    platform: "linux",
    spawnProcess: ((command: string, args: readonly string[]) => {
      spawns.push({ command, args: [...args] });
      queueMicrotask(() => {
        child.emit("spawn");
      });
      return child as unknown as ChildProcess;
    }) as unknown as typeof spawn
  });

  assert.deepEqual(spawns, [{
    command: "script",
    args: ["-q", "-e", logPath, "--", "codex", "--model", "gpt-5"]
  }]);
});

test("spawnCodexSession redirects direct detached fallback output to one session log file", async () => {
  const child = new FakeChildProcess();
  const tempDir = await mkdtemp(join(tmpdir(), "switchyard-codex-log-test-"));
  const logPath = join(tempDir, "agent-one-session.log");
  const spawns: Array<{ command: string; args: string[]; stdio?: SpawnOptions["stdio"] }> = [];

  try {
    await spawnCodexSession({
      runtimeArgs: ["--json"],
      logPath,
      worktreePath: "/tmp/switchyard-test",
      readyTimeoutMs: 0,
      platform: "win32",
      spawnProcess: ((command: string, args: readonly string[], options?: SpawnOptions) => {
        spawns.push({
          command,
          args: [...args],
          stdio: options?.stdio
        });
        queueMicrotask(() => {
          child.emit("spawn");
        });
        return child as unknown as ChildProcess;
      }) as unknown as typeof spawn
    });

    assert.equal(spawns.length, 1);
    assert.equal(spawns[0]?.command, "codex");
    assert.deepEqual(spawns[0]?.args, ["--json"]);
    assert.ok(Array.isArray(spawns[0]?.stdio));
    assert.equal(spawns[0]?.stdio?.[0], "ignore");
    assert.equal(typeof spawns[0]?.stdio?.[1], "number");
    assert.equal(spawns[0]?.stdio?.[1], spawns[0]?.stdio?.[2]);
    await access(logPath);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("spawnCodexSession reports a clear wrapper error when script is unavailable", async () => {
  const child = new FakeChildProcess();

  const sessionPromise = spawnCodexSession({
    worktreePath: "/tmp/switchyard-test",
    platform: "darwin",
    spawnProcess: (() => {
      queueMicrotask(() => {
        const error = Object.assign(new Error("spawn script ENOENT"), { code: "ENOENT" });
        child.emit("error", error);
      });
      return child as unknown as ChildProcess;
    }) as unknown as typeof spawn
  });

  await assert.rejects(sessionPromise, /pseudo-terminal wrapper 'script' is not available on PATH/);
});

class FakeChildProcess extends EventEmitter {
  pid = 4242;
  unrefCalled = false;

  unref(): void {
    this.unrefCalled = true;
  }
}
