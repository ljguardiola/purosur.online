import {
  configureRegisterOfflinePointOfSale,
  configureRegisterPointOfSale,
} from "@purosur/domain/fiscal/use-cases";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import {
  fiscalAddresses,
  pointOfSaleClaims,
  registerOfflinePointsOfSale,
  registerPointsOfSale,
  registers,
  taxAuthorityLastAuthorizedNumbers,
  users,
} from "../../platform/db/schema.js";
import { seededLocationId } from "../../test-support/seeded-location.js";
import { DrizzleRegisterOfflinePointOfSaleStore } from "../drizzle-register-offline-point-of-sale-store.js";
import { DrizzleRegisterPointOfSaleStore } from "../drizzle-register-point-of-sale-store.js";

export async function seedOfflinePointOfSale<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
): Promise<string> {
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
  return register.id;
}

export interface ConfiguredOfflinePointOfSale {
  registerName: string;
  realTimePointOfSale: number;
  offlinePointOfSale: number;
  now: Date;
}

export async function configureOfflinePointOfSale<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  { registerName, realTimePointOfSale, offlinePointOfSale, now }: ConfiguredOfflinePointOfSale,
): Promise<string> {
  const locationId = await seededLocationId(db);
  const [actor] = await db
    .insert(users)
    .values({ firstName: "Ada Lucero", email: `${registerName}@example.com`, locationId })
    .returning({ id: users.id });
  const [register] = await db
    .insert(registers)
    .values({ locationId, name: registerName })
    .returning({ id: registers.id });
  const [fiscalAddress] = await db
    .insert(fiscalAddresses)
    .values({ name: `Deposito ${registerName}`, streetAddress: "Calle Ficticia 123, CABA" })
    .returning({ id: fiscalAddresses.id });
  if (!actor || !register || !fiscalAddress) {
    throw new Error("test setup: seeding the offline point of sale's parents returned no row");
  }
  const base = { locationId, registerId: register.id, actorId: actor.id };
  await db
    .insert(taxAuthorityLastAuthorizedNumbers)
    .values({ pointOfSaleNumber: offlinePointOfSale, lastAuthorized: 0, readAt: now });
  const realTime = await configureRegisterPointOfSale(
    new DrizzleRegisterPointOfSaleStore(db, () => now),
    {
      ...base,
      pointOfSaleNumber: realTimePointOfSale,
      fiscalAddressId: fiscalAddress.id,
      version: 0,
    },
  );
  const offline = await configureRegisterOfflinePointOfSale(
    new DrizzleRegisterOfflinePointOfSaleStore(db, () => now),
    { ...base, pointOfSaleNumber: offlinePointOfSale, version: 0 },
  );
  if (realTime.kind !== "configured" || offline.kind !== "configured") {
    throw new Error("test setup: the register's points of sale were not configured");
  }
  return register.id;
}
