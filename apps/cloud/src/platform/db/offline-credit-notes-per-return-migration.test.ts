import { describe, expect, it } from "vitest";
import {
  databaseBeforeMigration,
  type SqlOnlyDatabase,
} from "./test-support/migration-under-test.js";

const TAG = "_offline_credit_notes_per_return";

const SALE = "0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f";
const ANOTHER_SALE = "3c3c3c3c-3c3c-4c3c-8c3c-3c3c3c3c3c3c";
const NOTE = "1a1a1a1a-1a1a-4a1a-8a1a-1a1a1a1a1a1a";
const SECOND_NOTE = "2b2b2b2b-2b2b-4b2b-8b2b-2b2b2b2b2b2b";

async function seedRegisterAndClaim(client: SqlOnlyDatabase) {
  const { rows } = await client.query<{ id: string }>(
    `insert into registers (location_id, name)
     select id, 'Caja 1' from locations limit 1 returning id`,
  );
  const registerId = rows[0]?.id as string;
  await client.query(
    `insert into users (first_name, email, location_id)
     select 'Ada Lucero', 'ada@example.com', id from locations limit 1`,
  );
  await client.query(
    `insert into point_of_sale_claims (point_of_sale_number, register_id, mechanism, claimed_by)
     select 7, $1::uuid, 'offline', users.id from users`,
    [registerId],
  );
  return registerId;
}

interface DocumentValues {
  saleId: string;
  number: number;
  creditNoteId?: string | null;
}

function insertDocument(
  client: SqlOnlyDatabase,
  registerId: string,
  { saleId, number, creditNoteId = null }: DocumentValues,
) {
  const corrected = creditNoteId === null ? null : 11;
  return client.query(
    `insert into offline_fiscal_documents
       (id, sale_id, register_id, point_of_sale, document_type, number, issued_on,
        generated_at, generation_stamp, offline_authorization_code, fortnight_start,
        fortnight_end, buyer_document_type, buyer_document_number, buyer_tax_status_code,
        total, net_amount, cause, recorded_at, credit_note_id, corrected_voucher_type,
        corrected_point_of_sale, corrected_number)
     values (gen_random_uuid(), $2::uuid, $1, 7, $3, $4, '2026-10-06',
             '2026-10-06T11:20:00Z', '20261006082000', '21403471111111', '2026-10-01',
             '2026-10-15', 99, 0, 5, 2400, 2400, 'no_connectivity', '2026-10-06T15:00:00Z',
             $5::uuid, $6::int, $7::int, $8::int)`,
    [
      registerId,
      saleId,
      creditNoteId === null ? "factura_c" : "credit_note_c",
      number,
      creditNoteId,
      corrected,
      corrected === null ? null : 7,
      corrected === null ? null : 1,
    ],
  );
}

async function migrated() {
  const database = await databaseBeforeMigration(TAG);
  const registerId = await seedRegisterAndClaim(database);
  await insertDocument(database, registerId, { saleId: SALE, number: 1 });
  await insertDocument(database, registerId, { saleId: SALE, number: 1, creditNoteId: NOTE });
  const after = await database.applyMigration();
  return { database: after, registerId };
}

describe("the offline credit notes per return migration applied over a database that already holds data", {
  timeout: 30_000,
}, () => {
  it("keeps the factura and the credit note already issued offline", async () => {
    const { database } = await migrated();

    const { rows } = await database.query(
      "select document_type, number, credit_note_id from offline_fiscal_documents order by document_type",
    );

    expect(rows).toEqual([
      { document_type: "credit_note_c", number: 1, credit_note_id: NOTE },
      { document_type: "factura_c", number: 1, credit_note_id: null },
    ]);
  });

  it("holds a second credit note of the same sale", async () => {
    const { database, registerId } = await migrated();

    await insertDocument(database, registerId, {
      saleId: SALE,
      number: 2,
      creditNoteId: SECOND_NOTE,
    });

    const { rows } = await database.query(
      "select credit_note_id from offline_fiscal_documents where document_type = 'credit_note_c' order by number",
    );
    expect(rows).toEqual([{ credit_note_id: NOTE }, { credit_note_id: SECOND_NOTE }]);
  });

  it("still holds one factura per sale", async () => {
    const { database, registerId } = await migrated();

    await expect(insertDocument(database, registerId, { saleId: SALE, number: 2 })).rejects.toThrow(
      /offline_fiscal_documents_one_invoice_per_sale/,
    );
  });

  it("holds each credit note once", async () => {
    const { database, registerId } = await migrated();

    await expect(
      insertDocument(database, registerId, { saleId: ANOTHER_SALE, number: 2, creditNoteId: NOTE }),
    ).rejects.toThrow(/offline_fiscal_documents_credit_note_key/);
  });
});
