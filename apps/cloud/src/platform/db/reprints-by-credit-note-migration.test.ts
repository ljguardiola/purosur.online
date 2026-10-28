import { describe, expect, it } from "vitest";
import { databaseBeforeMigration } from "./test-support/migration-under-test.js";

const FIRST_NOTE = "0197a3d5-7f10-7000-8000-000000000001";
const SECOND_NOTE = "0197a3d5-7f10-7000-8000-000000000002";

async function databaseBefore() {
  const database = await databaseBeforeMigration("_reprints_by_credit_note");
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
    `insert into sale_reprints (sale_id, document, order_number, requested_by, authorized_by, reason_kind, reason_text, occurred_at)
     values ($1, 'sale_receipt', 1, $2, null, 'retry', null, now()),
            ($1, 'credit_note', 1, $2, null, 'retry', null, now()),
            ($1, 'credit_note', 2, $2, $2, 'requested', 'El cliente la perdio', now())`,
    [saleId, userId],
  );
  return { database, saleId, userId };
}

describe("the reprints by credit note migration applied over a database that already holds data", {
  timeout: 30_000,
}, () => {
  it("keeps the reprints a sale already has, the credit note's naming no credit note", async () => {
    const { database, saleId, userId } = await databaseBefore();
    const migrated = await database.applyMigration();

    const { rows } = await migrated.query(
      `select sale_id, document, credit_note_id, order_number, authorized_by, reason_text
       from sale_reprints order by document, order_number`,
    );
    expect(rows).toEqual([
      {
        sale_id: saleId,
        document: "credit_note",
        credit_note_id: null,
        order_number: 1,
        authorized_by: null,
        reason_text: null,
      },
      {
        sale_id: saleId,
        document: "credit_note",
        credit_note_id: null,
        order_number: 2,
        authorized_by: userId,
        reason_text: "El cliente la perdio",
      },
      {
        sale_id: saleId,
        document: "sale_receipt",
        credit_note_id: null,
        order_number: 1,
        authorized_by: null,
        reason_text: null,
      },
    ]);
  });

  it("numbers the reprints of each credit note of a sale apart", async () => {
    const { database, saleId, userId } = await databaseBefore();
    const migrated = await database.applyMigration();
    const insert = (document: string, creditNoteId: string | null, orderNumber: number) =>
      migrated.query(
        `insert into sale_reprints (sale_id, document, credit_note_id, order_number, requested_by, reason_kind, occurred_at)
         values ($1, $2, $3, $4, $5, 'retry', now())`,
        [saleId, document, creditNoteId, orderNumber, userId],
      );

    await insert("credit_note", FIRST_NOTE, 1);
    await insert("credit_note", SECOND_NOTE, 1);

    await expect(insert("credit_note", FIRST_NOTE, 1)).rejects.toThrow(
      /sale_reprints_once_per_order/,
    );
    await expect(insert("credit_note", null, 1)).rejects.toThrow(/sale_reprints_once_per_order/);
    await expect(insert("credit_note", SECOND_NOTE, 2)).resolves.toBeDefined();
  });

  it("still holds the reprints of the other documents once per order number", async () => {
    const { database, saleId, userId } = await databaseBefore();
    const migrated = await database.applyMigration();
    const insert = (document: string, orderNumber: number) =>
      migrated.query(
        `insert into sale_reprints (sale_id, document, order_number, requested_by, reason_kind, occurred_at)
         values ($1, $2, $3, $4, 'retry', now())`,
        [saleId, document, orderNumber, userId],
      );

    await expect(insert("sale_receipt", 1)).rejects.toThrow(/sale_reprints_once_per_order/);
    await insert("sale_receipt", 2);
    await insert("deferred_invoice", 1);
    await expect(insert("deferred_invoice", 1)).rejects.toThrow(/sale_reprints_once_per_order/);
    await expect(insert("invoice", 1)).rejects.toThrow(/sale_reprints_document_check/);
    await expect(insert("sale_receipt", 0)).rejects.toThrow(
      /sale_reprints_order_number_positive_check/,
    );
  });

  it("refuses a credit note's id on a reprint of any other document", async () => {
    const { database, saleId, userId } = await databaseBefore();
    const migrated = await database.applyMigration();

    await expect(
      migrated.query(
        `insert into sale_reprints (sale_id, document, credit_note_id, order_number, requested_by, reason_kind, occurred_at)
         values ($1, 'deferred_invoice', $2, 1, $3, 'retry', now())`,
        [saleId, FIRST_NOTE, userId],
      ),
    ).rejects.toThrow(/sale_reprints_credit_note_id_only_for_credit_note_check/);
  });
});
