import test from "node:test";
import assert from "node:assert/strict";
import { bootstrapSwitchyardLayout } from "../storage/bootstrap.js";
import { createTempGitRepo, removeTempDir } from "../test-helpers/git.js";
import { createMail, initializeMailStore, listMailForSession, readUnreadMailForSession } from "./store.js";

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
