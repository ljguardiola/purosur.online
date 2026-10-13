import { describe, expect, it } from "vitest";
import { databaseBeforeMigration } from "./test-support/migration-under-test.js";

const INSERT_REQUEST = `insert into fiscal_requests
  (fiscal_document_id, register_id, sale_id, point_of_sale, number, issued_on, total,
   buyer_tax_status_code, sale_event, received_at, not_after, answer_kind, rejection_codes,
   answered_at)
  values (gen_random_uuid(), $1, gen_random_uuid(), 3, $2, '2026-10-06', 1500, 5, '{}'::jsonb,
          now(), now(), $3, $4, $5)`;

async function databaseBefore() {
  const database = await databaseBeforeMigration("_fiscal_rejection_class");
  const { rows } = await database.query<{ id: string }>(
    "insert into registers (location_id, name) select id, 'Caja 1' from locations limit 1 returning id",
  );
  const registerId = rows[0]?.id;
  return { database, registerId };
}

describe("the fiscal-rejection-class migration applied over a database that already holds data", {
  timeout: 30_000,
}, () => {
  it("keeps a request that was answered unclear, with no rejection class", async () => {
    const { database, registerId } = await databaseBefore();
    await database.query(INSERT_REQUEST, [registerId, 1, "unclear", null, new Date()]);

    const migrated = await database.applyMigration();

    const { rows } = await migrated.query(
      "select answer_kind, rejection_class from fiscal_requests",
    );
    expect(rows).toEqual([{ answer_kind: "unclear", rejection_class: null }]);
  });

  it.each(["content", "standing"])(
    "accepts a rejected answer of class %s",
    async (rejectionClass) => {
      const { database, registerId } = await databaseBefore();
      const migrated = await database.applyMigration();

      await migrated.query(
        "insert into fiscal_requests (fiscal_document_id, register_id, sale_id, point_of_sale, number, issued_on, total, buyer_tax_status_code, sale_event, received_at, not_after, answer_kind, rejection_codes, rejection_class, answered_at) values (gen_random_uuid(), $1, gen_random_uuid(), 3, 1, '2026-10-06', 1500, 5, '{}'::jsonb, now(), now(), 'rejected', '{10015}', $2, now())",
        [registerId, rejectionClass],
      );

      const { rows } = await migrated.query("select rejection_class from fiscal_requests");
      expect(rows).toEqual([{ rejection_class: rejectionClass }]);
    },
  );

  it("refuses a rejected answer without its class", async () => {
    const { database, registerId } = await databaseBefore();
    const migrated = await database.applyMigration();

    await expect(
      migrated.query(INSERT_REQUEST, [registerId, 1, "rejected", [10015], new Date()]),
    ).rejects.toThrow();
  });

  it("refuses a class on an answer that is not a rejection", async () => {
    const { database, registerId } = await databaseBefore();
    const migrated = await database.applyMigration();

    await expect(
      migrated.query(
        "insert into fiscal_requests (fiscal_document_id, register_id, sale_id, point_of_sale, number, issued_on, total, buyer_tax_status_code, sale_event, received_at, not_after, answer_kind, rejection_class, answered_at) values (gen_random_uuid(), $1, gen_random_uuid(), 3, 1, '2026-10-06', 1500, 5, '{}'::jsonb, now(), now(), 'unclear', 'content', now())",
        [registerId],
      ),
    ).rejects.toThrow();
  });

  it("refuses a class nobody knows", async () => {
    const { database, registerId } = await databaseBefore();
    const migrated = await database.applyMigration();

    await expect(
      migrated.query(
        "insert into fiscal_requests (fiscal_document_id, register_id, sale_id, point_of_sale, number, issued_on, total, buyer_tax_status_code, sale_event, received_at, not_after, answer_kind, rejection_codes, rejection_class, answered_at) values (gen_random_uuid(), $1, gen_random_uuid(), 3, 1, '2026-10-06', 1500, 5, '{}'::jsonb, now(), now(), 'rejected', '{10015}', 'transport', now())",
        [registerId],
      ),
    ).rejects.toThrow();
  });
});
