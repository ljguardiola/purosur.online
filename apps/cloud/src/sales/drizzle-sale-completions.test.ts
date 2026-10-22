import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  insertRegisterWithPointOfSale,
  insertSaleOfRegister,
} from "../fiscal/test-support/authorization-request-fixtures.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { DrizzleSaleCompletions } from "./drizzle-sale-completions.js";

let testDatabase: TestDatabase;

beforeAll(async () => {
  testDatabase = await buildTestDatabase();
});

afterAll(async () => {
  await testDatabase.close();
});

beforeEach(async () => {
  await testDatabase.clear();
});

describe("whether the cloud holds the completion of a register's sale", () => {
  it("does for a completed sale of the register, and still once it is voided", async () => {
    const registerId = await insertRegisterWithPointOfSale(testDatabase.db, {
      pointOfSaleNumber: 7,
      name: "caja-1",
    });
    const completedSaleId = crypto.randomUUID();
    const voidedSaleId = crypto.randomUUID();
    await insertSaleOfRegister(testDatabase.db, registerId, completedSaleId);
    await insertSaleOfRegister(testDatabase.db, registerId, voidedSaleId, "VOIDED");
    const completions = new DrizzleSaleCompletions(testDatabase.db);

    expect([
      await completions.holdsCompletionOf(registerId, completedSaleId),
      await completions.holdsCompletionOf(registerId, voidedSaleId),
    ]).toEqual([true, true]);
  });

  it("does not for a sale the cloud never received, another register's sale, nor a cancelled sale", async () => {
    const registerId = await insertRegisterWithPointOfSale(testDatabase.db, {
      pointOfSaleNumber: 7,
      name: "caja-1",
    });
    const otherRegisterId = await insertRegisterWithPointOfSale(testDatabase.db, {
      pointOfSaleNumber: 8,
      name: "caja-2",
    });
    const othersSaleId = crypto.randomUUID();
    const cancelledSaleId = crypto.randomUUID();
    await insertSaleOfRegister(testDatabase.db, otherRegisterId, othersSaleId);
    await insertSaleOfRegister(testDatabase.db, registerId, cancelledSaleId, "CANCELLED");
    const completions = new DrizzleSaleCompletions(testDatabase.db);

    expect([
      await completions.holdsCompletionOf(registerId, crypto.randomUUID()),
      await completions.holdsCompletionOf(registerId, othersSaleId),
      await completions.holdsCompletionOf(registerId, cancelledSaleId),
    ]).toEqual([false, false, false]);
  });
});
