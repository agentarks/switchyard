import { join, relative } from "node:path";

export interface SessionLogPath {
  path: string;
  relativePath: string;
}

export function getSessionLogPath(projectRoot: string, agentName: string, sessionId: string): SessionLogPath {
  const path = join(projectRoot, ".switchyard", "logs", `${agentName}-${sessionId}.log`);
  return {
    path,
    relativePath: formatRelativePath(projectRoot, path)
  };
}

function formatRelativePath(projectRoot: string, path: string): string {
  const relativePath = relative(projectRoot, path);
  return relativePath.length > 0 ? relativePath : ".";
}
