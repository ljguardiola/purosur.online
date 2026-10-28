import { describe, expect, it } from "vitest";
import { databaseBeforeMigration } from "./test-support/migration-under-test.js";

const FIRST_NOTE = "0197a3d5-7f10-7000-8000-000000000001";
const SECOND_NOTE = "0197a3d5-7f10-7000-8000-000000000002";
const VOID_NOTE = "0197a3d5-7f10-7000-8000-000000000003";
const RETURN_NOTE = "0197a3d5-7f10-7000-8000-000000000004";
const OFFLINE_VOID_NOTE = "0197a3d5-7f10-7000-8000-000000000005";

type Database = Awaited<ReturnType<typeof databaseBeforeMigration>>;

async function firstId(database: Database, sql: string, params: unknown[] = []) {
  const { rows } = await database.query<{ id: string }>(sql, params);
  return rows[0]?.id as string;
}

interface Place {
  locationId: string;
  registerId: string;
  deviceId: string;
  sessionId: string;
  userId: string;
}

async function aSale(
  database: Database,
  { locationId, registerId, deviceId, sessionId, userId }: Place,
) {
  return firstId(
    database,
    `insert into sales (id, location_id, register_id, device_id, session_id, actor_id, state, completed_at, total, applied_at)
     values (gen_random_uuid(), $1, $2, $3, $4, $5, 'COMPLETED', now(), 2500, now()) returning id`,
    [locationId, registerId, deviceId, sessionId, userId],
  );
}

function insertCreditNoteRequest(
  database: Database,
  {
    id,
    registerId,
    saleId,
    reason,
  }: { id: string; registerId: string; saleId: string; reason: string },
) {
  return database.query(
    `insert into credit_notes
       (id, register_id, sale_id, reason, point_of_sale, associated_voucher_type,
        associated_point_of_sale, associated_number, total, receiver_tax_status_code, return_id,
        issue_on, created_at)
     values ($1, $2, $3, $4, 7, 11, 31, 8, 2500, 5,
             case when $4 = 'sale_return' then gen_random_uuid() end,
             case when $4 = 'sale_return' then date '2026-10-07' end, now())`,
    [id, registerId, saleId, reason],
  );
}

function insertOfflineCreditNote(
  database: Database,
  {
    creditNoteId,
    registerId,
    saleId,
  }: { creditNoteId: string; registerId: string; saleId: string },
) {
  return database.query(
    `insert into offline_fiscal_documents
       (id, sale_id, register_id, point_of_sale, document_type, number, issued_on, generated_at,
        generation_stamp, offline_authorization_code, fortnight_start, fortnight_end,
        buyer_document_type, buyer_document_number, buyer_tax_status_code, total, net_amount,
        cause, recorded_at, credit_note_id, corrected_voucher_type, corrected_point_of_sale,
        corrected_number)
     values (gen_random_uuid(), $1, $2, 8, 'credit_note_c', 3, '2026-10-06', '2026-10-06T11:20:00Z',
             '20261006082000', '21403471111111', '2026-10-01', '2026-10-15', 99, 0, 5, 2500, 2500,
             'no_connectivity', '2026-10-06T15:00:00Z', $3, 11, 31, 8)`,
    [saleId, registerId, creditNoteId],
  );
}

function insertLegacyReprint(
  database: Database,
  { saleId, userId }: { saleId: string; userId: string },
  document: string,
  orderNumber: number,
) {
  return database.query(
    `insert into sale_reprints (sale_id, document, order_number, requested_by, authorized_by, reason_kind, reason_text, occurred_at)
     values ($1, $2, $3, $4, null, 'retry', null, now())`,
    [saleId, document, orderNumber, userId],
  );
}

async function databaseBefore() {
  const database = await databaseBeforeMigration("_reprints_by_credit_note");
  const locationId = await firstId(database, "select id from locations limit 1");
  const registerId = await firstId(
    database,
    "insert into registers (location_id, name) values ($1, 'Caja 1') returning id",
    [locationId],
  );
  const deviceId = await firstId(
    database,
    `insert into register_installations
       (register_id, token_lookup_prefix, token_hash, token_issued_at, hostname, windows_version, enrolled_at)
     values ($1, 'prefix', 'hash', now(), 'CAJA', 'Windows 11', now()) returning id`,
    [registerId],
  );
  const sessionId = await firstId(
    database,
    `insert into cash_sessions (id, location_id, register_id, device_id, opened_by, opened_at, opening_float)
     values (gen_random_uuid(), $1, $2, $3, 'user-1', now(), 0) returning id`,
    [locationId, registerId, deviceId],
  );
  const userId = await firstId(
    database,
    "insert into users (first_name, email, location_id) values ('Ada', 'ada@example.com', $1) returning id",
    [locationId],
  );
  const place: Place = { locationId, registerId, deviceId, sessionId, userId };
  const saleId = await aSale(database, place);
  await insertCreditNoteRequest(database, {
    id: VOID_NOTE,
    registerId,
    saleId,
    reason: "sale_void",
  });
  await insertCreditNoteRequest(database, {
    id: RETURN_NOTE,
    registerId,
    saleId,
    reason: "sale_return",
  });
  await database.query(
    `insert into sale_reprints (sale_id, document, order_number, requested_by, authorized_by, reason_kind, reason_text, occurred_at)
     values ($1, 'sale_receipt', 1, $2, null, 'retry', null, now()),
            ($1, 'credit_note', 1, $2, null, 'retry', null, now()),
            ($1, 'credit_note', 2, $2, $2, 'requested', 'El cliente la perdio', now())`,
    [saleId, userId],
  );
  return { database, place, saleId, userId };
}

describe("the reprints by credit note migration applied over a database that already holds data", {
  timeout: 30_000,
}, () => {
  it("keeps the reprints a sale already has, the credit note's as reprints of the sale's void credit note", async () => {
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
        credit_note_id: VOID_NOTE,
        order_number: 1,
        authorized_by: null,
        reason_text: null,
      },
      {
        sale_id: saleId,
        document: "credit_note",
        credit_note_id: VOID_NOTE,
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

  it("reads a credit note's reprint of a sale voided offline as a reprint of the void's credit note issued offline", async () => {
    const { database, place } = await databaseBefore();
    const saleId = await aSale(database, place);
    await insertOfflineCreditNote(database, {
      creditNoteId: OFFLINE_VOID_NOTE,
      registerId: place.registerId,
      saleId,
    });
    await insertLegacyReprint(database, { saleId, userId: place.userId }, "credit_note", 1);
    const migrated = await database.applyMigration();

    const { rows } = await migrated.query(
      "select credit_note_id from sale_reprints where sale_id = $1",
      [saleId],
    );
    expect(rows).toEqual([{ credit_note_id: OFFLINE_VOID_NOTE }]);
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

  it("refuses a reprint of a credit note that names no credit note", async () => {
    const { database, saleId, userId } = await databaseBefore();
    const migrated = await database.applyMigration();

    await expect(
      migrated.query(
        `insert into sale_reprints (sale_id, document, order_number, requested_by, reason_kind, occurred_at)
         values ($1, 'credit_note', 3, $2, 'retry', now())`,
        [saleId, userId],
      ),
    ).rejects.toThrow(/sale_reprints_credit_note_id_check/);
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
    ).rejects.toThrow(/sale_reprints_credit_note_id_check/);
  });
});
