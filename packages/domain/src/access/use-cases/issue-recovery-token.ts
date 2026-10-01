import { recoveryTokenExpiresAt } from "../model/recovery-token.js";
import type { RecoveryTokenStore } from "./recovery-token-store.js";

export interface IssueRecoveryTokenPorts {
  store: RecoveryTokenStore;
}

export interface IssueRecoveryTokenInput {
  email: string;
  requestId: string;
  requestedAt: Date;
  now: Date;
  tokenHash: string;
}

export type IssueRecoveryTokenOutcome =
  | { kind: "no_account" }
  | { kind: "account_inactive" }
  | { kind: "superseded" }
  | { kind: "issued" };

export async function issueRecoveryToken(
  { store }: IssueRecoveryTokenPorts,
  input: IssueRecoveryTokenInput,
): Promise<IssueRecoveryTokenOutcome> {
  const account = await store.findAccountByEmail(input.email);
  if (!account) {
    return { kind: "no_account" };
  }
  if (!account.active) {
    await store.recordRejectedRequest({
      userId: account.id,
      reason: "account_inactive",
      requestedAt: input.requestedAt,
    });
    return { kind: "account_inactive" };
  }

  return store.transaction<IssueRecoveryTokenOutcome>(async (tx) => {
    await tx.lockRecoveryTokens(account.id);
    if (
      await tx.hasNewerRequest(account.id, {
        requestId: input.requestId,
        requestedAt: input.requestedAt,
      })
    ) {
      await tx.recordRejectedRequest({
        userId: account.id,
        reason: "superseded",
        requestedAt: input.requestedAt,
      });
      return { kind: "superseded" };
    }

    await tx.voidOutstandingRecoveryTokens(account.id, input.now);
    const token = await tx.issueToken({
      userId: account.id,
      tokenHash: input.tokenHash,
      requestedAt: input.requestedAt,
      requestId: input.requestId,
      issuedAt: input.now,
      expiresAt: recoveryTokenExpiresAt(input.now),
    });
    await tx.recordIssuedToken(account.id, token, input.requestedAt);
    await tx.openRecoveryRequestedAlert({
      userId: account.id,
      requestedAt: input.requestedAt,
      issuedAt: token.issuedAt,
      expiresAt: token.expiresAt,
    });
    return { kind: "issued" };
  });
}
