import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";
import { Command } from "commander";
import { loadConfig } from "../config.js";
import { recordEventBestEffort, recordEventWithFallback, type EventRecorder } from "../events/store.js";
import { MailError } from "../errors.js";
import { createMail, listMailForSession, readUnreadMailForSession } from "../mail/store.js";
import type { SessionRecord } from "../sessions/types.js";
import { formatSessionSelectorAmbiguousMessage, resolveSessionByIdOrAgent } from "./session-selector.js";

interface MailSendCliOptions {
  from?: string;
  bodyFile?: string;
}

interface MailSendOptions {
  selector: string;
  body?: string;
  bodyFile?: string;
  sender?: string;
  startDir?: string;
  recordEvent?: EventRecorder;
}

interface MailCheckOptions {
  selector: string;
  startDir?: string;
  recordEvent?: EventRecorder;
}

interface MailListOptions {
  selector: string;
  unreadOnly?: boolean;
  startDir?: string;
  recordEvent?: EventRecorder;
}

export function createMailCommand(): Command {
  const command = new Command("mail").description("Send or check durable session mail");

  command
    .addCommand(
      new Command("send")
        .description("Send one durable message to a tracked session")
        .argument("<session>", "Session id or agent name")
        .argument("[body]", "Message body")
        .option("--body-file <path>", "Read the message body from a file")
        .option("--from <sender>", "Sender label", "operator")
        .action(async (selector: string, body: string | undefined, options: MailSendCliOptions) => {
          await mailSendCommand({
            selector,
            body,
            bodyFile: options.bodyFile,
            sender: options.from
          });
        })
    )
    .addCommand(
      new Command("check")
        .description("Read unread mail for a tracked session")
        .argument("<session>", "Session id or agent name")
        .action(async (selector: string) => {
          await mailCheckCommand({ selector });
        })
    )
    .addCommand(
      new Command("list")
        .description("List session mail without changing read state")
        .argument("<session>", "Session id or agent name")
        .option("--unread", "Show only unread mail without marking it read")
        .action(async (selector: string, options: { unread?: boolean }) => {
          await mailListCommand({
            selector,
            unreadOnly: options.unread
          });
        })
    );

  return command;
}

export async function mailSendCommand(options: MailSendOptions): Promise<void> {
  const config = await loadConfig(options.startDir);
  const body = await loadBody(options);
  const session = await resolveSession(config.project.root, options.selector);
  const recordEvent = options.recordEvent ?? recordEventBestEffort;
  const sender = options.sender?.trim() || "operator";

  if (!session) {
    throw new MailError(`No session found for '${options.selector}'.`);
  }

  if (body.trim().length === 0) {
    throw new MailError("Mail body cannot be empty.");
  }

  const message = await createMail(config.project.root, {
    sessionId: session.id,
    sender,
    recipient: session.agentName,
    body
  });

  await recordEventWithFallback(recordEvent, config.project.root, {
    sessionId: session.id,
    agentName: session.agentName,
    eventType: "mail.sent",
    payload: {
      mailId: message.id,
      sender,
      recipient: session.agentName,
      bodyLength: body.length
    }
  });

  process.stdout.write(`Queued mail for ${session.agentName}\n`);
  process.stdout.write(`Session: ${session.id}\n`);
  process.stdout.write(`Mail id: ${message.id}\n`);
}

async function loadBody(options: Pick<MailSendOptions, "body" | "bodyFile" | "startDir">): Promise<string> {
  if (typeof options.body === "string" && typeof options.bodyFile === "string") {
    throw new MailError("Choose exactly one mail body source: use either '<body>' or '--body-file <path>'.");
  }

  if (typeof options.bodyFile === "string") {
    return await readBodyFile(options.bodyFile, options.startDir);
  }

  if (typeof options.body === "string") {
    return options.body;
  }

  throw new MailError("Mail send requires a body. Use '<body>' or '--body-file <path>'.");
}

