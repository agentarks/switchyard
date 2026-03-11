import test from "node:test";
import assert from "node:assert/strict";
import { bootstrapSwitchyardLayout } from "../storage/bootstrap.js";
import { createTempGitRepo, removeTempDir } from "../test-helpers/git.js";
import {
  createMail,
  initializeMailStore,
  listLatestUnreadMailBySession,
  listMailForSession,
  listUnreadMailCountsBySession,
  readUnreadMailForSession
} from "./store.js";

test("initializeMailStore creates the mail schema without records", async () => {
  const repoDir = await createTempGitRepo("switchyard-mail-store-test-");

  try {
    await bootstrapSwitchyardLayout(repoDir);
    await initializeMailStore(repoDir);

    const mail = await listMailForSession(repoDir, "missing-session");
    assert.deepEqual(mail, []);
  } finally {
    await removeTempDir(repoDir);
  }
});

test("listMailForSession returns inserted mail ordered by creation time", async () => {
  const repoDir = await createTempGitRepo("switchyard-mail-store-test-");

  try {
    await bootstrapSwitchyardLayout(repoDir);

    const firstMessage = await createMail(repoDir, {
      sessionId: "session-1",
      sender: "operator",
      recipient: "agent-one",
      body: "First message",
      createdAt: "2026-03-06T09:00:00.000Z"
    });
    const secondMessage = await createMail(repoDir, {
      sessionId: "session-1",
      sender: "agent-one",
      recipient: "operator",
      body: "Second message",
      createdAt: "2026-03-06T10:00:00.000Z"
    });
    await createMail(repoDir, {
      sessionId: "session-2",
      sender: "operator",
      recipient: "agent-two",
      body: "Other mailbox",
      createdAt: "2026-03-06T11:00:00.000Z"
    });

    const mail = await listMailForSession(repoDir, "session-1");

    assert.equal(mail.length, 2);
    assert.equal(mail[0]?.id, firstMessage.id);
    assert.equal(mail[1]?.id, secondMessage.id);
    assert.deepEqual(mail[0], {
      id: firstMessage.id,
      sessionId: "session-1",
      sender: "operator",
      recipient: "agent-one",
      body: "First message",
      createdAt: "2026-03-06T09:00:00.000Z",
      readAt: null
    });
  } finally {
    await removeTempDir(repoDir);
  }
});

test("readUnreadMailForSession returns unread mail and marks it read", async () => {
  const repoDir = await createTempGitRepo("switchyard-mail-store-test-");

  try {
    await bootstrapSwitchyardLayout(repoDir);

    await createMail(repoDir, {
      sessionId: "session-1",
      sender: "operator",
      recipient: "agent-one",
      body: "Unread message",
      createdAt: "2026-03-06T09:00:00.000Z"
    });

    const unreadMail = await readUnreadMailForSession(repoDir, "session-1");
    assert.equal(unreadMail.length, 1);
    assert.equal(unreadMail[0]?.body, "Unread message");
    assert.match(unreadMail[0]?.readAt ?? "", /^2026-|^20\d{2}-/);

    const storedMail = await listMailForSession(repoDir, "session-1");
    assert.equal(storedMail[0]?.readAt, unreadMail[0]?.readAt);

    const secondRead = await readUnreadMailForSession(repoDir, "session-1");
    assert.deepEqual(secondRead, []);
  } finally {
    await removeTempDir(repoDir);
  }
});

test("readUnreadMailForSession delivers unread mail to only one concurrent reader", async () => {
  const repoDir = await createTempGitRepo("switchyard-mail-store-test-");

  try {
    await bootstrapSwitchyardLayout(repoDir);

    const createdMessage = await createMail(repoDir, {
      sessionId: "session-1",
      sender: "operator",
      recipient: "agent-one",
      body: "Only one reader should receive this.",
      createdAt: "2026-03-06T09:00:00.000Z"
    });

    const [firstRead, secondRead] = await Promise.all([
      readUnreadMailForSession(repoDir, "session-1"),
      readUnreadMailForSession(repoDir, "session-1")
    ]);

    assert.deepEqual(
      [firstRead.length, secondRead.length].sort((left, right) => left - right),
      [0, 1]
    );

    const deliveredMessages = [...firstRead, ...secondRead];
    assert.equal(deliveredMessages.length, 1);
    assert.equal(deliveredMessages[0]?.id, createdMessage.id);

    const storedMail = await listMailForSession(repoDir, "session-1");
    assert.ok(storedMail[0]?.readAt);
  } finally {
    await removeTempDir(repoDir);
  }
});

