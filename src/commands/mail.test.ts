import test from "node:test";
import assert from "node:assert/strict";
import { buildDefaultConfig, writeConfig } from "../config.js";
import { listEvents } from "../events/store.js";
import { MailError } from "../errors.js";
import { createMail, listMailForSession, readUnreadMailForSession } from "../mail/store.js";
import { createSession } from "../sessions/store.js";
import { bootstrapSwitchyardLayout } from "../storage/bootstrap.js";
import { createTempGitRepo, removeTempDir } from "../test-helpers/git.js";
import { mailCheckCommand, mailListCommand, mailSendCommand } from "./mail.js";

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

test("mailSendCommand keeps queued mail when event persistence fails", async () => {
  const repoDir = await createInitializedRepo();

  try {
    const session = await createSession(repoDir, {
      id: "session-agent-three",
      agentName: "agent-three",
      branch: "agents/agent-three",
      worktreePath: `${repoDir}/.switchyard/worktrees/agent-three`,
      state: "running",
      runtimePid: 3333,
      createdAt: "2026-03-06T11:00:00.000Z",
      updatedAt: "2026-03-06T11:00:00.000Z"
    });

    await mailSendCommand({
      selector: session.id,
      body: "Event writes should not block mail.",
      startDir: repoDir,
      recordEvent: async () => {
        throw new Error("events unavailable");
      }
    });

    const mail = await listMailForSession(repoDir, session.id);
    assert.equal(mail.length, 1);
    assert.equal(mail[0]?.body, "Event writes should not block mail.");
    const events = await listEvents(repoDir, { sessionId: session.id });
    assert.deepEqual(events, []);
  } finally {
    await removeTempDir(repoDir);
  }
});

test("mailCheckCommand still marks mail read when event persistence fails", async () => {
  const repoDir = await createInitializedRepo();

  try {
    const session = await createSession(repoDir, {
      id: "session-agent-four",
      agentName: "agent-four",
      branch: "agents/agent-four",
      worktreePath: `${repoDir}/.switchyard/worktrees/agent-four`,
      state: "running",
      runtimePid: 4444,
      createdAt: "2026-03-06T12:00:00.000Z",
      updatedAt: "2026-03-06T12:00:00.000Z"
    });

    await mailSendCommand({
      selector: session.id,
      body: "Read path should still succeed.",
      startDir: repoDir
    });

    await mailCheckCommand({
      selector: session.id,
      startDir: repoDir,
      recordEvent: async () => {
        throw new Error("events unavailable");
      }
    });

    const mail = await listMailForSession(repoDir, session.id);
    assert.equal(mail.length, 1);
    assert.ok(mail[0]?.readAt);
    const events = await listEvents(repoDir, { sessionId: session.id });
    assert.equal(events.length, 1);
    assert.equal(events[0]?.eventType, "mail.sent");
  } finally {
    await removeTempDir(repoDir);
  }
});

