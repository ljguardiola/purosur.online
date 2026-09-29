import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { registerInstallations, registers } from "../../platform/db/schema.js";
import { seededLocationId } from "../../test-support/seeded-location.js";
import { issueDeviceToken } from "../device-token.js";

export interface EnrolledInstallation {
  deviceId: string;
  registerId: string;
  locationId: string;
  deviceToken: string;
}

export async function insertEnrolledInstallation<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  options: { revokedAt?: Date } = {},
): Promise<EnrolledInstallation> {
  const locationId = await seededLocationId(db);
  const [register] = await db
    .insert(registers)
    .values({ locationId, name: "Caja 1" })
    .returning({ id: registers.id });
  if (!register) {
    throw new Error("test setup: seeding the register returned no row");
  }
  const { deviceToken, lookupPrefix, tokenHash } = issueDeviceToken();
  const [installation] = await db
    .insert(registerInstallations)
    .values({
      registerId: register.id,
      tokenLookupPrefix: lookupPrefix,
      tokenHash,
      hostname: "CAJA-MOSTRADOR",
      windowsVersion: "Windows 11 Pro 10.0.26100",
      enrolledAt: new Date("2026-09-28T12:00:00.000Z"),
      revokedAt: options.revokedAt ?? null,
    })
    .returning({ id: registerInstallations.id });
  if (!installation) {
    throw new Error("test setup: seeding the installation returned no row");
  }
  return { deviceId: installation.id, registerId: register.id, locationId, deviceToken };
}
