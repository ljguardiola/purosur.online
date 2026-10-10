import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import {
  fiscalAddresses,
  pointOfSaleClaims,
  registerOfflinePointsOfSale,
  registerPointsOfSale,
  registers,
  users,
} from "../../platform/db/schema.js";
import { seededLocationId } from "../../test-support/seeded-location.js";

export async function seedOfflinePointOfSale<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
): Promise<void> {
  const locationId = await seededLocationId(db);
  const [actor] = await db
    .insert(users)
    .values({ firstName: "Ada Lucero", email: "ada@example.com", locationId })
    .returning({ id: users.id });
  const [register] = await db
    .insert(registers)
    .values({ locationId, name: "Caja 1" })
    .returning({ id: registers.id });
  const [fiscalAddress] = await db
    .insert(fiscalAddresses)
    .values({ name: "Deposito Central", streetAddress: "Calle Ficticia 123, CABA" })
    .returning({ id: fiscalAddresses.id });
  if (!actor || !register || !fiscalAddress) {
    throw new Error("test setup: seeding the offline point of sale's parents returned no row");
  }
  await db.insert(pointOfSaleClaims).values([
    { pointOfSaleNumber: 7, registerId: register.id, mechanism: "real_time", claimedBy: actor.id },
    { pointOfSaleNumber: 8, registerId: register.id, mechanism: "offline", claimedBy: actor.id },
  ]);
  await db.insert(registerPointsOfSale).values({
    registerId: register.id,
    pointOfSaleNumber: 7,
    fiscalAddressId: fiscalAddress.id,
    version: 1,
  });
  await db.insert(registerOfflinePointsOfSale).values({
    registerId: register.id,
    pointOfSaleNumber: 8,
    version: 1,
  });
}
