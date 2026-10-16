import { isSessionExpired } from "../model/session-expiry.js";
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
    const open = (await tx.lockUnrevokedSessions()).filter(
      (session) => !isSessionExpired(session, input.at),
    );
    await tx.endSessions(
      open.map((session) => session.id),
      input.at,
    );
    for (const { id, userId } of open) {
      await tx.recordSessionEnded(input.actorId, { id, userId }, input.at);
    }
    return { kind: "ended" };
  });
}
