import type { SessionStore } from "./session-store.js";

export interface RecordSessionActivityPorts {
  store: SessionStore;
}

export interface RecordSessionActivityInput {
  sessionKey: string;
  at: Date;
}

export type RecordSessionActivityOutcome = { kind: "recorded" };

export async function recordSessionActivity(
  { store }: RecordSessionActivityPorts,
  input: RecordSessionActivityInput,
): Promise<RecordSessionActivityOutcome> {
  await store.recordSessionActivity(input.sessionKey, input.at);
  return { kind: "recorded" };
}
