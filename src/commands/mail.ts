import process from "node:process";
import { Command } from "commander";
import { loadConfig } from "../config.js";
import { recordEventBestEffort, recordEventWithFallback, type EventRecorder } from "../events/store.js";
import { MailError } from "../errors.js";
import { createMail, readUnreadMailForSession } from "../mail/store.js";
import { findLatestSessionByAgent, getSessionById } from "../sessions/store.js";
import type { SessionRecord } from "../sessions/types.js";
import { normalizeAgentName } from "../worktrees/naming.js";

interface MailSendCliOptions {
  from?: string;
}

interface MailSendOptions {
  selector: string;
  body: string;
  sender?: string;
  startDir?: string;
  recordEvent?: EventRecorder;
}

interface MailCheckOptions {
  selector: string;
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
        .argument("<body>", "Message body")
        .option("--from <sender>", "Sender label", "operator")
        .action(async (selector: string, body: string, options: MailSendCliOptions) => {
          await mailSendCommand({
            selector,
            body,
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
    );

  return command;
}

export async function mailSendCommand(options: MailSendOptions): Promise<void> {
  const config = await loadConfig(options.startDir);
  const session = await resolveSession(config.project.root, options.selector);
  const recordEvent = options.recordEvent ?? recordEventBestEffort;
  const sender = options.sender?.trim() || "operator";
  const body = options.body.trim();

  if (!session) {
    throw new MailError(`No session found for '${options.selector}'.`);
  }

  if (body.length === 0) {
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
    return;
  }

  process.stdout.write(`Unread mail for ${session.agentName}:\n`);

  for (const message of unreadMail) {
    process.stdout.write(`${message.createdAt}\t${message.sender}\t${message.id}\n`);
    process.stdout.write(`${message.body}\n`);
  }

  process.stdout.write(`Marked ${unreadMail.length} message${unreadMail.length === 1 ? "" : "s"} as read.\n`);
}

async function resolveSession(projectRoot: string, selector: string): Promise<SessionRecord | undefined> {
  const byId = await getSessionById(projectRoot, selector);

  if (byId) {
    return byId;
  }

  return await findLatestSessionByAgent(projectRoot, normalizeAgentName(selector));
}
