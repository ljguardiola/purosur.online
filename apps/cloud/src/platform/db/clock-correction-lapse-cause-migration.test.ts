import { describe, expect, it } from "vitest";
import {
  databaseBeforeMigration,
  type SqlOnlyDatabase,
} from "./test-support/migration-under-test.js";

async function aRegister(client: SqlOnlyDatabase) {
  const { rows } = await client.query<{ id: string }>(
    `insert into registers (location_id, name)
     select id, 'Caja 1' from locations limit 1 returning id`,
  );
  return rows[0]?.id as string;
}

function insertDocument(
  client: SqlOnlyDatabase,
  registerId: string,
  { number, cause }: { number: number; cause: string },
) {
  return client.query(
    `insert into offline_fiscal_documents
             (id, sale_id, register_id, point_of_sale, document_type, number, issued_on,
              generated_at, generation_stamp, offline_authorization_code, fortnight_start,
              fortnight_end, buyer_document_type, buyer_document_number, buyer_tax_status_code,
              total, net_amount, cause, recorded_at)
           values (gen_random_uuid(), gen_random_uuid(), $1, 7, 'factura_c', $2, '2026-10-06',
                   '2026-10-06T11:20:00Z', '20261006082000', '21403471111111', '2026-10-01',
                   '2026-10-15', 99, 0, 5, 4800, 4800, $3, '2026-10-06T15:00:00Z')`,
    [registerId, number, cause],
  );
}

describe("the clock-correction-lapse cause migration applied over a database that already holds data", {
  timeout: 30_000,
}, () => {
  it("keeps the documents issued offline for each earlier cause", async () => {
    const database = await databaseBeforeMigration("_clock_correction_lapse_cause");
    const registerId = await aRegister(database);
    for (const [index, cause] of [
      "no_connectivity",
      "unclear_outcome",
      "numbering_conflict",
    ].entries()) {
      await insertDocument(database, registerId, { number: index + 1, cause });
    }

    const migrated = await database.applyMigration();

    const { rows } = await migrated.query(
      "select cause from offline_fiscal_documents order by number",
    );
    expect(rows).toEqual([
      { cause: "no_connectivity" },
      { cause: "unclear_outcome" },
      { cause: "numbering_conflict" },
    ]);
  });

  it("accepts a document issued offline during the lapse after a clock correction", async () => {
    const migrated = await (
      await databaseBeforeMigration("_clock_correction_lapse_cause")
    ).applyMigration();
    const registerId = await aRegister(migrated);

    await insertDocument(migrated, registerId, { number: 1, cause: "clock_correction_lapse" });

    const { rows } = await migrated.query("select cause from offline_fiscal_documents");
    expect(rows).toEqual([{ cause: "clock_correction_lapse" }]);
  });

  it("refuses a cause other than the known ones", async () => {
    const migrated = await (
      await databaseBeforeMigration("_clock_correction_lapse_cause")
    ).applyMigration();
    const registerId = await aRegister(migrated);

    await expect(
      insertDocument(migrated, registerId, { number: 1, cause: "boredom" }),
    ).rejects.toThrow();
  });
});
