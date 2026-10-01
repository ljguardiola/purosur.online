import { recoveryTokenStatus } from "../model/recovery-token.js";
import {
  PasskeyAlreadyRegistered,
  type RecoveredPasskey,
  type RecoveryRedemptionStore,
} from "./recovery-redemption-store.js";

export interface RedeemRecoveryTokenPorts {
  store: RecoveryRedemptionStore;
}

export interface RedeemRecoveryTokenInput {
  tokenId: string;
  tokenHash: string;
  userId: string;
  passkey: Omit<RecoveredPasskey, "userId">;
  redeemedAt: Date;
}

export type RedeemRecoveryTokenOutcome =
  | { kind: "redeemed"; userId: string }
  | { kind: "token_rejected"; reason: "invalid" | "burned" | "expired" }
  | { kind: "passkey_already_registered" };

export async function redeemRecoveryToken(
  { store }: RedeemRecoveryTokenPorts,
  input: RedeemRecoveryTokenInput,
): Promise<RedeemRecoveryTokenOutcome> {
  const rejection = { tokenId: input.tokenId, userId: input.userId, attempt: "redeem" } as const;
  const passkey: RecoveredPasskey = { ...input.passkey, userId: input.userId };

  try {
    const burned = await store.transaction(async (tx) => {
      if (!(await tx.burnToken(input.tokenId, input.redeemedAt))) {
        return false;
      }
      // A conflict raised here rolls the burn back, so the link stays usable for a retry.
      const registered = await tx.registerPasskey(passkey);
      await tx.recordTokenRedeemed(input.tokenId, input.userId, input.redeemedAt);
      await tx.recordPasskeyRegistered(input.userId, registered, passkey);
      await tx.openPasskeyRegisteredAlert({
        userId: input.userId,
        passkeyName: passkey.name,
        openedAt: input.redeemedAt,
      });
      await tx.revokeSessions(input.userId, input.redeemedAt);
      return true;
    });
    if (burned) {
      return { kind: "redeemed", userId: input.userId };
    }
  } catch (error) {
    if (!(error instanceof PasskeyAlreadyRegistered)) {
      throw error;
    }
    await store.recordRejectedRedemption({
      ...rejection,
      rejectedWith: "passkey_already_registered",
    });
    return { kind: "passkey_already_registered" };
  }

  // Lost a race to another redemption; reclassify fresh instead of assuming why it lost.
  const token = await store.findTokenByHash(input.tokenHash);
  const status = token ? recoveryTokenStatus(token, input.redeemedAt) : "invalid";
  const reason = status === "valid" ? "burned" : status;
  await store.recordRejectedRedemption({ ...rejection, rejectedWith: reason });
  return { kind: "token_rejected", reason };
}