test("mailListCommand prints mailbox history without changing read state", async () => {
  const repoDir = await createInitializedRepo();
  const writes: string[] = [];
  const originalWrite = process.stdout.write.bind(process.stdout);

  try {
    const session = await createSession(repoDir, {
      id: "session-agent-five",
      agentName: "agent-five",
      branch: "agents/agent-five",
      worktreePath: `${repoDir}/.switchyard/worktrees/agent-five`,
      state: "running",
      runtimePid: 5555,
      createdAt: "2026-03-06T13:00:00.000Z",
      updatedAt: "2026-03-06T13:00:00.000Z"
    });

    const firstMessage = await createMail(repoDir, {
      sessionId: session.id,
      sender: "operator",
      recipient: session.agentName,
      body: "First mailbox message.",
      createdAt: "2026-03-06T13:05:00.000Z"
    });
    const secondMessage = await createMail(repoDir, {
      sessionId: session.id,
      sender: session.agentName,
      recipient: "operator",
      body: "Second mailbox message.",
      createdAt: "2026-03-06T13:10:00.000Z"
    });
    await readUnreadMailForSession(repoDir, session.id);
    const thirdMessage = await createMail(repoDir, {
      sessionId: session.id,
      sender: "operator",
      recipient: session.agentName,
      body: "Unread mailbox message.",
      createdAt: "2026-03-06T13:15:00.000Z"
    });
    const mailBeforeList = await listMailForSession(repoDir, session.id);

    process.stdout.write = ((chunk: string | Uint8Array) => {
      writes.push(typeof chunk === "string" ? chunk : chunk.toString());
      return true;
    }) as typeof process.stdout.write;

    await mailListCommand({
      selector: "agent-five",
      startDir: repoDir
    });

    const mailAfterList = await listMailForSession(repoDir, session.id);
    assert.deepEqual(mailAfterList, mailBeforeList);

    const events = await listEvents(repoDir, { sessionId: session.id });
    assert.equal(events.length, 1);
    assert.equal(events[0]?.eventType, "mail.listed");
    assert.equal(events[0]?.payload.view, "full");
    assert.equal(events[0]?.payload.messageCount, 3);
    assert.equal(events[0]?.payload.unreadCount, 1);

    assert.equal(mailAfterList[0]?.id, firstMessage.id);
    assert.equal(mailAfterList[1]?.id, secondMessage.id);
    assert.equal(mailAfterList[2]?.id, thirdMessage.id);
    assert.equal(mailAfterList[2]?.readAt, null);
  } finally {
    process.stdout.write = originalWrite;
    await removeTempDir(repoDir);
  }

  const output = writes.join("");
  assert.match(output, /Mailbox for agent-five \(read-only\):/);
  assert.match(output, /read\t2026-03-06T13:05:00.000Z\toperator\t[0-9a-f-]{36}\treadAt=20\d{2}-/);
  assert.match(output, /First mailbox message\./);
  assert.match(output, /read\t2026-03-06T13:10:00.000Z\tagent-five\t[0-9a-f-]{36}\treadAt=20\d{2}-/);
  assert.match(output, /Second mailbox message\./);
  assert.match(output, /unread\t2026-03-06T13:15:00.000Z\toperator\t[0-9a-f-]{36}/);
  assert.match(output, /Unread mailbox message\./);
  assert.match(output, /Listed 3 messages; 1 unread\./);
});

test("mailListCommand reports an empty mailbox without mutating state", async () => {
  const repoDir = await createInitializedRepo();
  const writes: string[] = [];
  const originalWrite = process.stdout.write.bind(process.stdout);

  try {
    const session = await createSession(repoDir, {
      id: "session-agent-six",
      agentName: "agent-six",
      branch: "agents/agent-six",
      worktreePath: `${repoDir}/.switchyard/worktrees/agent-six`,
      state: "running",
      runtimePid: 6666,
      createdAt: "2026-03-06T14:00:00.000Z",
      updatedAt: "2026-03-06T14:00:00.000Z"
    });

    process.stdout.write = ((chunk: string | Uint8Array) => {
      writes.push(typeof chunk === "string" ? chunk : chunk.toString());
      return true;
    }) as typeof process.stdout.write;

    await mailListCommand({
      selector: session.id,
      startDir: repoDir
    });

    const mail = await listMailForSession(repoDir, session.id);
    assert.deepEqual(mail, []);

    const events = await listEvents(repoDir, { sessionId: session.id });
    assert.equal(events.length, 1);
    assert.equal(events[0]?.eventType, "mail.listed");
    assert.equal(events[0]?.payload.view, "full");
    assert.equal(events[0]?.payload.messageCount, 0);
    assert.equal(events[0]?.payload.unreadCount, 0);
  } finally {
    process.stdout.write = originalWrite;
    await removeTempDir(repoDir);
  }

  assert.match(writes.join(""), /No mail for agent-six\./);
});

