import { describe, expect, it } from "vitest";
import { databaseBeforeMigration } from "./test-support/migration-under-test.js";

async function databaseBefore() {
  const database = await databaseBeforeMigration("_credit_note_reprints");
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
    `insert into sales (id, location_id, register_id, device_id, session_id, actor_id, state, completed_at, total, applied_at)
     values (gen_random_uuid(), $1, $2, $3, $4, $5, 'COMPLETED', now(), 2500, now()) returning id`,
    [locationId, registerId, deviceId, sessionId, userId],
  );
  await database.query(
    `insert into sale_reprints (sale_id, order_number, requested_by, authorized_by, reason_kind, reason_text, occurred_at)
     values ($1, 1, $2, null, 'retry', null, now()), ($1, 2, $2, $2, 'requested', 'El cliente la perdio', now())`,
    [saleId, userId],
  );
  return { database, saleId, userId };
}

describe("the credit note reprints migration applied over a database that already holds data", {
  timeout: 30_000,
}, () => {
  it("keeps the reprints a sale already has as reprints of its receipt", async () => {
    const { database, saleId, userId } = await databaseBefore();
    const migrated = await database.applyMigration();

    const { rows } = await migrated.query(
      "select sale_id, document, order_number, authorized_by, reason_text from sale_reprints order by order_number",
    );
    expect(rows).toEqual([
      {
        sale_id: saleId,
        document: "sale_receipt",
        order_number: 1,
        authorized_by: null,
        reason_text: null,
      },
      {
        sale_id: saleId,
        document: "sale_receipt",
        order_number: 2,
        authorized_by: userId,
        reason_text: "El cliente la perdio",
      },
    ]);
  });

  it("numbers the reprints of the credit note apart from the receipt's, per sale", async () => {
    const { database, saleId, userId } = await databaseBefore();
    const migrated = await database.applyMigration();
    const insert = (document: string, orderNumber: number) =>
      migrated.query(
        `insert into sale_reprints (sale_id, document, order_number, requested_by, reason_kind, occurred_at)
         values ($1, $2, $3, $4, 'retry', now())`,
        [saleId, document, orderNumber, userId],
      );

    await insert("credit_note", 1);

    await expect(insert("credit_note", 1)).rejects.toThrow(/sale_reprints_sale_id_document_order_number_pk/);
    await expect(insert("sale_receipt", 2)).rejects.toThrow(/sale_reprints_sale_id_document_order_number_pk/);
    await expect(insert("invoice", 1)).rejects.toThrow(/sale_reprints_document_check/);
    await expect(insert("credit_note", 0)).rejects.toThrow(/sale_reprints_order_number_positive_check/);
  });

  it("holds the print state of a sale's credit note, none printed for the sales it already has", async () => {
    const { database, saleId } = await databaseBefore();
    const migrated = await database.applyMigration();

    expect(
      (
        await migrated.query(
          "select credit_note_print_attempted_at, credit_note_printed_at from sales",
        )
      ).rows,
    ).toEqual([{ credit_note_print_attempted_at: null, credit_note_printed_at: null }]);

    await migrated.query(
      `update sales set credit_note_print_attempted_at = '2026-10-06T11:21:00Z', credit_note_printed_at = '2026-10-06T11:21:05Z' where id = $1`,
      [saleId],
    );
  });

  it("refuses a printed credit note that was never attempted", async () => {
    const { database, saleId } = await databaseBefore();
    const migrated = await database.applyMigration();

    await expect(
      migrated.query("update sales set credit_note_printed_at = now() where id = $1", [saleId]),
    ).rejects.toThrow(/sales_credit_note_printed_only_after_attempted_check/);
  });

  it("lets the cloud application move the credit note's print state forward, and nothing else of the sale", async () => {
    const { database, saleId } = await databaseBefore();
    const migrated = await database.applyMigration();

    await migrated.query("set role cloud_app");

    await migrated.query(
      "update sales set credit_note_print_attempted_at = now(), credit_note_printed_at = now() where id = $1",
      [saleId],
    );
    await expect(
      migrated.query("update sales set total = 1 where id = $1", [saleId]),
    ).rejects.toThrow(/permission denied/);
  });
});
