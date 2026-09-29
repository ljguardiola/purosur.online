import { matchPresentedDeviceToken } from "./match-presented-device-token.js";
import type { InstallationTokenPorts } from "./register-store.js";

export interface RotateDeviceTokenInput {
  deviceToken: string;
}

export type RotateDeviceTokenOutcome =
  | { kind: "token_rejected" }
  | { kind: "rotated"; deviceToken: string };

export async function rotateDeviceToken(
  { store, clock, tokens }: InstallationTokenPorts,
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
    const successor = tokens.successorOf(input.deviceToken);
    const alreadyIssued =
      !isPending && installation.pendingToken?.tokenHash === successor.tokenHash;
    if (!alreadyIssued) {
      await tx.recordPendingDeviceToken(installation.deviceId, {
        lookupPrefix: successor.lookupPrefix,
        tokenHash: successor.tokenHash,
        issuedAt: clock.now(),
      });
    }
    return { kind: "rotated", deviceToken: successor.deviceToken };
  });
}