test("mailListCommand can show only unread mail without changing read state", async () => {
  const repoDir = await createInitializedRepo();
  const writes: string[] = [];
  const originalWrite = process.stdout.write.bind(process.stdout);

  try {
    const session = await createSession(repoDir, {
      id: "session-agent-seven",
      agentName: "agent-seven",
      branch: "agents/agent-seven",
      worktreePath: `${repoDir}/.switchyard/worktrees/agent-seven`,
      state: "running",
      runtimePid: 7777,
      createdAt: "2026-03-06T15:00:00.000Z",
      updatedAt: "2026-03-06T15:00:00.000Z"
    });

    await createMail(repoDir, {
      sessionId: session.id,
      sender: "operator",
      recipient: session.agentName,
      body: "Already read mailbox message.",
      createdAt: "2026-03-06T15:05:00.000Z"
    });
    await readUnreadMailForSession(repoDir, session.id);
    const unreadMessage = await createMail(repoDir, {
      sessionId: session.id,
      sender: session.agentName,
      recipient: "operator",
      body: "Unread-only mailbox message.",
      createdAt: "2026-03-06T15:10:00.000Z"
    });
    const mailBeforeList = await listMailForSession(repoDir, session.id);

    process.stdout.write = ((chunk: string | Uint8Array) => {
      writes.push(typeof chunk === "string" ? chunk : chunk.toString());
      return true;
    }) as typeof process.stdout.write;

    await mailListCommand({
      selector: session.id,
      unreadOnly: true,
      startDir: repoDir
    });

    const mailAfterList = await listMailForSession(repoDir, session.id);
    assert.deepEqual(mailAfterList, mailBeforeList);

    const events = await listEvents(repoDir, { sessionId: session.id });
    assert.equal(events.length, 1);
    assert.equal(events[0]?.eventType, "mail.listed");
    assert.equal(events[0]?.payload.view, "unread_only");
    assert.equal(events[0]?.payload.messageCount, 1);
    assert.equal(events[0]?.payload.unreadCount, 1);

    assert.equal(mailAfterList[1]?.id, unreadMessage.id);
    assert.equal(mailAfterList[1]?.readAt, null);
  } finally {
    process.stdout.write = originalWrite;
    await removeTempDir(repoDir);
  }

  const output = writes.join("");
  assert.match(output, /Unread mail for agent-seven \(read-only\):/);
  assert.doesNotMatch(output, /Already read mailbox message\./);
  assert.match(output, /unread\t2026-03-06T15:10:00.000Z\tagent-seven\t[0-9a-f-]{36}/);
  assert.match(output, /Unread-only mailbox message\./);
  assert.match(output, /Listed 1 message; unread-only view, read state unchanged\./);
});

test("mailListCommand with unreadOnly reports no unread mail without mutating state", async () => {
  const repoDir = await createInitializedRepo();
  const writes: string[] = [];
  const originalWrite = process.stdout.write.bind(process.stdout);

  try {
    const session = await createSession(repoDir, {
      id: "session-agent-eight",
      agentName: "agent-eight",
      branch: "agents/agent-eight",
      worktreePath: `${repoDir}/.switchyard/worktrees/agent-eight`,
      state: "running",
      runtimePid: 8888,
      createdAt: "2026-03-06T16:00:00.000Z",
      updatedAt: "2026-03-06T16:00:00.000Z"
    });

    await createMail(repoDir, {
      sessionId: session.id,
      sender: "operator",
      recipient: session.agentName,
      body: "Read mailbox message.",
      createdAt: "2026-03-06T16:05:00.000Z"
    });
    await readUnreadMailForSession(repoDir, session.id);
    const mailBeforeList = await listMailForSession(repoDir, session.id);

    process.stdout.write = ((chunk: string | Uint8Array) => {
      writes.push(typeof chunk === "string" ? chunk : chunk.toString());
      return true;
    }) as typeof process.stdout.write;

    await mailListCommand({
      selector: "agent-eight",
      unreadOnly: true,
      startDir: repoDir
    });

    const mailAfterList = await listMailForSession(repoDir, session.id);
    assert.deepEqual(mailAfterList, mailBeforeList);

    const events = await listEvents(repoDir, { sessionId: session.id });
    assert.equal(events.length, 1);
    assert.equal(events[0]?.eventType, "mail.listed");
    assert.equal(events[0]?.payload.view, "unread_only");
    assert.equal(events[0]?.payload.messageCount, 0);
    assert.equal(events[0]?.payload.unreadCount, 0);
  } finally {
    process.stdout.write = originalWrite;
    await removeTempDir(repoDir);
  }

  assert.match(writes.join(""), /No unread mail for agent-eight\./);
});

