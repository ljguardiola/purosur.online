import { recoveryTokenStatus } from "../model/recovery-token.js";
import type {
  RecoveringAccount,
  RecoveryRedemptionStore,
  RecoveryTokenRecord,
  RegisteredCredential,
} from "./recovery-redemption-store.js";

export interface FindRedeemableRecoveryPorts {
  store: RecoveryRedemptionStore;
}

export interface FindRedeemableRecoveryInput {
  tokenHash: string;
  now: Date;
}

export type FindRedeemableRecoveryOutcome =
  | { kind: "rejected"; reason: "invalid"; token?: RecoveryTokenRecord }
  | { kind: "rejected"; reason: "burned" | "expired"; token: RecoveryTokenRecord }
  | {
      kind: "redeemable";
      token: RecoveryTokenRecord;
      account: RecoveringAccount;
      credentials: RegisteredCredential[];
    };

export async function findRedeemableRecovery(
  { store }: FindRedeemableRecoveryPorts,
  input: FindRedeemableRecoveryInput,
): Promise<FindRedeemableRecoveryOutcome> {
  const token = await store.findTokenByHash(input.tokenHash);
  if (!token) {
    return { kind: "rejected", reason: "invalid" };
  }
  const status = recoveryTokenStatus(token, input.now);
  if (status !== "valid") {
    return { kind: "rejected", reason: status, token };
  }

  const account = await store.findAccount(token.userId);
  if (!account) {
    return { kind: "rejected", reason: "invalid" };
  }
  if (!account.active) {
    return { kind: "rejected", reason: "invalid", token };
  }
  return {
    kind: "redeemable",
    token,
    account,
    credentials: await store.listRegisteredCredentials(account.id),
  };
}
