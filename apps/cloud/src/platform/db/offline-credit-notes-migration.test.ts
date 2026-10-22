import { describe, expect, it } from "vitest";
import {
  databaseBeforeMigration,
  type SqlOnlyDatabase,
} from "./test-support/migration-under-test.js";

const TAG = "_offline_credit_notes";

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
  await client.query(
    `with kept as (
       insert into caea_codes
         (fortnight_start, fortnight_end, code, report_deadline, obtained_at, obtained_through)
       values ('2026-10-01', '2026-10-15', '36123456789012', '2026-10-20',
               '2026-09-28T12:00:00Z', 'requested')
       returning id
     )
     insert into changes (entity, entity_id, version, op)
     select 'offline_authorization_code', id, 1, 'insert' from kept`,
  );
  return registerId;
}

interface DocumentValues {
  saleId?: string;
  documentType?: string;
  number?: number;
  creditNoteId?: string | null;
  corrected?: { type: number; pointOfSale: number; number: number } | null;
}

function insertDocument(
  client: SqlOnlyDatabase,
  registerId: string,
  {
    saleId,
    documentType = "factura_c",
    number = 1,
    creditNoteId = null,
    corrected = null,
  }: DocumentValues = {},
) {
  return client.query(
    `insert into offline_fiscal_documents
       (id, sale_id, register_id, point_of_sale, document_type, number, issued_on,
        generated_at, generation_stamp, offline_authorization_code, fortnight_start,
        fortnight_end, buyer_document_type, buyer_document_number, buyer_tax_status_code,
        total, net_amount, cause, recorded_at, credit_note_id, corrected_voucher_type,
        corrected_point_of_sale, corrected_number)
     values (gen_random_uuid(), coalesce($2::uuid, gen_random_uuid()), $1, 7, $3, $4, '2026-10-06',
             '2026-10-06T11:20:00Z', '20261006082000', '21403471111111', '2026-10-01',
             '2026-10-15', 99, 0, 5, 4800, 4800, 'no_connectivity', '2026-10-06T15:00:00Z',
             $5::uuid, $6::int, $7::int, $8::int)`,
    [
      registerId,
      saleId ?? null,
      documentType,
      number,
      creditNoteId,
      corrected?.type ?? null,
      corrected?.pointOfSale ?? null,
      corrected?.number ?? null,
    ],
  );
}

const SALE = "0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f";
const NOTE = "1a1a1a1a-1a1a-4a1a-8a1a-1a1a1a1a1a1a";
const CORRECTS = { type: 11, pointOfSale: 7, number: 1 };

async function migrated() {
  const database = await databaseBeforeMigration(TAG);
  const registerId = await seedRegisterAndClaim(database);
  await insertDocument(database, registerId, { saleId: SALE, number: 1 });
  const after = await database.applyMigration();
  return { database: after, registerId };
}

