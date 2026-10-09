import type { RecoveryTokenStore } from "./recovery-token-store.js";

export interface RecordRecoveryLinkSentPorts {
  store: RecoveryTokenStore;
}

export interface RecordRecoveryLinkSentInput {
  tokenId: string;
  sentAt: Date;
}

export type RecordRecoveryLinkSentOutcome = { kind: "recorded" };

export async function recordRecoveryLinkSent(
  { store }: RecordRecoveryLinkSentPorts,
  input: RecordRecoveryLinkSentInput,
): Promise<RecordRecoveryLinkSentOutcome> {
  return store.transaction<RecordRecoveryLinkSentOutcome>(async (tx) => {
    await tx.markRecoveryLinkSent(input.tokenId, input.sentAt);
    return { kind: "recorded" };
  });
}
