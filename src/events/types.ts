export type EventPayloadValue = string | number | boolean | null;

export type EventPayload = Record<string, EventPayloadValue>;

export interface EventRecord {
  id: string;
  sessionId: string | null;
  agentName: string | null;
  eventType: string;
  payload: EventPayload;
  createdAt: string;
}

export interface CreateEventInput {
  sessionId?: string | null;
  agentName?: string | null;
  eventType: string;
  payload?: EventPayload;
  createdAt?: string;
}
