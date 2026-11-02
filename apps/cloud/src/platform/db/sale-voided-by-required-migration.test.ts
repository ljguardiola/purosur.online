import { describe, expect, it } from "vitest";
import {
  databaseWithSalesBefore,
  SELLER,
  VOIDER,
} from "./test-support/sales-before-voided-by-migration.js";

const databaseBefore = () => databaseWithSalesBefore("_sale_voided_by_required");

describe("the migration that requires who voided a sale applied over a database that already holds data", {
  timeout: 30_000,
}, () => {
  it("fills who voided a sale voided during the deploy from the actor of its earliest applied voiding event, not from the seller", async () => {
    const { database, insertSale, insertEvent } = await databaseBefore();
    const voidedSale = await insertSale("VOIDED");
    await insertEvent(voidedSale, "someone-else", null);
    await insertEvent(voidedSale, "someone-else-too", "2026-10-06T11:30:00Z", "sale_completed");
    await insertEvent(voidedSale, VOIDER, "2026-10-06T11:40:05Z");
    await insertEvent(voidedSale, "replayed-later", "2026-10-06T11:50:00Z");

    const migrated = await database.applyMigration();

    const { rows } = await migrated.query("select actor_id, voided_by from sales where id = $1", [
      voidedSale,
    ]);
    expect(rows).toEqual([{ actor_id: SELLER, voided_by: VOIDER }]);
  });

  it("keeps who voided a sale that already records it", async () => {
    const { database, insertSale, insertEvent } = await databaseBefore();
    const voidedSale = await insertSale("VOIDED");
    await database.query("update sales set voided_by = 'recorded-voider' where id = $1", [
      voidedSale,
    ]);
    await insertEvent(voidedSale, VOIDER);

    const migrated = await database.applyMigration();

    const { rows } = await migrated.query("select voided_by from sales where id = $1", [voidedSale]);
    expect(rows).toEqual([{ voided_by: "recorded-voider" }]);
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

  it("refuses a voided sale without who voided it and a sale in another state with someone who voided it", async () => {
    const { database, insertSale } = await databaseBefore();
    const completedSale = await insertSale("COMPLETED");
    const migrated = await database.applyMigration();

    await expect(insertSale("VOIDED")).rejects.toThrow(/sales_voided_by_only_when_voided_check/);
    await expect(
      migrated.query("update sales set voided_by = $1 where id = $2", [VOIDER, completedSale]),
    ).rejects.toThrow(/sales_voided_by_only_when_voided_check/);
    await migrated.query(
      "update sales set state = 'VOIDED', voided_at = now(), voided_by = $1 where id = $2",
      [VOIDER, completedSale],
    );
    const { rows } = await migrated.query("select state, voided_by from sales where id = $1", [
      completedSale,
    ]);
    expect(rows).toEqual([{ state: "VOIDED", voided_by: VOIDER }]);
  });
});
