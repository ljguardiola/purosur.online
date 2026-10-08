import type { Clock } from "../../shared/index.js";
import { recoveryTokenStatus } from "../model/recovery-token.js";
import {
  PasskeyAlreadyRegistered,
  type RecoveredPasskey,
  type RecoveryRedemptionStore,
} from "./recovery-redemption-store.js";

export interface RedeemRecoveryTokenPorts {
  store: RecoveryRedemptionStore;
  clock: Clock;
}

export interface RedeemRecoveryTokenInput {
  tokenId: string;
  userId: string;
  passkey: Omit<RecoveredPasskey, "userId">;
  redeemedAt: Date;
}

export type RedeemRecoveryTokenOutcome =
  | { kind: "redeemed"; userId: string }
  | { kind: "not_redeemable"; reason: "invalid" | "burned" | "expired" }
  | { kind: "passkey_already_registered" };

export async function redeemRecoveryToken(
  { store, clock }: RedeemRecoveryTokenPorts,
  input: RedeemRecoveryTokenInput,
): Promise<RedeemRecoveryTokenOutcome> {
  const passkey: RecoveredPasskey = { ...input.passkey, userId: input.userId };

  try {
    return await store.transaction<RedeemRecoveryTokenOutcome>(async (tx) => {
      const token = await tx.lockToken(input.tokenId);
      if (!token) {
        return { kind: "not_redeemable", reason: "invalid" };
      }
      const status = recoveryTokenStatus(token, input.redeemedAt);
      if (status !== "valid") {
        return { kind: "not_redeemable", reason: status };
      }
      await tx.markTokenUsed(input.tokenId, input.redeemedAt);
      // A conflict raised here rolls the burn back, so the link stays usable for a retry.
      const registered = await tx.registerPasskey(passkey);
      await tx.recordTokenRedeemed(input.tokenId, input.userId, input.redeemedAt);
      await tx.recordPasskeyRegistered(input.userId, registered, passkey);
      await tx.openPasskeyRegisteredAlert({
        userId: input.userId,
        passkeyName: passkey.name,
        openedAt: clock.now(),
      });
      await tx.revokeSessions(input.userId, input.redeemedAt);
      return { kind: "redeemed", userId: input.userId };
    });
  } catch (error) {
    if (error instanceof PasskeyAlreadyRegistered) {
      return { kind: "passkey_already_registered" };
    }
    throw error;
  }
}
