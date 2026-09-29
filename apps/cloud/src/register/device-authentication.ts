import { and, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { registerInstallations } from "../platform/db/schema.js";
import { hashDeviceToken } from "./device-token.js";

interface AuthenticatedInstallation {
  deviceId: string;
  revoked: boolean;
}

export type DeviceAuthentication =
  | { kind: "anonymous" }
  | { kind: "rejected" }
  | { kind: "installation"; installation: AuthenticatedInstallation };

const BEARER_DEVICE_TOKEN =
  /^bearer +(?<deviceToken>(?<lookupPrefix>[A-Za-z0-9_-]+)\.[A-Za-z0-9_-]+)$/i;

const REJECTED: DeviceAuthentication = { kind: "rejected" };

export async function authenticateDevice<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  authorization: string | undefined,
): Promise<DeviceAuthentication> {
  if (authorization === undefined) {
    return { kind: "anonymous" };
  }
  const { deviceToken, lookupPrefix } = BEARER_DEVICE_TOKEN.exec(authorization)?.groups ?? {};
  if (deviceToken === undefined || lookupPrefix === undefined) {
    return REJECTED;
  }
  const [installation] = await db
    .select({ deviceId: registerInstallations.id, revokedAt: registerInstallations.revokedAt })
    .from(registerInstallations)
    .where(
      and(
        eq(registerInstallations.tokenLookupPrefix, lookupPrefix),
        eq(registerInstallations.tokenHash, hashDeviceToken(deviceToken)),
      ),
    );
  if (!installation) {
    return REJECTED;
  }
  return {
    kind: "installation",
    installation: { deviceId: installation.deviceId, revoked: installation.revokedAt !== null },
  };
}