test("listUnreadMailCountsBySession returns unread counts for the requested sessions only", async () => {
  const repoDir = await createTempGitRepo("switchyard-mail-store-test-");

  try {
    await bootstrapSwitchyardLayout(repoDir);

    await createMail(repoDir, {
      sessionId: "session-1",
      sender: "operator",
      recipient: "agent-one",
      body: "Unread one",
      createdAt: "2026-03-06T09:00:00.000Z"
    });
    await createMail(repoDir, {
      sessionId: "session-1",
      sender: "operator",
      recipient: "agent-one",
      body: "Unread two",
      createdAt: "2026-03-06T09:05:00.000Z"
    });
    await createMail(repoDir, {
      sessionId: "session-2",
      sender: "operator",
      recipient: "agent-two",
      body: "Unread elsewhere",
      createdAt: "2026-03-06T09:10:00.000Z"
    });

    await readUnreadMailForSession(repoDir, "session-2");

    const unreadCounts = await listUnreadMailCountsBySession(repoDir, ["session-1", "session-2", "session-3"]);

    assert.equal(unreadCounts.get("session-1"), 2);
    assert.equal(unreadCounts.get("session-2"), undefined);
    assert.equal(unreadCounts.get("session-3"), undefined);
  } finally {
    await removeTempDir(repoDir);
  }
});

test("listUnreadMailCountsBySession can filter unread counts by recipient", async () => {
  const repoDir = await createTempGitRepo("switchyard-mail-store-test-");

  try {
    await bootstrapSwitchyardLayout(repoDir);

    await createMail(repoDir, {
      sessionId: "session-1",
      sender: "operator",
      recipient: "agent-one",
      body: "Outbound unread",
      createdAt: "2026-03-06T09:00:00.000Z"
    });
    await createMail(repoDir, {
      sessionId: "session-1",
      sender: "agent-one",
      recipient: "operator",
      body: "Inbound unread",
      createdAt: "2026-03-06T09:05:00.000Z"
    });

    const operatorUnreadCounts = await listUnreadMailCountsBySession(
      repoDir,
      ["session-1"],
      { recipient: "operator" }
    );
    const agentUnreadCounts = await listUnreadMailCountsBySession(
      repoDir,
      ["session-1"],
      { recipient: "agent-one" }
    );

    assert.equal(operatorUnreadCounts.get("session-1"), 1);
    assert.equal(agentUnreadCounts.get("session-1"), 1);
  } finally {
    await removeTempDir(repoDir);
  }
});

test("listLatestUnreadMailBySession returns the latest unread message and count per requested session", async () => {
  const repoDir = await createTempGitRepo("switchyard-mail-store-test-");

  try {
    await bootstrapSwitchyardLayout(repoDir);

    await createMail(repoDir, {
      sessionId: "session-1",
      sender: "agent-one",
      recipient: "operator",
      body: "Older unread",
      createdAt: "2026-03-06T09:00:00.000Z"
    });
    await createMail(repoDir, {
      sessionId: "session-1",
      sender: "agent-one",
      recipient: "operator",
      body: "Latest unread",
      createdAt: "2026-03-06T09:05:00.000Z"
    });
    await createMail(repoDir, {
      sessionId: "session-2",
      sender: "agent-two",
      recipient: "operator",
      body: "Other session unread",
      createdAt: "2026-03-06T09:10:00.000Z"
    });
    await readUnreadMailForSession(repoDir, "session-2");

    const summaries = await listLatestUnreadMailBySession(repoDir, ["session-1", "session-2", "session-3"]);

    assert.equal(summaries.get("session-1")?.unreadCount, 2);
    assert.equal(summaries.get("session-1")?.message.body, "Latest unread");
    assert.equal(summaries.get("session-1")?.message.createdAt, "2026-03-06T09:05:00.000Z");
    assert.equal(summaries.get("session-2"), undefined);
    assert.equal(summaries.get("session-3"), undefined);
  } finally {
    await removeTempDir(repoDir);
  }
});

test("listLatestUnreadMailBySession can filter unread summaries by recipient", async () => {
  const repoDir = await createTempGitRepo("switchyard-mail-store-test-");

  try {
    await bootstrapSwitchyardLayout(repoDir);

    await createMail(repoDir, {
      sessionId: "session-1",
      sender: "operator",
      recipient: "agent-one",
      body: "Outbound unread",
      createdAt: "2026-03-06T09:00:00.000Z"
    });
    await createMail(repoDir, {
      sessionId: "session-1",
      sender: "agent-one",
      recipient: "operator",
      body: "Inbound unread",
      createdAt: "2026-03-06T09:05:00.000Z"
    });

    const operatorSummaries = await listLatestUnreadMailBySession(
      repoDir,
      ["session-1"],
      { recipient: "operator" }
    );
    const agentSummaries = await listLatestUnreadMailBySession(
      repoDir,
      ["session-1"],
      { recipient: "agent-one" }
    );

    assert.equal(operatorSummaries.get("session-1")?.unreadCount, 1);
    assert.equal(operatorSummaries.get("session-1")?.message.body, "Inbound unread");
    assert.equal(agentSummaries.get("session-1")?.unreadCount, 1);
    assert.equal(agentSummaries.get("session-1")?.message.body, "Outbound unread");
  } finally {
    await removeTempDir(repoDir);
  }
});
