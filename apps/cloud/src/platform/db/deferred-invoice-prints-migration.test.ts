import { describe, expect, it } from "vitest";
import { databaseBeforeMigration } from "./test-support/migration-under-test.js";

async function databaseBefore() {
  const database = await databaseBeforeMigration("_deferred_invoice_prints");
  const first = async (sql: string, params: unknown[] = []) => {
    const { rows } = await database.query<{ id: string }>(sql, params);
    return rows[0]?.id as string;
  };
  const locationId = await first("select id from locations limit 1");
  const registerId = await first(
    "insert into registers (location_id, name) values ($1, 'Caja 1') returning id",
    [locationId],
  );
  const deviceId = await first(
    `insert into register_installations
       (register_id, token_lookup_prefix, token_hash, token_issued_at, hostname, windows_version, enrolled_at)
     values ($1, 'prefix', 'hash', now(), 'CAJA', 'Windows 11', now()) returning id`,
    [registerId],
  );
  const sessionId = await first(
    `insert into cash_sessions (id, location_id, register_id, device_id, opened_by, opened_at, opening_float)
     values (gen_random_uuid(), $1, $2, $3, 'user-1', now(), 0) returning id`,
    [locationId, registerId, deviceId],
  );
  const userId = await first(
    "insert into users (first_name, email, location_id) values ('Ada', 'ada@example.com', $1) returning id",
    [locationId],
  );
  const saleId = await first(
    `insert into sales (id, location_id, register_id, device_id, session_id, actor_id, state, completed_at, total, applied_at, credit_note_print_attempted_at)
     values (gen_random_uuid(), $1, $2, $3, $4, $5, 'COMPLETED', now(), 2500, now(), '2026-10-06T11:21:00Z') returning id`,
    [locationId, registerId, deviceId, sessionId, userId],
  );
  await database.query(
    `insert into sale_reprints (sale_id, document, order_number, requested_by, authorized_by, reason_kind, reason_text, occurred_at)
     values ($1, 'sale_receipt', 1, $2, null, 'retry', null, now()), ($1, 'credit_note', 1, $2, null, 'retry', null, now())`,
    [saleId, userId],
  );
  return { database, saleId, userId };
}

describe("the deferred invoice prints migration applied over a database that already holds data", {
  timeout: 30_000,
}, () => {
  it("keeps the reprints and the print states a sale already has", async () => {
    const { database, saleId } = await databaseBefore();
    const migrated = await database.applyMigration();

    expect(
      (
        await migrated.query(
          "select sale_id, document, order_number from sale_reprints order by document",
        )
      ).rows,
    ).toEqual([
      { sale_id: saleId, document: "credit_note", order_number: 1 },
      { sale_id: saleId, document: "sale_receipt", order_number: 1 },
    ]);
    expect(
      (
        await migrated.query(
          "select deferred_invoice_print_attempted_at, deferred_invoice_printed_at, credit_note_print_attempted_at from sales",
        )
      ).rows,
    ).toEqual([
      {
        deferred_invoice_print_attempted_at: null,
        deferred_invoice_printed_at: null,
        credit_note_print_attempted_at: new Date("2026-10-06T11:21:00Z"),
      },
    ]);
  });

  it("numbers the reprints of the deferred invoice apart from the other documents'", async () => {
    const { database, saleId, userId } = await databaseBefore();
    const migrated = await database.applyMigration();
    const insert = (document: string, orderNumber: number) =>
      migrated.query(
        `insert into sale_reprints (sale_id, document, order_number, requested_by, reason_kind, occurred_at)
         values ($1, $2, $3, $4, 'retry', now())`,
        [saleId, document, orderNumber, userId],
      );

    await insert("deferred_invoice", 1);

    await expect(insert("deferred_invoice", 1)).rejects.toThrow(
      /sale_reprints_sale_id_document_order_number_pk/,
    );
    await expect(insert("invoice", 1)).rejects.toThrow(/sale_reprints_document_check/);
  });

  it("refuses a printed deferred invoice that was never attempted", async () => {
    const { database, saleId } = await databaseBefore();
    const migrated = await database.applyMigration();

    await expect(
      migrated.query("update sales set deferred_invoice_printed_at = now() where id = $1", [
        saleId,
      ]),
    ).rejects.toThrow(/sales_deferred_invoice_printed_only_after_attempted_check/);
  });

  it("lets the cloud application move the deferred invoice's print state forward, and nothing else of the sale", async () => {
    const { database, saleId } = await databaseBefore();
    const migrated = await database.applyMigration();

    await migrated.query("set role cloud_app");

    await migrated.query(
      "update sales set deferred_invoice_print_attempted_at = now(), deferred_invoice_printed_at = now() where id = $1",
      [saleId],
    );
    await expect(
      migrated.query("update sales set total = 1 where id = $1", [saleId]),
    ).rejects.toThrow(/permission denied/);
  });
});
