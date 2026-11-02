import { describe, expect, it } from "vitest";
import {
  databaseWithSalesBefore,
  SELLER,
  VOIDER,
} from "./test-support/sales-before-voided-by-migration.js";

const databaseBefore = () => databaseWithSalesBefore("_sale_voided_by");

describe("the sale voided by migration applied over a database that already holds data", {
  timeout: 30_000,
}, () => {
  it("fills who voided a voided sale from the actor of the applied event that voided it, not from the seller", async () => {
    const { database, insertSale, insertEvent } = await databaseBefore();
    const voidedSale = await insertSale("VOIDED");
    await insertEvent(voidedSale, "someone-else", null);
    await insertEvent(voidedSale, "someone-else-too", "2026-10-06T11:30:00Z", "sale_completed");
    await insertEvent(voidedSale, VOIDER);

    const migrated = await database.applyMigration();

    const { rows } = await migrated.query("select actor_id, voided_by from sales where id = $1", [
      voidedSale,
    ]);
    expect(rows).toEqual([{ actor_id: SELLER, voided_by: VOIDER }]);
  });

  it("leaves a sale that was never voided without anyone who voided it", async () => {
    const { database, insertSale, insertEvent } = await databaseBefore();
    const completedSale = await insertSale("COMPLETED");
    await insertEvent(completedSale, VOIDER);

    const migrated = await database.applyMigration();

    const { rows } = await migrated.query("select voided_by from sales where id = $1", [
      completedSale,
    ]);
    expect(rows).toEqual([{ voided_by: null }]);
  });

  it("leaves a voided sale with no applied voiding event without anyone who voided it", async () => {
    const { database, insertSale } = await databaseBefore();
    const voidedSale = await insertSale("VOIDED");

    const migrated = await database.applyMigration();

    const { rows } = await migrated.query("select voided_by from sales where id = $1", [
      voidedSale,
    ]);
    expect(rows).toEqual([{ voided_by: null }]);
  });

  it("refuses, once every later migration is applied, to void a sale without recording who voided it", async () => {
    const { database, insertSale } = await databaseBefore();
    const completedSale = await insertSale("COMPLETED");
    const migrated = await database.applyMigration();
    await migrated.applyEveryLaterMigration();

    await expect(
      migrated.query(
        "update sales set state = 'VOIDED', voided_at = now(), void_authorized_by = 'boss-1' where id = $1",
        [completedSale],
      ),
    ).rejects.toThrow(/sales_voided_by_only_when_voided_check/);
    await expect(insertSale("VOIDED")).rejects.toThrow(/sales_voided_by_only_when_voided_check/);
  });
});
