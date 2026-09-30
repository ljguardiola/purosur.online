import { isDeviceTokenExpired } from "../model/device-token.js";
import { type InstallationKeys, registerKeysHandedOver } from "./installation-keys.js";
import { matchPresentedDeviceToken } from "./match-presented-device-token.js";
import type { DeviceTokenRotationPorts } from "./register-store.js";

export interface RotateDeviceTokenInput {
  deviceToken: string;
}

export type RotateDeviceTokenOutcome =
  | { kind: "token_rejected" }
  | { kind: "rotated"; deviceToken: string; keys: InstallationKeys };

export async function rotateDeviceToken(
  { store, clock, tokens, keys }: DeviceTokenRotationPorts,
  input: RotateDeviceTokenInput,
): Promise<RotateDeviceTokenOutcome> {
  return store.transaction<RotateDeviceTokenOutcome>(async (tx) => {
    const matched = await matchPresentedDeviceToken(tx, tokens, input.deviceToken);
    if (!matched || matched.installation.revoked) {
      return { kind: "token_rejected" };
    }
    const { installation, isPending } = matched;

    if (isPending) {
      await tx.promotePendingDeviceToken(installation.deviceId);
    }
    const now = clock.now();
    const successor = tokens.successorOf(input.deviceToken);
    const pending = installation.pendingToken;
    const alreadyIssued =
      !isPending &&
      pending?.tokenHash === successor.tokenHash &&
      !isDeviceTokenExpired(pending.issuedAt, now);
    if (!alreadyIssued) {
      await tx.recordPendingDeviceToken(installation.deviceId, {
        lookupPrefix: successor.lookupPrefix,
        tokenHash: successor.tokenHash,
        issuedAt: now,
      });
    }

    // The installation is locked before its register's keys, the order enrollment takes them in.
    const registerKeys = await registerKeysHandedOver(tx, keys, installation.registerId);
    let { outboxChainKey } = installation;
    if (outboxChainKey === undefined) {
      outboxChainKey = keys.generate();
      await tx.recordOutboxChainKey(installation.deviceId, outboxChainKey);
    }
    return {
      kind: "rotated",
      deviceToken: successor.deviceToken,
      keys: { ...registerKeys, outboxChainKey },
    };
  });
}
