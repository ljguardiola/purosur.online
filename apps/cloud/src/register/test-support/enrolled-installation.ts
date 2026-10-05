import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { registerInstallations, registers } from "../../platform/db/schema.js";
import { seededLocationId } from "../../test-support/seeded-location.js";
import { issueDeviceToken } from "../device-token.js";

export const ENROLLED_TOKEN_ISSUED_AT = new Date("2026-09-28T12:00:00.000Z");

export interface EnrolledInstallation {
  deviceId: string;
  registerId: string;
  locationId: string;
  deviceToken: string;
}

async function insertRegister<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  locationId: string,
  name = "Caja 1",
): Promise<string> {
  const [register] = await db
    .insert(registers)
    .values({ locationId, name })
    .returning({ id: registers.id });
  if (!register) {
    throw new Error("test setup: seeding the register returned no row");
  }
  return register.id;
}

export async function insertEnrolledInstallation<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  options: {
    revokedAt?: Date;
    tokenIssuedAt?: Date;
    registerName?: string;
    existingRegisterId?: string;
  } = {},
): Promise<EnrolledInstallation> {
  const locationId = await seededLocationId(db);
  const registerId =
    options.existingRegisterId ?? (await insertRegister(db, locationId, options.registerName));
  const { deviceToken, lookupPrefix, tokenHash } = issueDeviceToken();
  const [installation] = await db
    .insert(registerInstallations)
    .values({
      registerId,
      tokenLookupPrefix: lookupPrefix,
      tokenHash,
      tokenIssuedAt: options.tokenIssuedAt ?? ENROLLED_TOKEN_ISSUED_AT,
      hostname: "CAJA-MOSTRADOR",
      windowsVersion: "Windows 11 Pro 10.0.26100",
      enrolledAt: new Date("2026-09-28T12:00:00.000Z"),
      revokedAt: options.revokedAt ?? null,
    })
    .returning({ id: registerInstallations.id });
  if (!installation) {
    throw new Error("test setup: seeding the installation returned no row");
  }
  return { deviceId: installation.id, registerId, locationId, deviceToken };
}
