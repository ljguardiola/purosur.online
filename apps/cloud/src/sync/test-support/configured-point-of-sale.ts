import {
  type ConfigureRegisterPointOfSaleInput,
  configureRegisterPointOfSale,
} from "@purosur/domain/fiscal/use-cases";
import { DrizzleRegisterPointOfSaleStore } from "../../fiscal/drizzle-register-point-of-sale-store.js";
import { fiscalAddresses, registers, users } from "../../platform/db/schema.js";
import type { TestDatabase } from "../../test-support/build-test-database.js";

type Database = TestDatabase["db"];

export async function insertRegister(
  db: Database,
  locationId: string,
  name: string,
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

export async function insertFiscalAddress(
  db: Database,
  name = "Deposito Central",
): Promise<string> {
  const [fiscalAddress] = await db
    .insert(fiscalAddresses)
    .values({ name, streetAddress: "Calle Ficticia 123, CABA" })
    .returning({ id: fiscalAddresses.id });
  if (!fiscalAddress) {
    throw new Error("test setup: seeding the fiscal address returned no row");
  }
  return fiscalAddress.id;
}

export async function insertActor(
  db: Database,
  locationId: string,
  email = "ada@example.com",
): Promise<string> {
  const [actor] = await db
    .insert(users)
    .values({ firstName: "Ada Lucero", email, locationId })
    .returning({ id: users.id });
  if (!actor) {
    throw new Error("test setup: seeding the actor returned no row");
  }
  return actor.id;
}

export async function configurePointOfSale(
  db: Database,
  now: Date,
  input: ConfigureRegisterPointOfSaleInput,
): Promise<void> {
  const outcome = await configureRegisterPointOfSale(
    new DrizzleRegisterPointOfSaleStore(db, () => now),
    input,
  );
  if (outcome.kind !== "configured") {
    throw new Error(`test setup: configuring ended as ${outcome.kind}`);
  }
}
