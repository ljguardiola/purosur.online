import {
  isRecoveryRequestCurrent,
  recoveryTokenExpiresAt,
  supersedesRecoveryRequest,
  wasRecoveryRequestServed,
} from "../model/recovery-token.js";
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
  | { kind: "already_sent" }
  | { kind: "late" }
  | { kind: "issued"; tokenId: string };

export async function issueRecoveryToken(
  { store }: IssueRecoveryTokenPorts,
  input: IssueRecoveryTokenInput,
): Promise<IssueRecoveryTokenOutcome> {
  return store.transaction<IssueRecoveryTokenOutcome>(async (tx) => {
    const account = await tx.findAccountByEmail(input.email);
    if (!account) {
      return { kind: "no_account" };
    }
    if (!account.active) {
      await tx.recordRejectedRequest({
        userId: account.id,
        reason: "account_inactive",
        requestedAt: input.requestedAt,
      });
      return { kind: "account_inactive" };
    }

    await tx.lockRecoveryTokens(account.id);
    const requests = await tx.listRecoveryRequests(account.id);
    if (wasRecoveryRequestServed(requests, input.requestId)) {
      return { kind: "already_sent" };
    }
    if (requests.some((other) => supersedesRecoveryRequest(other, input))) {
      await tx.recordRejectedRequest({
        userId: account.id,
        reason: "superseded",
        requestedAt: input.requestedAt,
      });
      return { kind: "superseded" };
    }
    if (!isRecoveryRequestCurrent(input, input.now)) {
      await tx.recordRejectedRequest({
        userId: account.id,
        reason: "late",
        requestedAt: input.requestedAt,
      });
      return { kind: "late" };
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
    return { kind: "issued", tokenId: token.id };
  });
}
