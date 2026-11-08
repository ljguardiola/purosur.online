import { isDeviceTokenExpired } from "../model/device-token.js";
import { matchPresentedDeviceToken } from "./match-presented-device-token.js";
import type { InstallationTokenPorts } from "./register-store.js";

export interface AuthenticateInstallationInput {
  deviceToken: string;
}

export type AuthenticateInstallationOutcome =
  | { kind: "rejected" }
  | { kind: "authenticated"; deviceId: string; registerId: string; revoked: boolean };

export async function authenticateInstallation(
  { store, clock, tokens }: InstallationTokenPorts,
  input: AuthenticateInstallationInput,
): Promise<AuthenticateInstallationOutcome> {
  return store.transaction<AuthenticateInstallationOutcome>(async (tx) => {
    const matched = await matchPresentedDeviceToken(tx, tokens, input.deviceToken);
    if (!matched || isDeviceTokenExpired(matched.token.issuedAt, clock.now())) {
      return { kind: "rejected" };
    }
    const { installation, isPending } = matched;

    if (isPending) {
      await tx.promotePendingDeviceToken(installation.deviceId);
    }
    return {
      kind: "authenticated",
      deviceId: installation.deviceId,
      registerId: installation.registerId,
      revoked: installation.revoked,
    };
  });
}
