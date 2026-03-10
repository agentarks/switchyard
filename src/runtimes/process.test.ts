import test from "node:test";
import assert from "node:assert/strict";
import { inspectProcessLiveness, stopProcess } from "./process.js";

test("inspectProcessLiveness reports Unix zombie processes distinctly", () => {
  const liveness = inspectProcessLiveness(4242, {
    signalProcess: (_pid, signal) => {
      assert.equal(signal, 0);
    },
    readProcessState: () => "Z+",
    platform: "darwin"
  });

  assert.deepEqual(liveness, {
    alive: false,
    reason: "process_state_zombie"
  });
});

test("inspectProcessLiveness skips zombie inspection on Windows", () => {
  const liveness = inspectProcessLiveness(4242, {
    signalProcess: (_pid, signal) => {
      assert.equal(signal, 0);
    },
    readProcessState: () => {
      throw new Error("should not inspect process state on Windows");
    },
    platform: "win32"
  });

  assert.deepEqual(liveness, {
    alive: true,
    reason: "pid_alive"
  });
});

test("stopProcess treats ESRCH during SIGTERM as an already-stopped success", async () => {
  const signals: Array<NodeJS.Signals | 0 | undefined> = [];

  const stopped = await stopProcess(4242, {
    isAlive: (pid) => {
      assert.equal(pid, 4242);
      return true;
    },
    signalProcess: (_pid, signal) => {
      signals.push(signal);
      const error = new Error("missing process") as NodeJS.ErrnoException;
      error.code = "ESRCH";
      throw error;
    }
  });

  assert.equal(stopped, true);
  assert.deepEqual(signals, ["SIGTERM"]);
});