async function readBodyFile(bodyFile: string, startDir?: string): Promise<string> {
  const resolvedPath = resolve(startDir ?? process.cwd(), bodyFile);

  try {
    return await readFile(resolvedPath, "utf8");
  } catch (error) {
    throw new MailError(`Failed to read body file '${bodyFile}': ${formatErrorMessage(error)}`);
  }
}

export async function mailCheckCommand(options: MailCheckOptions): Promise<void> {
  const config = await loadConfig(options.startDir);
  const session = await resolveSession(config.project.root, options.selector);
  const recordEvent = options.recordEvent ?? recordEventBestEffort;

  if (!session) {
    throw new MailError(`No session found for '${options.selector}'.`);
  }

  const unreadMail = await readUnreadMailForSession(config.project.root, session.id);

  await recordEventWithFallback(recordEvent, config.project.root, {
    sessionId: session.id,
    agentName: session.agentName,
    eventType: "mail.checked",
    payload: {
      unreadCount: unreadMail.length
    }
  });

  if (unreadMail.length === 0) {
    process.stdout.write(`No unread mail for ${session.agentName}.\n`);
    process.stdout.write(`Session: ${session.id}\n`);
    return;
  }

  process.stdout.write(`Unread mail for ${session.agentName}:\n`);
  process.stdout.write(`Session: ${session.id}\n`);

  for (const message of unreadMail) {
    process.stdout.write(`${message.createdAt}\t${message.sender}\t${message.id}\n`);
    process.stdout.write(formatMailBody(message.body));
  }

  process.stdout.write(`Marked ${unreadMail.length} message${unreadMail.length === 1 ? "" : "s"} as read.\n`);
}

export async function mailListCommand(options: MailListOptions): Promise<void> {
  const config = await loadConfig(options.startDir);
  const session = await resolveSession(config.project.root, options.selector);
  const recordEvent = options.recordEvent ?? recordEventBestEffort;

  if (!session) {
    throw new MailError(`No session found for '${options.selector}'.`);
  }

  const mailbox = await listMailForSession(config.project.root, session.id, {
    unreadOnly: options.unreadOnly
  });
  const unreadCount = mailbox.filter((message) => message.readAt === null).length;
  const view = options.unreadOnly ? "unread_only" : "full";

  await recordEventWithFallback(recordEvent, config.project.root, {
    sessionId: session.id,
    agentName: session.agentName,
    eventType: "mail.listed",
    payload: {
      view,
      messageCount: mailbox.length,
      unreadCount
    }
  });

  if (mailbox.length === 0) {
    process.stdout.write(
      options.unreadOnly ? `No unread mail for ${session.agentName}.\n` : `No mail for ${session.agentName}.\n`
    );
    process.stdout.write(`Session: ${session.id}\n`);
    return;
  }

  process.stdout.write(
    options.unreadOnly
      ? `Unread mail for ${session.agentName} (read-only):\n`
      : `Mailbox for ${session.agentName} (read-only):\n`
  );
  process.stdout.write(`Session: ${session.id}\n`);

  for (const message of mailbox) {
    const state = message.readAt ? "read" : "unread";
    const readDetail = message.readAt ? `\treadAt=${message.readAt}` : "";
    process.stdout.write(`${state}\t${message.createdAt}\t${message.sender}\t${message.id}${readDetail}\n`);
    process.stdout.write(formatMailBody(message.body));
  }

  const countSummary = `Listed ${mailbox.length} message${mailbox.length === 1 ? "" : "s"}`;
  process.stdout.write(
    options.unreadOnly
      ? `${countSummary}; unread-only view, read state unchanged.\n`
      : `${countSummary}; ${unreadCount} unread.\n`
  );
}

async function resolveSession(projectRoot: string, selector: string): Promise<SessionRecord | undefined> {
  return await resolveSessionByIdOrAgent(projectRoot, selector, (ambiguity) => {
    return new MailError(formatSessionSelectorAmbiguousMessage(selector, ambiguity));
  });
}

function formatMailBody(body: string): string {
  const bodyLines = body.split("\n");
  return `Body:\n${bodyLines.map((line) => `  ${line}`).join("\n")}\n\n`;
}

function formatErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
