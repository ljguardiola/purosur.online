import {
  createFiscalAddress,
  editFiscalAddress,
  FiscalAddressNameConflict,
} from "@purosur/domain/fiscal/use-cases";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { auditLog, changes, fiscalAddresses, users } from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { DrizzleFiscalAddressReader } from "./drizzle-fiscal-address-reader.js";
import { DrizzleFiscalAddressStore } from "./drizzle-fiscal-address-store.js";

let testDatabase: TestDatabase;
let db: TestDatabase["db"];

beforeAll(async () => {
  testDatabase = await buildTestDatabase();
  db = testDatabase.db;
});

afterAll(async () => {
  await testDatabase.close();
});

beforeEach(async () => {
  await testDatabase.clear();
});

async function insertActor(): Promise<string> {
  const [actor] = await db
    .insert(users)
    .values({
      firstName: "Ada Lovelace",
      email: "ada@example.com",
      locationId: await seededLocationId(db),
    })
    .returning({ id: users.id });
  if (!actor) {
    throw new Error("test setup: seeding the actor returned no row");
  }
  return actor.id;
}

function ports() {
  return { store: new DrizzleFiscalAddressStore(db) };
}

describe("DrizzleFiscalAddressStore", () => {
  it("stores a created fiscal address at version 1 and lists it", async () => {
    const actorId = await insertActor();

    const outcome = await createFiscalAddress(ports(), {
      name: "Depósito Central",
      streetAddress: "Calle Ficticia 123, CABA",
      actorId,
    });

    if (outcome.kind !== "created") {
      throw new Error(`test setup: creating ended as ${outcome.kind}`);
    }
    expect(await db.select().from(fiscalAddresses)).toMatchObject([
      {
        id: outcome.fiscalAddress.id,
        name: "Depósito Central",
        streetAddress: "Calle Ficticia 123, CABA",
        version: 1,
      },
    ]);
  });

  it("audits the creation with the actor and the stored values", async () => {
    const actorId = await insertActor();

    const outcome = await createFiscalAddress(ports(), {
      name: "Depósito Central",
      streetAddress: "Calle Ficticia 123, CABA",
      actorId,
    });

    if (outcome.kind !== "created") {
      throw new Error(`test setup: creating ended as ${outcome.kind}`);
    }
    expect(await db.select().from(auditLog)).toMatchObject([
      {
        entity: "fiscal_address",
        entityId: outcome.fiscalAddress.id,
        actorId,
        previousValue: null,
        newValue: {
          name: "Depósito Central",
          street_address: "Calle Ficticia 123, CABA",
          version: 1,
        },
      },
    ]);
  });

  it("logs no change for the registers when a fiscal address is created or edited", async () => {
    const actorId = await insertActor();
    const created = await createFiscalAddress(ports(), {
      name: "Depósito Central",
      streetAddress: "Calle Ficticia 123, CABA",
      actorId,
    });
    if (created.kind !== "created") {
      throw new Error(`test setup: creating ended as ${created.kind}`);
    }
    const before = await db.select().from(changes);

    await editFiscalAddress(ports(), {
      fiscalAddressId: created.fiscalAddress.id,
      name: "Depósito Norte",
      streetAddress: "Calle Ficticia 123, CABA",
      version: 1,
      actorId,
    });

    expect(await db.select().from(changes)).toEqual(before);
  });

  it("updates the name and the street address, raising the version, and audits both values", async () => {
    const actorId = await insertActor();
    const created = await createFiscalAddress(ports(), {
      name: "Depósito Central",
      streetAddress: "Calle Ficticia 123, CABA",
      actorId,
    });
    if (created.kind !== "created") {
      throw new Error(`test setup: creating ended as ${created.kind}`);
    }

    const outcome = await editFiscalAddress(ports(), {
      fiscalAddressId: created.fiscalAddress.id,
      name: "Depósito Norte",
      streetAddress: "Avenida Inventada 45, CABA",
      version: 1,
      actorId,
    });

    expect(outcome.kind).toBe("edited");
    expect(await db.select().from(fiscalAddresses)).toMatchObject([
      { name: "Depósito Norte", streetAddress: "Avenida Inventada 45, CABA", version: 2 },
    ]);
    const edits = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.entityId, created.fiscalAddress.id));
    expect(edits.at(-1)).toMatchObject({
      actorId,
      previousValue: {
        name: "Depósito Central",
        street_address: "Calle Ficticia 123, CABA",
        version: 1,
      },
      newValue: {
        name: "Depósito Norte",
        street_address: "Avenida Inventada 45, CABA",
        version: 2,
      },
    });
  });

  it("finds no fiscal address for an id that nobody has", async () => {
    const store = new DrizzleFiscalAddressStore(db);

    const lookup = await store.transaction((tx) =>
      tx.lockFiscalAddress("7c9e6679-7425-40de-944b-e07fc1f90ae7"),
    );

    expect(lookup).toBeUndefined();
  });

  it("raises a name conflict when the name, in any letter case, is already stored", async () => {
    const actorId = await insertActor();
    await db
      .insert(fiscalAddresses)
      .values({ name: "Deposito Central", streetAddress: "Calle Ficticia 123, CABA" });
    const store = new DrizzleFiscalAddressStore(db);

    const insertion = store.transaction((tx) =>
      tx.insertFiscalAddress({
        name: "DEPOSITO CENTRAL",
        streetAddress: "Otra Calle 9, CABA",
        actorId,
      }),
    );

    await expect(insertion).rejects.toBeInstanceOf(FiscalAddressNameConflict);
  });

  it("raises a name conflict when an edit takes another fiscal address's name", async () => {
    const actorId = await insertActor();
    await db
      .insert(fiscalAddresses)
      .values({ name: "Deposito Central", streetAddress: "Calle Ficticia 123, CABA" });
    const [other] = await db
      .insert(fiscalAddresses)
      .values({ name: "Depósito Norte", streetAddress: "Avenida Inventada 45, CABA" })
      .returning({ id: fiscalAddresses.id });
    if (!other) {
      throw new Error("test setup: seeding the fiscal address returned no row");
    }
    const store = new DrizzleFiscalAddressStore(db);

    const update = store.transaction((tx) =>
      tx.updateFiscalAddress({
        id: other.id,
        name: "deposito central",
        streetAddress: "Avenida Inventada 45, CABA",
        version: 2,
        actorId,
      }),
    );

    await expect(update).rejects.toBeInstanceOf(FiscalAddressNameConflict);
  });
});

describe("DrizzleFiscalAddressReader", () => {
  it("lists every fiscal address ordered by name", async () => {
    await db.insert(fiscalAddresses).values([
      { name: "Sucursal Sur", streetAddress: "Calle Ficticia 1, CABA" },
      { name: "Depósito Central", streetAddress: "Calle Ficticia 2, CABA" },
    ]);

    const listed = await new DrizzleFiscalAddressReader(db).listFiscalAddresses();

    expect(listed.map(({ name }) => name)).toEqual(["Depósito Central", "Sucursal Sur"]);
    expect(listed[0]).toEqual({
      id: expect.any(String),
      name: "Depósito Central",
      streetAddress: "Calle Ficticia 2, CABA",
      version: 1,
    });
  });
});
