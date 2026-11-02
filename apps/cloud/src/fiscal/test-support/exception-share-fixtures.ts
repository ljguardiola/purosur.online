import { eq, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import {
  fiscalAddresses,
  pointOfSaleClaims,
  registerFiscalAddressAssignments,
  registerInstallations,
  registerPointsOfSale,
  registers,
  users,
} from "../../platform/db/schema.js";
import { seededLocationId } from "../../test-support/seeded-location.js";

type Db = PgDatabase<PgQueryResultHKT>;

let nextPointOfSale = 1;

export async function insertFiscalAddress(db: Db, name: string): Promise<string> {
  const [fiscalAddress] = await db
    .insert(fiscalAddresses)
    .values({ name, streetAddress: "Calle Ficticia 123, CABA" })
    .returning({ id: fiscalAddresses.id });
  if (!fiscalAddress) {
    throw new Error("test setup: seeding the fiscal address returned no row");
  }
  return fiscalAddress.id;
}

export async function insertRegisterAtFiscalAddress(
  db: Db,
  fiscalAddressId: string,
  registerName: string,
  pointOfSaleNumber: number = nextPointOfSale++,
): Promise<string> {
  const locationId = await seededLocationId(db);
  const [actor] = await db
    .insert(users)
    .values({
      firstName: "Ada Lucero",
      email: `${registerName.replaceAll(" ", "-")}-${nextPointOfSale}@example.com`,
      locationId,
    })
    .returning({ id: users.id });
  const [register] = await db
    .insert(registers)
    .values({ locationId, name: registerName })
    .returning({ id: registers.id });
  if (!actor || !register) {
    throw new Error("test setup: seeding the register returned no row");
  }
  await db.insert(pointOfSaleClaims).values({
    pointOfSaleNumber,
    registerId: register.id,
    mechanism: "real_time",
    claimedBy: actor.id,
  });
  await db.insert(registerPointsOfSale).values({
    registerId: register.id,
    pointOfSaleNumber,
    fiscalAddressId,
    version: 1,
  });
  await db
    .insert(registerFiscalAddressAssignments)
    .values({ registerId: register.id, fiscalAddressId, assignedAt: sql`'-infinity'` });
  return register.id;
}

export async function moveRegisterToFiscalAddress(
  db: Db,
  registerId: string,
  fiscalAddressId: string,
  at: Date,
): Promise<void> {
  await db
    .update(registerPointsOfSale)
    .set({ fiscalAddressId, version: sql`${registerPointsOfSale.version} + 1` })
    .where(eq(registerPointsOfSale.registerId, registerId));
  await db
    .insert(registerFiscalAddressAssignments)
    .values({ registerId, fiscalAddressId, assignedAt: at });
}

export async function enrollRegister(
  db: Db,
  registerId: string,
  enrolledAt: Date,
  revokedAt: Date | null = null,
): Promise<void> {
  await db.insert(registerInstallations).values({
    registerId,
    tokenLookupPrefix: crypto.randomUUID(),
    tokenHash: "hash",
    tokenIssuedAt: enrolledAt,
    hostname: "CAJA-MOSTRADOR",
    windowsVersion: "Windows 11 Pro 10.0.26100",
    enrolledAt,
    revokedAt,
    revocationReason: revokedAt === null ? null : "replaced",
  });
}
