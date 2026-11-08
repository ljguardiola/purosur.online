import { describe, expect, it } from "vitest";
import { databaseBeforeMigration } from "./test-support/migration-under-test.js";

async function databaseBefore() {
  const database = await databaseBeforeMigration("_mercado_pago_settlement_reports");
  await database.query(
    "insert into registers (location_id, name) select id, 'Caja 1' from locations limit 1",
  );
  return database;
}

const INSERT_MOVEMENT = `insert into mercado_pago_settlement_movements
  (source_id, transaction_type, transaction_date, external_reference, payment_method,
   payment_method_type, gross_amount, fee_amount, financing_fee_amount, taxes_amount,
   net_amount, money_release_date, recorded_at)
  values ($1, $2, $3, 'ABC', 'master', 'credit_card', 10000, -450, 0, -90, 9460, null, now())`;

const INSERT_REQUEST = `insert into mercado_pago_settlement_report_requests
  (day, begin_date, end_date, requested_at, refused, recorded_at)
  values ($1, now(), now(), now(), false, null)`;

describe("the Mercado Pago settlement reports migration applied over a database that already holds data", {
  timeout: 30_000,
}, () => {
  it("keeps the existing register and starts with no request and no movement", async () => {
    const database = await databaseBefore();
    const migrated = await database.applyMigration();

    const { rows: registers } = await migrated.query("select name from registers");
    const { rows: requests } = await migrated.query(
      "select 1 from mercado_pago_settlement_report_requests",
    );
    const { rows: movements } = await migrated.query(
      "select 1 from mercado_pago_settlement_movements",
    );
    expect(registers).toEqual([{ name: "Caja 1" }]);
    expect(requests).toEqual([]);
    expect(movements).toEqual([]);
  });

  it("keeps one request per day", async () => {
    const migrated = await (await databaseBefore()).applyMigration();
    await migrated.query(INSERT_REQUEST, ["2026-10-09"]);
    await migrated.query(INSERT_REQUEST, ["2026-10-10"]);

    await expect(migrated.query(INSERT_REQUEST, ["2026-10-09"])).rejects.toThrow();
  });

  it("keeps the figures of a movement as signed cents", async () => {
    const migrated = await (await databaseBefore()).applyMigration();

    await migrated.query(INSERT_MOVEMENT, ["PAY1", "SETTLEMENT", "2026-10-09T12:00:00Z"]);

    const { rows } = await migrated.query(
      "select gross_amount, fee_amount, taxes_amount, net_amount from mercado_pago_settlement_movements",
    );
    expect(rows).toEqual([
      { gross_amount: 10000, fee_amount: -450, taxes_amount: -90, net_amount: 9460 },
    ]);
  });

  it("keeps a source's settlement and refund and refuses the same movement twice", async () => {
    const migrated = await (await databaseBefore()).applyMigration();
    await migrated.query(INSERT_MOVEMENT, ["PAY1", "SETTLEMENT", "2026-10-09T12:00:00Z"]);
    await migrated.query(INSERT_MOVEMENT, ["PAY1", "REFUND", "2026-10-09T12:00:00Z"]);
    await migrated.query(INSERT_MOVEMENT, ["PAY1", "REFUND", "2026-10-10T12:00:00Z"]);

    await expect(
      migrated.query(INSERT_MOVEMENT, ["PAY1", "REFUND", "2026-10-10T12:00:00Z"]),
    ).rejects.toThrow();
  });

  it("indexes the movements by their lowercased external reference", async () => {
    const migrated = await (await databaseBefore()).applyMigration();

    const { rows } = await migrated.query<{ indexdef: string }>(
      "select indexdef from pg_indexes where tablename = 'mercado_pago_settlement_movements'",
    );
    expect(rows.some((row) => row.indexdef.includes("lower(external_reference)"))).toBe(true);
  });
});