test("mailListCommand rejects selectors that match different sessions by id and agent name", async () => {
  const repoDir = await createInitializedRepo();

  try {
    const idMatchedSession = await createSession(repoDir, {
      id: "shared-name",
      agentName: "other-agent",
      branch: "agents/other-agent",
      worktreePath: `${repoDir}/.switchyard/worktrees/other-agent`,
      state: "running",
      runtimePid: 7771,
      createdAt: "2026-03-06T15:00:00.000Z",
      updatedAt: "2026-03-06T15:00:00.000Z"
    });
    const agentMatchedSession = await createSession(repoDir, {
      id: "session-seven",
      agentName: "shared-name",
      branch: "agents/shared-name",
      worktreePath: `${repoDir}/.switchyard/worktrees/shared-name`,
      state: "running",
      runtimePid: 7772,
      createdAt: "2026-03-06T15:05:00.000Z",
      updatedAt: "2026-03-06T15:05:00.000Z"
    });

    await assert.rejects(
      () =>
        mailListCommand({
          selector: "shared-name",
          startDir: repoDir
        }),
      (error: unknown) => {
        assert.ok(error instanceof MailError);
        assert.match(
          error.message,
          /Selector 'shared-name' is ambiguous: it matches session 'shared-name' by id and session 'session-seven' by agent name\./
        );
        return true;
      }
    );

    const idMailbox = await listMailForSession(repoDir, idMatchedSession.id);
    const agentMailbox = await listMailForSession(repoDir, agentMatchedSession.id);
    assert.deepEqual(idMailbox, []);
    assert.deepEqual(agentMailbox, []);
    const events = await listEvents(repoDir, { limit: 10 });
    assert.deepEqual(events, []);
  } finally {
    await removeTempDir(repoDir);
  }
});

test("mailSendCommand rejects selectors that match different sessions by id and agent name", async () => {
  const repoDir = await createInitializedRepo();

  try {
    await createSession(repoDir, {
      id: "shared-name",
      agentName: "other-agent",
      branch: "agents/other-agent",
      worktreePath: `${repoDir}/.switchyard/worktrees/other-agent`,
      state: "running",
      runtimePid: 8881,
      createdAt: "2026-03-06T16:00:00.000Z",
      updatedAt: "2026-03-06T16:00:00.000Z"
    });
    await createSession(repoDir, {
      id: "session-eight",
      agentName: "shared-name",
      branch: "agents/shared-name",
      worktreePath: `${repoDir}/.switchyard/worktrees/shared-name`,
      state: "running",
      runtimePid: 8882,
      createdAt: "2026-03-06T16:05:00.000Z",
      updatedAt: "2026-03-06T16:05:00.000Z"
    });

    await assert.rejects(
      () =>
        mailSendCommand({
          selector: "shared-name",
          body: "This should not be sent.",
          startDir: repoDir
        }),
      (error: unknown) => {
        assert.ok(error instanceof MailError);
        assert.match(error.message, /Selector 'shared-name' is ambiguous:/);
        return true;
      }
    );

    const events = await listEvents(repoDir, { limit: 10 });
    assert.deepEqual(events, []);
  } finally {
    await removeTempDir(repoDir);
  }
});

async function createInitializedRepo(): Promise<string> {
  const repoDir = await createTempGitRepo("switchyard-mail-command-test-");
  await bootstrapSwitchyardLayout(repoDir);
  await writeConfig(buildDefaultConfig(repoDir, "switchyard-test", "main"));
  return repoDir;
}
