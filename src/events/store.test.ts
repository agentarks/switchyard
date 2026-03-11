import test from "node:test";
import assert from "node:assert/strict";
import { bootstrapSwitchyardLayout } from "../storage/bootstrap.js";
import { createTempGitRepo, removeTempDir } from "../test-helpers/git.js";
import {
  createEvent,
  initializeEventStore,
  listEvents,
  listLatestEventsBySession,
  listLatestEventsBySessionForTypes
} from "./store.js";

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
        readyAfterMs: 500
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
        readyAfterMs: 500
      },
      createdAt: "2026-03-08T09:00:00.000Z"
    });

    const recentEvents = await listEvents(repoDir, { limit: 2 });
    assert.equal(recentEvents.length, 2);
    assert.equal(recentEvents[0]?.eventType, "mail.sent");
    assert.equal(recentEvents[1]?.eventType, "stop.completed");
  } finally {
    await removeTempDir(repoDir);
  }
});

test("listLatestEventsBySession returns the newest event for each requested session", async () => {
  const repoDir = await createTempGitRepo("switchyard-event-store-test-");

  try {
    await bootstrapSwitchyardLayout(repoDir);

    await createEvent(repoDir, {
      sessionId: "session-1",
      agentName: "agent-one",
      eventType: "sling.completed",
      payload: {
        runtimePid: 4242,
        readyAfterMs: 500
      },
      createdAt: "2026-03-08T09:00:00.000Z"
    });
    await createEvent(repoDir, {
      sessionId: "session-1",
      agentName: "agent-one",
      eventType: "mail.sent",
      payload: {
        sender: "operator"
      },
      createdAt: "2026-03-08T10:00:00.000Z"
    });
    await createEvent(repoDir, {
      sessionId: "session-2",
      agentName: "agent-two",
      eventType: "stop.completed",
      payload: {
        outcome: "stopped"
      },
      createdAt: "2026-03-08T11:00:00.000Z"
    });

    const latestEvents = await listLatestEventsBySession(repoDir, ["session-1", "session-2", "session-3"]);

    assert.equal(latestEvents.size, 2);
    assert.equal(latestEvents.get("session-1")?.eventType, "mail.sent");
    assert.equal(latestEvents.get("session-1")?.createdAt, "2026-03-08T10:00:00.000Z");
    assert.equal(latestEvents.get("session-2")?.eventType, "stop.completed");
    assert.equal(latestEvents.get("session-2")?.createdAt, "2026-03-08T11:00:00.000Z");
    assert.equal(latestEvents.get("session-3"), undefined);
  } finally {
    await removeTempDir(repoDir);
  }
});

test("listLatestEventsBySessionForTypes returns the newest matching event per requested session", async () => {
  const repoDir = await createTempGitRepo("switchyard-event-store-test-");

  try {
    await bootstrapSwitchyardLayout(repoDir);

    await createEvent(repoDir, {
      sessionId: "session-1",
      agentName: "agent-one",
      eventType: "runtime.ready",
      payload: {
        runtimePid: 4242
      },
      createdAt: "2026-03-08T09:00:00.000Z"
    });
    await createEvent(repoDir, {
      sessionId: "session-1",
      agentName: "agent-one",
      eventType: "mail.sent",
      payload: {
        sender: "operator"
      },
      createdAt: "2026-03-08T10:00:00.000Z"
    });
    await createEvent(repoDir, {
      sessionId: "session-1",
      agentName: "agent-one",
      eventType: "runtime.exited",
      payload: {
        reason: "pid_not_alive"
      },
      createdAt: "2026-03-08T11:00:00.000Z"
    });
    await createEvent(repoDir, {
      sessionId: "session-2",
      agentName: "agent-two",
      eventType: "merge.failed",
      payload: {
        reason: "merge_conflict"
      },
      createdAt: "2026-03-08T12:00:00.000Z"
    });
    await createEvent(repoDir, {
      sessionId: "session-2",
      agentName: "agent-two",
      eventType: "sling.completed",
      payload: {
        runtimePid: 4343
      },
      createdAt: "2026-03-08T12:05:00.000Z"
    });

    const latestEvents = await listLatestEventsBySessionForTypes(
      repoDir,
      ["session-1", "session-2", "session-3"],
      ["runtime.ready", "runtime.exited", "sling.completed"]
    );

    assert.equal(latestEvents.size, 2);
    assert.equal(latestEvents.get("session-1")?.eventType, "runtime.exited");
    assert.equal(latestEvents.get("session-1")?.createdAt, "2026-03-08T11:00:00.000Z");
    assert.equal(latestEvents.get("session-2")?.eventType, "sling.completed");
    assert.equal(latestEvents.get("session-2")?.createdAt, "2026-03-08T12:05:00.000Z");
    assert.equal(latestEvents.get("session-3"), undefined);
  } finally {
    await removeTempDir(repoDir);
  }
});
