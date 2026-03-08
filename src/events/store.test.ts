import test from "node:test";
import assert from "node:assert/strict";
import { bootstrapSwitchyardLayout } from "../storage/bootstrap.js";
import { createTempGitRepo, removeTempDir } from "../test-helpers/git.js";
import { createEvent, initializeEventStore, listEvents } from "./store.js";

test("initializeEventStore creates the events schema without records", async () => {
  const repoDir = await createTempGitRepo("switchyard-event-store-test-");

  try {
    await bootstrapSwitchyardLayout(repoDir);
    await initializeEventStore(repoDir);

    const events = await listEvents(repoDir);
    assert.deepEqual(events, []);
  } finally {
    await removeTempDir(repoDir);
  }
});

test("listEvents returns inserted events in creation order with parsed payloads", async () => {
  const repoDir = await createTempGitRepo("switchyard-event-store-test-");

  try {
    await bootstrapSwitchyardLayout(repoDir);

    const firstEvent = await createEvent(repoDir, {
      sessionId: "session-1",
      agentName: "agent-one",
      eventType: "sling.completed",
      payload: {
        runtimePid: 4242,
        cleanupSucceeded: true
      },
      createdAt: "2026-03-08T09:00:00.000Z"
    });
    await createEvent(repoDir, {
      sessionId: "session-1",
      agentName: "agent-one",
      eventType: "mail.sent",
      payload: {
        bodyLength: 18
      },
      createdAt: "2026-03-08T10:00:00.000Z"
    });
    await createEvent(repoDir, {
      sessionId: "session-2",
      agentName: "agent-two",
      eventType: "stop.completed",
      payload: {
        cleanupPerformed: false
      },
      createdAt: "2026-03-08T11:00:00.000Z"
    });

    const sessionEvents = await listEvents(repoDir, { sessionId: "session-1" });

    assert.equal(sessionEvents.length, 2);
    assert.equal(sessionEvents[0]?.id, firstEvent.id);
    assert.deepEqual(sessionEvents[0], {
      id: firstEvent.id,
      sessionId: "session-1",
      agentName: "agent-one",
      eventType: "sling.completed",
      payload: {
        runtimePid: 4242,
        cleanupSucceeded: true
      },
      createdAt: "2026-03-08T09:00:00.000Z"
    });

    const recentEvent = await listEvents(repoDir, { agentName: "agent-two", limit: 1 });
    assert.equal(recentEvent.length, 1);
    assert.equal(recentEvent[0]?.eventType, "stop.completed");
  } finally {
    await removeTempDir(repoDir);
  }
});
