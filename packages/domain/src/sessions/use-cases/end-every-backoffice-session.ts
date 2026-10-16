import type { BackofficeSessionEndingStore } from "./backoffice-session-ending-store.js";

export interface EndEveryBackofficeSessionPorts {
  store: BackofficeSessionEndingStore;
}

export interface EndEveryBackofficeSessionInput {
  actorId: string;
  at: Date;
}

export type EndEveryBackofficeSessionOutcome = { kind: "ended" };

export async function endEveryBackofficeSession(
  { store }: EndEveryBackofficeSessionPorts,
  input: EndEveryBackofficeSessionInput,
): Promise<EndEveryBackofficeSessionOutcome> {
  return store.transaction<EndEveryBackofficeSessionOutcome>(async (tx) => {
    const ended = await tx.endEveryOpenSession(input.at);
    for (const session of ended) {
      await tx.recordSessionEnded(input.actorId, session, input.at);
    }
    return { kind: "ended" };
  });
}
