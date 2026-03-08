import test from "node:test";
import assert from "node:assert/strict";
import { stopProcess } from "./process.js";

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
