import { WorktreeError } from "../errors.js";
import { getSessionById, listSessionsByAgent } from "../sessions/store.js";
import type { SessionRecord } from "../sessions/types.js";
import { normalizeAgentName } from "../worktrees/naming.js";

export interface SessionSelectorAmbiguity {
  byId?: SessionRecord;
  byAgent: SessionRecord[];
  normalizedAgentName?: string;
}

export async function findSessionSelectorMatches(
  projectRoot: string,
  selector: string
): Promise<SessionSelectorAmbiguity> {
  const byId = await getSessionById(projectRoot, selector);
  const normalizedAgentName = tryNormalizeAgentName(selector);
  const byAgent = normalizedAgentName
    ? await listSessionsByAgent(projectRoot, normalizedAgentName)
    : [];

  return { byId, byAgent, normalizedAgentName };
}

export async function resolveSessionByIdOrAgent(
  projectRoot: string,
  selector: string,
  createAmbiguousError: (ambiguity: SessionSelectorAmbiguity) => Error
): Promise<SessionRecord | undefined> {
  const { byId, byAgent } = await findSessionSelectorMatches(projectRoot, selector);

  if (byId) {
    const conflictingAgentMatches = byAgent.filter((session) => session.id !== byId.id);

    if (conflictingAgentMatches.length === 0) {
      return byId;
    }

    throw createAmbiguousError({
      byId,
      byAgent: conflictingAgentMatches
    });
  }

  if (byAgent.length === 0) {
    return undefined;
  }

  if (byAgent.length > 1) {
    throw createAmbiguousError({
      byAgent
    });
  }

  return byAgent[0];
}

function tryNormalizeAgentName(selector: string): string | undefined {
  try {
    return normalizeAgentName(selector);
  } catch (error) {
    if (error instanceof WorktreeError) {
      return undefined;
    }

    throw error;
  }
}

export function formatSessionSelectorAmbiguousMessage(
  selector: string,
  ambiguity: SessionSelectorAmbiguity
): string {
  if (ambiguity.byId && ambiguity.byAgent.length === 1) {
    return `Selector '${selector}' is ambiguous: it matches session '${ambiguity.byId.id}' by id and session '${ambiguity.byAgent[0]?.id}' by agent name.`;
  }

  if (ambiguity.byId) {
    return `Selector '${selector}' is ambiguous: it matches session '${ambiguity.byId.id}' by id and multiple sessions by agent name (${formatSessionIdList(ambiguity.byAgent)}). Use an exact session id from 'sy status'.`;
  }

  return `Selector '${selector}' is ambiguous: it matches multiple sessions by agent name (${formatSessionIdList(ambiguity.byAgent)}). Use an exact session id from 'sy status'.`;
}

export function formatSessionIdList(sessions: SessionRecord[]): string {
  return sessions.map((session) => `'${session.id}'`).join(", ");
}
