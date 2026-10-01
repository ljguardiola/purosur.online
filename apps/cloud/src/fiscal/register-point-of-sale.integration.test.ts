import { randomUUID } from "node:crypto";
import { configureRegisterPointOfSale } from "@purosur/domain/fiscal/use-cases";
import { eq } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  fiscalAddresses,
  pointOfSaleClaims,
  registerPointsOfSale,
  registers,
  users,
} from "../platform/db/schema.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import { runQueuedBehindHeldLock } from "../test-support/queued-behind-held-lock.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { DrizzleRegisterPointOfSaleStore } from "./drizzle-register-point-of-sale-store.js";

const FOREIGN_KEY_VIOLATION = "23503";

let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let adminSql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("register_point_of_sale");
  sql = postgres(integrationDb.databaseUrl, { max: 4 });
  adminSql = postgres(integrationDb.adminDatabaseUrl, { max: 4 });
  db = drizzle(sql);
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await adminSql.end({ timeout: 1 });
  await integrationDb.close();
});

async function seedTwoRegisters() {
  const locationId = await seededLocationId(db);
  const [actor] = await db
    .insert(users)
    .values({ firstName: "Ada Lovelace", email: `ada-${randomUUID()}@example.com`, locationId })
    .returning({ id: users.id });
  const [fiscalAddress] = await db
    .insert(fiscalAddresses)
    .values({ name: `Deposito ${randomUUID()}`, streetAddress: "Calle Ficticia 123, CABA" })
    .returning({ id: fiscalAddresses.id });
  const [first, second] = await db
    .insert(registers)
    .values([
      { locationId, name: `Caja ${randomUUID()}` },
      { locationId, name: `Caja ${randomUUID()}` },
    ])
    .returning({ id: registers.id });
  if (!actor || !fiscalAddress || !first || !second) {
    throw new Error("test setup: seeding the registers returned no row");
  }
  return {
    locationId,
    actorId: actor.id,
    fiscalAddressId: fiscalAddress.id,
    firstRegisterId: first.id,
    secondRegisterId: second.id,
  };
}

describe("two registers configured at once with the same point-of-sale number on a real Postgres", () => {
  it("gives the number to one of them and refuses the other as point_of_sale_taken", async () => {
    const { locationId, actorId, fiscalAddressId, firstRegisterId, secondRegisterId } =
      await seedTwoRegisters();
    const configure = (registerId: string) => () =>
      configureRegisterPointOfSale(new DrizzleRegisterPointOfSaleStore(db), {
        locationId,
        registerId,
        pointOfSaleNumber: 42,
        fiscalAddressId,
        version: 0,
        actorId,
      });

    // A SHARE lock lets both registers read that the number is free but parks both claims, so the
    // loser meets the winner's claim in the database's primary key.
    const outcomes = await runQueuedBehindHeldLock(
      adminSql,
      (holder) => holder.unsafe("lock table point_of_sale_claims in share mode"),
      configure(firstRegisterId),
      configure(secondRegisterId),
    );

    expect(outcomes.map(({ kind }) => kind).sort()).toEqual(["configured", "point_of_sale_taken"]);
    const claims = await db.select().from(pointOfSaleClaims);
    expect(claims).toHaveLength(1);
    expect(await db.select().from(registerPointsOfSale)).toMatchObject([
      { registerId: claims[0]?.registerId, pointOfSaleNumber: 42 },
    ]);
  });
});

describe("a register's point of sale stored directly, as cloud_app", () => {
  it("is refused by the database when the number is claimed by another register", async () => {
    const { actorId, fiscalAddressId, firstRegisterId, secondRegisterId } =
      await seedTwoRegisters();
    await db
      .insert(pointOfSaleClaims)
      .values({ pointOfSaleNumber: 51, registerId: firstRegisterId, claimedBy: actorId });

    const insertion = db.insert(registerPointsOfSale).values({
      registerId: secondRegisterId,
      pointOfSaleNumber: 51,
      fiscalAddressId,
      version: 1,
    });

    await expect(insertion).rejects.toMatchObject({
      cause: { code: FOREIGN_KEY_VIOLATION },
    });
    expect(
      await db
        .select()
        .from(registerPointsOfSale)
        .where(eq(registerPointsOfSale.registerId, secondRegisterId)),
    ).toEqual([]);
  });

  it("is refused by the database when the number is not claimed at all", async () => {
    const { fiscalAddressId, firstRegisterId } = await seedTwoRegisters();

    const insertion = db.insert(registerPointsOfSale).values({
      registerId: firstRegisterId,
      pointOfSaleNumber: 52,
      fiscalAddressId,
      version: 1,
    });

    await expect(insertion).rejects.toMatchObject({ cause: { code: FOREIGN_KEY_VIOLATION } });
  });

  it("is accepted when the number is the register's own claim", async () => {
    const { actorId, fiscalAddressId, firstRegisterId } = await seedTwoRegisters();
    await db
      .insert(pointOfSaleClaims)
      .values({ pointOfSaleNumber: 53, registerId: firstRegisterId, claimedBy: actorId });

    await db.insert(registerPointsOfSale).values({
      registerId: firstRegisterId,
      pointOfSaleNumber: 53,
      fiscalAddressId,
      version: 1,
    });

    expect(
      await db
        .select()
        .from(registerPointsOfSale)
        .where(eq(registerPointsOfSale.registerId, firstRegisterId)),
    ).toMatchObject([{ pointOfSaleNumber: 53 }]);
  });
});
