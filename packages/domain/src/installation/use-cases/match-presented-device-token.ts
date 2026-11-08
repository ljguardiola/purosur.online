import type {
  DeviceTokenRotator,
  LockedInstallation,
  RegisterStoreTransaction,
  StoredDeviceToken,
} from "./register-store.js";

export interface MatchedDeviceToken {
  installation: LockedInstallation;
  token: StoredDeviceToken;
  isPending: boolean;
}

export async function matchPresentedDeviceToken(
  tx: RegisterStoreTransaction,
  tokens: DeviceTokenRotator,
  deviceToken: string,
): Promise<MatchedDeviceToken | undefined> {
  const presented = tokens.read(deviceToken);
  if (!presented) {
    return undefined;
  }
  const installation = await tx.lockInstallationByTokenPrefix(presented.lookupPrefix);
  if (!installation) {
    return undefined;
  }
  const { currentToken, pendingToken } = installation;
  if (pendingToken?.tokenHash === presented.tokenHash) {
    return { installation, token: pendingToken, isPending: true };
  }
  if (currentToken.tokenHash === presented.tokenHash) {
    return { installation, token: currentToken, isPending: false };
  }
  return undefined;
}
