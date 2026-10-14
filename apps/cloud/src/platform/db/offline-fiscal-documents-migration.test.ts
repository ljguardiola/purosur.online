import { describe, expect, it } from "vitest";
import {
  databaseBeforeMigration,
  type SqlOnlyDatabase,
} from "./test-support/migration-under-test.js";

async function migratedDatabase() {
  const database = await databaseBeforeMigration("_offline_fiscal_documents");
  await database.query(
    `insert into fiscal_addresses (name, street_address) values ('Deposito', 'Calle Ficticia 123')`,
  );
  return database.applyMigration();
}

async function aRegister(client: SqlOnlyDatabase) {
  const { rows } = await client.query<{ id: string }>(
    `insert into registers (location_id, name)
     select id, 'Caja 1' from locations limit 1 returning id`,
  );
  return rows[0]?.id as string;
}

function insertDocument(
  registerId: string,
  overrides: { number?: number; saleId?: string; documentType?: string; cause?: string } = {},
) {
  return {
    text: `insert into offline_fiscal_documents
             (id, sale_id, register_id, point_of_sale, document_type, number, issued_on,
              generated_at, generation_stamp, offline_authorization_code, fortnight_start,
              fortnight_end, buyer_document_type, buyer_document_number, buyer_tax_status_code,
              total, net_amount, cause, recorded_at)
           values (gen_random_uuid(), $1, $2, 7, $3, $4, '2026-10-06', '2026-10-06T11:20:00Z',
                   '20261006082000', '21403471111111', '2026-10-01', '2026-10-15', 99, 0, 5,
                   4800, 4800, $5, '2026-10-06T15:00:00Z')`,
    values: [
      overrides.saleId ?? crypto.randomUUID(),
      registerId,
      overrides.documentType ?? "factura_c",
      overrides.number ?? 12,
      overrides.cause ?? "no_connectivity",
    ],
  };
}

describe("the offline fiscal documents migration applied over a database that already holds data", {
  timeout: 30_000,
}, () => {
  it("keeps the existing data and accepts a document of each cause", async () => {
    const client = await migratedDatabase();
    const registerId = await aRegister(client);

    for (const [index, cause] of [
      "no_connectivity",
      "unclear_outcome",
      "numbering_conflict",
    ].entries()) {
      await client.query(insertDocument(registerId, { number: index + 1, cause }));
    }

    const { rows: documents } = await client.query(
      "select cause from offline_fiscal_documents order by number",
    );
    const { rows: addresses } = await client.query("select name from fiscal_addresses");
    expect(documents).toEqual([
      { cause: "no_connectivity" },
      { cause: "unclear_outcome" },
      { cause: "numbering_conflict" },
    ]);
    expect(addresses).toEqual([{ name: "Deposito" }]);
  });

  it("refuses a cause other than the known ones", async () => {
    const client = await migratedDatabase();
    const registerId = await aRegister(client);

    await expect(client.query(insertDocument(registerId, { cause: "boredom" }))).rejects.toThrow();
  });

  it("refuses a document type other than factura C", async () => {
    const client = await migratedDatabase();
    const registerId = await aRegister(client);

    await expect(
      client.query(insertDocument(registerId, { documentType: "factura_a" })),
    ).rejects.toThrow();
  });

  it("refuses a second document under the same number of a point of sale", async () => {
    const client = await migratedDatabase();
    const registerId = await aRegister(client);
    await client.query(insertDocument(registerId));

    await expect(client.query(insertDocument(registerId))).rejects.toThrow();
  });

  it("refuses a second document for the same sale", async () => {
    const client = await migratedDatabase();
    const registerId = await aRegister(client);
    const saleId = crypto.randomUUID();
    await client.query(insertDocument(registerId, { saleId }));

    await expect(
      client.query(insertDocument(registerId, { saleId, number: 13 })),
    ).rejects.toThrow();
  });

  it("refuses a generation stamp that is not fourteen digits", async () => {
    const client = await migratedDatabase();
    const registerId = await aRegister(client);

    await expect(
      client.query({
        ...insertDocument(registerId),
        text: insertDocument(registerId).text.replace("'20261006082000'", "'2026-10-06'"),
      }),
    ).rejects.toThrow();
  });

  it("refuses the app role to change or remove a document", async () => {
    const client = await migratedDatabase();

    const { rows } = await client.query(
      `select has_table_privilege('cloud_app', 'offline_fiscal_documents', 'UPDATE') as can_update,
              has_table_privilege('cloud_app', 'offline_fiscal_documents', 'DELETE') as can_delete,
              has_table_privilege('cloud_app', 'offline_fiscal_documents', 'TRUNCATE') as can_truncate,
              has_table_privilege('cloud_app', 'offline_fiscal_documents', 'INSERT') as can_insert`,
    );

    expect(rows).toEqual([
      { can_update: false, can_delete: false, can_truncate: false, can_insert: true },
    ]);
  });
});
