import { randomUUID } from "node:crypto";
import {
  configureRegisterOfflinePointOfSale,
  configureRegisterPointOfSale,
} from "@purosur/domain/fiscal/use-cases";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  fiscalAddresses,
  pointOfSaleClaims,
  registerOfflinePointsOfSale,
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
import { DrizzleRegisterOfflinePointOfSaleStore } from "./drizzle-register-offline-point-of-sale-store.js";
import { DrizzleRegisterPointOfSaleStore } from "./drizzle-register-point-of-sale-store.js";

const NOON = new Date("2026-01-05T12:00:00.000Z");

const FOREIGN_KEY_VIOLATION = "23503";
const CHECK_VIOLATION = "23514";

let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let adminSql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("register_offline_point_of_sale");
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
    .values({ firstName: "Ada Lucero", email: `ada-${randomUUID()}@example.com`, locationId })
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

describe("two registers claiming the same number under different mechanisms at once on a real Postgres", () => {
  it("gives the number to one of them and refuses the other as point_of_sale_taken", async () => {
    const { locationId, actorId, fiscalAddressId, firstRegisterId, secondRegisterId } =
      await seedTwoRegisters();
    const realTime = new DrizzleRegisterPointOfSaleStore(db, () => NOON);
    await configureRegisterPointOfSale(realTime, {
      locationId,
      registerId: secondRegisterId,
      pointOfSaleNumber: 61,
      fiscalAddressId,
      version: 0,
      actorId,
    });

    // A SHARE lock lets both registers read that the number is free but parks both claims, so the
    // loser meets the winner's claim in the database's primary key.
    const outcomes = await runQueuedBehindHeldLock(
      adminSql,
      (holder) => holder.unsafe("lock table point_of_sale_claims in share mode"),
      () =>
        configureRegisterPointOfSale(realTime, {
          locationId,
          registerId: firstRegisterId,
          pointOfSaleNumber: 60,
          fiscalAddressId,
          version: 0,
          actorId,
        }),
      () =>
        configureRegisterOfflinePointOfSale(
          new DrizzleRegisterOfflinePointOfSaleStore(db, () => NOON),
          {
            locationId,
            registerId: secondRegisterId,
            pointOfSaleNumber: 60,
            version: 0,
            actorId,
          },
        ),
    );

    expect(outcomes.map(({ kind }) => kind).sort()).toEqual(["configured", "point_of_sale_taken"]);
    const claimsOf60 = (await db.select().from(pointOfSaleClaims)).filter(
      ({ pointOfSaleNumber }) => pointOfSaleNumber === 60,
    );
    expect(claimsOf60).toHaveLength(1);
  });
});

describe("a register's offline point of sale stored directly, as cloud_app", () => {
  it("is refused by the database when the register has no real-time point of sale", async () => {
    const { actorId, firstRegisterId } = await seedTwoRegisters();
    await db.insert(pointOfSaleClaims).values({
      pointOfSaleNumber: 70,
      registerId: firstRegisterId,
      mechanism: "offline",
      claimedBy: actorId,
    });

    const insertion = db.insert(registerOfflinePointsOfSale).values({
      registerId: firstRegisterId,
      pointOfSaleNumber: 70,
      version: 1,
    });

    await expect(insertion).rejects.toMatchObject({ cause: { code: FOREIGN_KEY_VIOLATION } });
  });

  it("is refused by the database when the number is claimed as a real-time point of sale", async () => {
    const { actorId, fiscalAddressId, firstRegisterId } = await seedTwoRegisters();
    await db.insert(pointOfSaleClaims).values({
      pointOfSaleNumber: 71,
      registerId: firstRegisterId,
      mechanism: "real_time",
      claimedBy: actorId,
    });
    await db
      .insert(registerPointsOfSale)
      .values({ registerId: firstRegisterId, pointOfSaleNumber: 71, fiscalAddressId, version: 1 });

    const insertion = db.insert(registerOfflinePointsOfSale).values({
      registerId: firstRegisterId,
      pointOfSaleNumber: 71,
      version: 1,
    });

    await expect(insertion).rejects.toMatchObject({ cause: { code: FOREIGN_KEY_VIOLATION } });
  });

  it("is refused by the database when it claims to be a real-time point of sale", async () => {
    const { actorId, fiscalAddressId, firstRegisterId } = await seedTwoRegisters();
    await db
      .insert(pointOfSaleClaims)
      .values([
        {
          pointOfSaleNumber: 72,
          registerId: firstRegisterId,
          mechanism: "real_time",
          claimedBy: actorId,
        },
      ]);
    await db
      .insert(registerPointsOfSale)
      .values({ registerId: firstRegisterId, pointOfSaleNumber: 72, fiscalAddressId, version: 1 });

    const insertion = db.insert(registerOfflinePointsOfSale).values({
      registerId: firstRegisterId,
      pointOfSaleNumber: 72,
      mechanism: "real_time",
      version: 1,
    });

    await expect(insertion).rejects.toMatchObject({ cause: { code: CHECK_VIOLATION } });
  });

  it("is accepted when the register has a real-time point of sale and the number is its own offline claim", async () => {
    const { actorId, fiscalAddressId, firstRegisterId } = await seedTwoRegisters();
    await db.insert(pointOfSaleClaims).values([
      {
        pointOfSaleNumber: 73,
        registerId: firstRegisterId,
        mechanism: "real_time",
        claimedBy: actorId,
      },
      {
        pointOfSaleNumber: 74,
        registerId: firstRegisterId,
        mechanism: "offline",
        claimedBy: actorId,
      },
    ]);
    await db
      .insert(registerPointsOfSale)
      .values({ registerId: firstRegisterId, pointOfSaleNumber: 73, fiscalAddressId, version: 1 });

    await db.insert(registerOfflinePointsOfSale).values({
      registerId: firstRegisterId,
      pointOfSaleNumber: 74,
      version: 1,
    });

    expect(
      (await db.select().from(registerOfflinePointsOfSale)).filter(
        ({ registerId }) => registerId === firstRegisterId,
      ),
    ).toMatchObject([{ pointOfSaleNumber: 74, mechanism: "offline" }]);
  });
});

describe("a register's real-time point of sale stored directly, as cloud_app", () => {
  it("is refused by the database when the number is claimed as an offline point of sale", async () => {
    const { actorId, fiscalAddressId, firstRegisterId } = await seedTwoRegisters();
    await db.insert(pointOfSaleClaims).values({
      pointOfSaleNumber: 75,
      registerId: firstRegisterId,
      mechanism: "offline",
      claimedBy: actorId,
    });

    const insertion = db
      .insert(registerPointsOfSale)
      .values({ registerId: firstRegisterId, pointOfSaleNumber: 75, fiscalAddressId, version: 1 });

    await expect(insertion).rejects.toMatchObject({ cause: { code: FOREIGN_KEY_VIOLATION } });
  });
});
