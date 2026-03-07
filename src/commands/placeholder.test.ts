import test from "node:test";
import assert from "node:assert/strict";
import { createPlaceholderCommand } from "./placeholder.js";

test("placeholder commands accept positional arguments without throwing", async () => {
  const command = createPlaceholderCommand("sling", "placeholder");
  const writes: string[] = [];
  const originalWrite = process.stdout.write.bind(process.stdout);

  process.stdout.write = ((chunk: string | Uint8Array) => {
    writes.push(typeof chunk === "string" ? chunk : chunk.toString());
    return true;
  }) as typeof process.stdout.write;

  try {
    await command.parseAsync(["sling", "demo-task"], { from: "user" });
  } finally {
    process.stdout.write = originalWrite;
  }

  assert.match(writes.join(""), /sling is planned but not implemented yet\./);
});
