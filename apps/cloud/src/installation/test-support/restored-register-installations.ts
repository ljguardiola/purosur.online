import { randomUUID } from "node:crypto";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { locations, registerInstallations, registers } from "../../platform/db/schema.js";
import { issueDeviceToken } from "../device-token.js";

export const T0 = new Date("2026-09-01T10:00:00.000Z");

export function hoursAfter(base: Date, hours: number): Date {
  return new Date(base.getTime() + hours * 60 * 60 * 1000);
}

function idStartingWith(prefix: string): string {
  return prefix + randomUUID().slice(prefix.length);
}

export async function insertBranch<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
): Promise<string> {
  const [location] = await db.insert(locations).values({}).returning({ id: locations.id });
  if (!location) {
    throw new Error("test setup: seeding the branch returned no row");
  }
  return location.id;
}

export async function insertRegister<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  locationId: string,
): Promise<string> {
  const [register] = await db
    .insert(registers)
    .values({ locationId, name: `Caja ${randomUUID()}` })
    .returning({ id: registers.id });
  if (!register) {
    throw new Error("test setup: seeding the register returned no row");
  }
  return register.id;
}

export async function insertInstallation<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  registerId: string,
  options: { id?: string; enrolledAt: Date; revokedAt?: Date },
): Promise<string> {
  const { lookupPrefix, tokenHash } = issueDeviceToken();
  const [installation] = await db
    .insert(registerInstallations)
    .values({
      ...(options.id !== undefined && { id: options.id }),
      registerId,
      tokenLookupPrefix: lookupPrefix,
      tokenHash,
      tokenIssuedAt: options.enrolledAt,
      hostname: "CAJA-MOSTRADOR",
      windowsVersion: "Windows 11 Pro 10.0.26100",
      enrolledAt: options.enrolledAt,
      revokedAt: options.revokedAt ?? null,
    })
    .returning({ id: registerInstallations.id });
  if (!installation) {
    throw new Error("test setup: seeding the installation returned no row");
  }
  return installation.id;
}

export async function aRegisterRestoredTwice<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
) {
  const registerId = await insertRegister(db, await insertBranch(db));
  const predecessor = await insertInstallation(db, registerId, {
    id: idStartingWith("ffffffff"),
    enrolledAt: T0,
    revokedAt: hoursAfter(T0, 5),
  });
  const second = await insertInstallation(db, registerId, {
    id: idStartingWith("00000000"),
    enrolledAt: hoursAfter(T0, 2),
    revokedAt: hoursAfter(T0, 6),
  });
  const third = await insertInstallation(db, registerId, { enrolledAt: hoursAfter(T0, 4) });
  return { registerId, predecessor, second, third };
}