describe("the offline credit notes migration applied over a database that already holds data", {
  timeout: 30_000,
}, () => {
  it("keeps the documents already issued offline as facturas with no credit note data", async () => {
    const { database } = await migrated();

    const { rows } = await database.query(
      `select document_type, number, credit_note_id, corrected_voucher_type,
              corrected_point_of_sale, corrected_number
       from offline_fiscal_documents`,
    );

    expect(rows).toEqual([
      {
        document_type: "factura_c",
        number: 1,
        credit_note_id: null,
        corrected_voucher_type: null,
        corrected_point_of_sale: null,
        corrected_number: null,
      },
    ]);
  });

  it("holds a credit note C beside the factura of its sale, naming the voucher it corrects", async () => {
    const { database, registerId } = await migrated();

    await insertDocument(database, registerId, {
      saleId: SALE,
      documentType: "credit_note_c",
      number: 1,
      creditNoteId: NOTE,
      corrected: CORRECTS,
    });

    const { rows } = await database.query(
      "select document_type from offline_fiscal_documents order by document_type",
    );
    expect(rows).toEqual([{ document_type: "credit_note_c" }, { document_type: "factura_c" }]);
  });

  it("holds one document of each type per sale", async () => {
    const { database, registerId } = await migrated();
    await insertDocument(database, registerId, {
      saleId: SALE,
      documentType: "credit_note_c",
      number: 1,
      creditNoteId: NOTE,
      corrected: CORRECTS,
    });

    await expect(
      insertDocument(database, registerId, {
        saleId: SALE,
        documentType: "credit_note_c",
        number: 2,
        creditNoteId: "2b2b2b2b-2b2b-4b2b-8b2b-2b2b2b2b2b2b",
        corrected: { ...CORRECTS, number: 2 },
      }),
    ).rejects.toThrow();
    await expect(
      insertDocument(database, registerId, { saleId: SALE, number: 2 }),
    ).rejects.toThrow();
  });

  it("numbers a credit note C in a series of its own", async () => {
    const { database, registerId } = await migrated();

    await insertDocument(database, registerId, {
      documentType: "credit_note_c",
      number: 1,
      creditNoteId: NOTE,
      corrected: CORRECTS,
    });

    await expect(
      insertDocument(database, registerId, {
        documentType: "credit_note_c",
        number: 1,
        creditNoteId: "2b2b2b2b-2b2b-4b2b-8b2b-2b2b2b2b2b2b",
        corrected: { ...CORRECTS, number: 2 },
      }),
    ).rejects.toThrow();
  });

  it("keeps a second credit note C that corrects the same voucher, so the series of numbers stays whole", async () => {
    const { database, registerId } = await migrated();
    await insertDocument(database, registerId, {
      documentType: "credit_note_c",
      number: 1,
      creditNoteId: NOTE,
      corrected: CORRECTS,
    });

    await insertDocument(database, registerId, {
      documentType: "credit_note_c",
      number: 2,
      creditNoteId: "2b2b2b2b-2b2b-4b2b-8b2b-2b2b2b2b2b2b",
      corrected: CORRECTS,
    });

    const { rows } = await database.query(
      "select number from offline_fiscal_documents where document_type = 'credit_note_c' order by number",
    );
    expect(rows).toEqual([{ number: 1 }, { number: 2 }]);
  });

  it.each([
    ["without its credit note id", { creditNoteId: null, corrected: CORRECTS }],
    ["without the voucher it corrects", { creditNoteId: NOTE, corrected: null }],
  ])("refuses a credit note C %s", async (_case, values) => {
    const { database, registerId } = await migrated();

    await expect(
      insertDocument(database, registerId, {
        documentType: "credit_note_c",
        number: 5,
        ...values,
      }),
    ).rejects.toThrow(/offline_fiscal_documents_credit_note_data/);
  });

  it("refuses a factura that names a voucher it corrects", async () => {
    const { database, registerId } = await migrated();

    await expect(
      insertDocument(database, registerId, { number: 5, creditNoteId: NOTE, corrected: CORRECTS }),
    ).rejects.toThrow(/offline_fiscal_documents_credit_note_data/);
  });

  it("refuses a document type other than a factura C or a credit note C", async () => {
    const { database, registerId } = await migrated();

    await expect(
      insertDocument(database, registerId, { documentType: "factura_a", number: 5 }),
    ).rejects.toThrow(/offline_fiscal_documents_document_type_known/);
  });

  it("lets a number block and a fortnight document report belong to the credit note series", async () => {
    const { database, registerId } = await migrated();

    await database.query(
      `insert into offline_number_blocks
         (point_of_sale_number, document_type, register_id, first_number, last_number, status, assigned_at, version)
       values (7, 'credit_note_c', $1, 1, 1000, 'in_use', '2026-10-01T12:00:00Z', 1)`,
      [registerId],
    );
    await database.query(
      `insert into fortnight_reports
         (point_of_sale_number, fortnight_start, fortnight_end, state, recorded_at)
       values (7, '2026-10-01', '2026-10-15', 'accepted', '2026-10-16T12:00:00Z')`,
    );
    await database.query(
      `insert into fortnight_document_reports
         (point_of_sale_number, fortnight_start, fortnight_end, document_type, state, reported_through, recorded_at)
       values (7, '2026-10-01', '2026-10-15', 'credit_note_c', 'accepted', 3, '2026-10-16T12:00:00Z')`,
    );

    await expect(
      database.query(
        `insert into offline_number_blocks
           (point_of_sale_number, document_type, register_id, first_number, last_number, status, assigned_at, version)
         values (7, 'nota_a', $1, 1, 1000, 'in_use', '2026-10-01T12:00:00Z', 1)`,
        [registerId],
      ),
    ).rejects.toThrow(/offline_number_blocks_document_type_known/);
    await expect(
      database.query(
        `insert into fortnight_document_reports
           (point_of_sale_number, fortnight_start, fortnight_end, document_type, state, reported_through, recorded_at)
         values (7, '2026-10-01', '2026-10-15', 'nota_a', 'accepted', 3, '2026-10-16T12:00:00Z')`,
      ),
    ).rejects.toThrow(/fortnight_document_reports_document_type_known/);
  });
});
