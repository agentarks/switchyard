export interface MailRecord {
  id: string;
  sessionId: string;
  sender: string;
  recipient: string;
  body: string;
  createdAt: string;
  readAt: string | null;
}

export interface CreateMailInput {
  sessionId: string;
  sender: string;
  recipient: string;
  body: string;
  createdAt?: string;
}
