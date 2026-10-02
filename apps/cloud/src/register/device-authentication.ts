import {
  authenticateInstallation,
  type InstallationTokenPorts,
} from "@purosur/domain/register/use-cases";

interface AuthenticatedInstallation {
  deviceId: string;
  registerId: string;
  revoked: boolean;
}

export type DeviceAuthentication =
  | { kind: "anonymous" }
  | { kind: "rejected" }
  | { kind: "installation"; installation: AuthenticatedInstallation };

const BEARER_DEVICE_TOKEN = /^bearer +(?<deviceToken>[A-Za-z0-9_.-]+)$/i;

export function readBearerDeviceToken(authorization: string): string | undefined {
  return BEARER_DEVICE_TOKEN.exec(authorization)?.groups?.["deviceToken"];
}

export async function authenticateDevice(
  ports: InstallationTokenPorts,
  authorization: string | undefined,
): Promise<DeviceAuthentication> {
  if (authorization === undefined) {
    return { kind: "anonymous" };
  }
  const deviceToken = readBearerDeviceToken(authorization);
  if (deviceToken === undefined) {
    return { kind: "rejected" };
  }
  const outcome = await authenticateInstallation(ports, { deviceToken });
  if (outcome.kind === "rejected") {
    return { kind: "rejected" };
  }
  return {
    kind: "installation",
    installation: {
      deviceId: outcome.deviceId,
      registerId: outcome.registerId,
      revoked: outcome.revoked,
    },
  };
}
