import type { SessionStore } from "./session-store.js";

export interface EndExpiredSessionPorts {
  store: SessionStore;
}

export interface EndExpiredSessionInput {
  sessionKey: string;
  at: Date;
}

export type EndExpiredSessionOutcome = { kind: "ended" };

export async function endExpiredSession(
  { store }: EndExpiredSessionPorts,
  input: EndExpiredSessionInput,
): Promise<EndExpiredSessionOutcome> {
  await store.endSession(input.sessionKey, input.at);
  return { kind: "ended" };
}
