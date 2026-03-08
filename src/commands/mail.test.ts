import test from "node:test";
import assert from "node:assert/strict";
import { buildDefaultConfig, writeConfig } from "../config.js";
import { listEvents } from "../events/store.js";
import { listMailForSession } from "../mail/store.js";
import { createSession } from "../sessions/store.js";
import { bootstrapSwitchyardLayout } from "../storage/bootstrap.js";
import { createTempGitRepo, removeTempDir } from "../test-helpers/git.js";
import { mailCheckCommand, mailSendCommand } from "./mail.js";

test("mailSendCommand stores one durable message for the resolved session", async () => {
  const repoDir = await createInitializedRepo();
  const writes: string[] = [];
  const originalWrite = process.stdout.write.bind(process.stdout);

  try {
    const session = await createSession(repoDir, {
      id: "session-agent-one",
      agentName: "agent-one",
      branch: "agents/agent-one",
      worktreePath: `${repoDir}/.switchyard/worktrees/agent-one`,
      state: "running",
      runtimePid: 1111,
      createdAt: "2026-03-06T09:00:00.000Z",
      updatedAt: "2026-03-06T09:00:00.000Z"
    });

    process.stdout.write = ((chunk: string | Uint8Array) => {
      writes.push(typeof chunk === "string" ? chunk : chunk.toString());
      return true;
    }) as typeof process.stdout.write;

    await mailSendCommand({
      selector: "agent-one",
      body: "Please pull the latest branch state.",
      startDir: repoDir
    });

    const mail = await listMailForSession(repoDir, session.id);
    assert.equal(mail.length, 1);
    assert.equal(mail[0]?.sender, "operator");
    assert.equal(mail[0]?.recipient, "agent-one");
    assert.equal(mail[0]?.body, "Please pull the latest branch state.");
    assert.equal(mail[0]?.readAt, null);
    const events = await listEvents(repoDir, { sessionId: session.id });
    assert.equal(events.length, 1);
    assert.equal(events[0]?.eventType, "mail.sent");
    assert.equal(events[0]?.payload.sender, "operator");
    assert.equal(events[0]?.payload.bodyLength, "Please pull the latest branch state.".length);
  } finally {
    process.stdout.write = originalWrite;
    await removeTempDir(repoDir);
  }

  const output = writes.join("");
  assert.match(output, /Queued mail for agent-one/);
  assert.match(output, /Session: session-agent-one/);
  assert.match(output, /Mail id: [0-9a-f-]{36}/);
});

test("mailCheckCommand prints unread mail and marks it read", async () => {
  const repoDir = await createInitializedRepo();
  const writes: string[] = [];
  const originalWrite = process.stdout.write.bind(process.stdout);

  try {
    const session = await createSession(repoDir, {
      id: "session-agent-two",
      agentName: "agent-two",
      branch: "agents/agent-two",
      worktreePath: `${repoDir}/.switchyard/worktrees/agent-two`,
      state: "running",
      runtimePid: 2222,
      createdAt: "2026-03-06T10:00:00.000Z",
      updatedAt: "2026-03-06T10:00:00.000Z"
    });

    await mailSendCommand({
      selector: session.id,
      body: "First durable message.",
      sender: "operator",
      startDir: repoDir
    });

    process.stdout.write = ((chunk: string | Uint8Array) => {
      writes.push(typeof chunk === "string" ? chunk : chunk.toString());
      return true;
    }) as typeof process.stdout.write;

    await mailCheckCommand({
      selector: "agent-two",
      startDir: repoDir
    });

    const mail = await listMailForSession(repoDir, session.id);
    assert.equal(mail.length, 1);
    assert.equal(mail[0]?.body, "First durable message.");
    assert.ok(mail[0]?.readAt);
    const events = await listEvents(repoDir, { sessionId: session.id });
    assert.equal(events.length, 2);
    assert.equal(events[0]?.eventType, "mail.sent");
    assert.equal(events[1]?.eventType, "mail.checked");
    assert.equal(events[1]?.payload.unreadCount, 1);

    writes.length = 0;
    await mailCheckCommand({
      selector: session.id,
      startDir: repoDir
    });

    const nextEvents = await listEvents(repoDir, { sessionId: session.id });
    assert.equal(nextEvents.length, 3);
    assert.equal(nextEvents[2]?.eventType, "mail.checked");
    assert.equal(nextEvents[2]?.payload.unreadCount, 0);
  } finally {
    process.stdout.write = originalWrite;
    await removeTempDir(repoDir);
  }

  assert.match(writes.join(""), /No unread mail for agent-two\./);
});

async function createInitializedRepo(): Promise<string> {
  const repoDir = await createTempGitRepo("switchyard-mail-command-test-");
  await bootstrapSwitchyardLayout(repoDir);
  await writeConfig(buildDefaultConfig(repoDir, "switchyard-test", "main"));
  return repoDir;
}
