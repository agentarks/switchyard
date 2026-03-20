import test from "node:test";
import assert from "node:assert/strict";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bootstrapSwitchyardLayout } from "./bootstrap.js";

test("bootstrapSwitchyardLayout creates state files without emitting warnings", async () => {
  const root = await mkdtemp(join(tmpdir(), "switchyard-bootstrap-test-"));
  const warnings: Error[] = [];
  const onWarning = (warning: Error) => {
    warnings.push(warning);
  };

  process.on("warning", onWarning);

  try {
    await bootstrapSwitchyardLayout(root);

    const switchyardDir = join(root, ".switchyard");
    const readme = await readFile(join(switchyardDir, "README.md"), "utf8");

    assert.match(readme, /Database schema is created lazily/);
    await access(join(switchyardDir, "objectives"));
    await access(join(switchyardDir, "agent-results"));
    await readFile(join(switchyardDir, "sessions.db"));
    await readFile(join(switchyardDir, "runs.db"));
    await readFile(join(switchyardDir, "orchestration.db"));
    await readFile(join(switchyardDir, "mail.db"));
    await readFile(join(switchyardDir, "events.db"));
    assert.equal(warnings.length, 0);
  } finally {
    process.off("warning", onWarning);
    await rm(root, { recursive: true, force: true });
  }
});
