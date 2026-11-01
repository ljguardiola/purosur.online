import { ANOTHER_FICTIONAL_CUIT, FICTIONAL_CUIT } from "@purosur/domain/fiscal/test-support";
import {
  createSupplier,
  deactivateSupplier,
  editSupplier,
  reactivateSupplier,
  SupplierCuitConflict,
  SupplierNameConflict,
} from "@purosur/domain/purchasing/use-cases";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { suppliers } from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { DrizzlePurchasingStore } from "./drizzle-purchasing-store.js";
import { insertActor } from "./test-support/purchasing-fixtures.js";

let testDatabase: TestDatabase;
let db: TestDatabase["db"];
let actorId: string;

const CREATED_AT = new Date("2026-09-16T15:00:00.000Z");
const UPDATED_AT = new Date("2026-09-17T15:00:00.000Z");
let now = CREATED_AT;

const store = () => new DrizzlePurchasingStore(db, () => now);

beforeAll(async () => {
  testDatabase = await buildTestDatabase();
  db = testDatabase.db;
});

afterAll(async () => {
  await testDatabase.close();
});

beforeEach(async () => {
  await testDatabase.clear();
  actorId = await insertActor(db);
  now = CREATED_AT;
});

async function newSupplier(fields: { name?: string; cuit?: string | null } = {}) {
  const outcome = await createSupplier(store(), {
    name: fields.name ?? "Distribuidora Sur",
    cuit: fields.cuit ?? null,
    contact: "Marta, 11 5555-0000",
    note: "Entrega los martes",
    actorId,
  });
  if (outcome.kind !== "created") {
    throw new Error(`test setup: creating the supplier ended as ${outcome.kind}`);
  }
  return outcome.supplier;
}

describe("the suppliers a purchasing store keeps", () => {
  it("stores a created supplier active at version 1, written by the actor", async () => {
    const supplier = await newSupplier({ cuit: FICTIONAL_CUIT });

    const [row] = await db.select().from(suppliers).where(eq(suppliers.id, supplier.id));
    expect(row).toMatchObject({
      name: "Distribuidora Sur",
      cuit: FICTIONAL_CUIT,
      contact: "Marta, 11 5555-0000",
      note: "Entrega los martes",
      active: true,
      version: 1,
      actorId,
      updatedAt: CREATED_AT,
    });
  });

  it("refuses a name another supplier has in another letter case, deactivated or not", async () => {
    const first = await newSupplier();
    await deactivateSupplier(store(), { id: first.id, actorId });

    const outcome = await createSupplier(store(), {
      name: "DISTRIBUIDORA sur",
      cuit: null,
      contact: null,
      note: null,
      actorId,
    });

    expect(outcome).toEqual({ kind: "name_taken" });
  });

  it("refuses a tax id another supplier has, and none else is refused for lacking one", async () => {
    await newSupplier({ cuit: FICTIONAL_CUIT });

    const taken = await createSupplier(store(), {
      name: "Otra",
      cuit: FICTIONAL_CUIT,
      contact: null,
      note: null,
      actorId,
    });

    expect(taken).toEqual({ kind: "cuit_taken" });
    await newSupplier({ name: "Sin CUIT 1" });
    await newSupplier({ name: "Sin CUIT 2" });
  });

  it("lets a supplier keep its own name and tax id when it is edited", async () => {
    const supplier = await newSupplier({ cuit: FICTIONAL_CUIT });

    const outcome = await editSupplier(store(), {
      id: supplier.id,
      name: "DISTRIBUIDORA SUR",
      cuit: FICTIONAL_CUIT,
      contact: null,
      note: null,
      version: supplier.version,
      actorId,
    });

    expect(outcome).toMatchObject({ kind: "applied", supplier: { version: 2 } });
    const [row] = await db.select().from(suppliers).where(eq(suppliers.id, supplier.id));
    expect(row).toMatchObject({ name: "DISTRIBUIDORA SUR", contact: null, version: 2 });
  });

  it("refuses editing a supplier into another's tax id", async () => {
    await newSupplier({ cuit: FICTIONAL_CUIT });
    const second = await newSupplier({ name: "Otra", cuit: ANOTHER_FICTIONAL_CUIT });

    const outcome = await editSupplier(store(), {
      id: second.id,
      name: "Otra",
      cuit: FICTIONAL_CUIT,
      contact: null,
      note: null,
      version: second.version,
      actorId,
    });

    expect(outcome).toEqual({ kind: "cuit_taken" });
  });

  it("deactivates and reactivates a supplier, bumping its version each time", async () => {
    const supplier = await newSupplier();

    now = UPDATED_AT;
    await deactivateSupplier(store(), { id: supplier.id, actorId });
    const [deactivated] = await db.select().from(suppliers).where(eq(suppliers.id, supplier.id));
    await reactivateSupplier(store(), { id: supplier.id, actorId });
    const [reactivated] = await db.select().from(suppliers).where(eq(suppliers.id, supplier.id));

    expect(deactivated).toMatchObject({ active: false, version: 2, updatedAt: UPDATED_AT });
    expect(reactivated).toMatchObject({ active: true, version: 3 });
  });

  it("answers not_found for a supplier that does not exist", async () => {
    const outcome = await deactivateSupplier(store(), {
      id: "00000000-0000-4000-8000-000000000000",
      actorId,
    });

    expect(outcome).toEqual({ kind: "not_found" });
  });
});

describe("a write that loses a uniqueness race", () => {
  it("raises SupplierNameConflict for a supplier name already stored in another letter case", async () => {
    await newSupplier();

    await expect(
      store().transaction((tx) =>
        tx.insertSupplier({
          name: "distribuidora SUR",
          cuit: null,
          contact: null,
          note: null,
          actorId,
        }),
      ),
    ).rejects.toBeInstanceOf(SupplierNameConflict);
  });

  it("raises SupplierCuitConflict for a tax id already stored", async () => {
    await newSupplier({ cuit: FICTIONAL_CUIT });

    await expect(
      store().transaction((tx) =>
        tx.insertSupplier({
          name: "Otra",
          cuit: FICTIONAL_CUIT,
          contact: null,
          note: null,
          actorId,
        }),
      ),
    ).rejects.toBeInstanceOf(SupplierCuitConflict);
  });

  it("raises SupplierNameConflict when an update renames a supplier onto another's name", async () => {
    await newSupplier();
    const other = await newSupplier({ name: "Otra" });

    await expect(
      store().transaction((tx) =>
        tx.updateSupplier(other.id, {
          name: "DISTRIBUIDORA SUR",
          cuit: null,
          contact: null,
          note: null,
          active: true,
          version: 2,
          actorId,
        }),
      ),
    ).rejects.toBeInstanceOf(SupplierNameConflict);
  });

  it("raises SupplierCuitConflict when an update gives a supplier another's tax id", async () => {
    await newSupplier({ cuit: FICTIONAL_CUIT });
    const other = await newSupplier({ name: "Otra" });

    await expect(
      store().transaction((tx) =>
        tx.updateSupplier(other.id, {
          name: "Otra",
          cuit: FICTIONAL_CUIT,
          contact: null,
          note: null,
          active: true,
          version: 2,
          actorId,
        }),
      ),
    ).rejects.toBeInstanceOf(SupplierCuitConflict);
  });
});
