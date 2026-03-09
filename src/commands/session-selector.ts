import { WorktreeError } from "../errors.js";
import { findLatestSessionByAgent, getSessionById } from "../sessions/store.js";
import type { SessionRecord } from "../sessions/types.js";
import { normalizeAgentName } from "../worktrees/naming.js";

export async function resolveSessionByIdOrAgent(
  projectRoot: string,
  selector: string,
  createAmbiguousError: (byId: SessionRecord, byAgent: SessionRecord) => Error
): Promise<SessionRecord | undefined> {
  const byId = await getSessionById(projectRoot, selector);

  if (byId) {
    const normalizedSelector = tryNormalizeAgentName(selector);

    if (!normalizedSelector) {
      return byId;
    }

    const byAgent = await findLatestSessionByAgent(projectRoot, normalizedSelector);

    if (byAgent && byAgent.id !== byId.id) {
      throw createAmbiguousError(byId, byAgent);
    }

    return byId;
  }

  const normalizedSelector = tryNormalizeAgentName(selector);

  if (!normalizedSelector) {
    return undefined;
  }

  return await findLatestSessionByAgent(projectRoot, normalizedSelector);
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
