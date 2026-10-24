import { describe, expect, it } from "vitest";
import { databaseBeforeMigration } from "./test-support/migration-under-test.js";

const INSERT_TASK = `insert into fiscal_tasks
  (id, kind, register_id, point_of_sale, document_type, number, reason, state, created_at,
   closed_at)
  values (gen_random_uuid(), 'external_invoicing', $1, 7, 'factura_c', $2,
          '{"issuedOn":"2026-01-02","total":12500,"authorizationCode":"75123456789012"}'::jsonb,
          $3, '2026-01-05T09:00:00.000Z', $4)`;

async function databaseBefore() {
  const database = await databaseBeforeMigration("_fiscal_task_closing_record");
  const { rows } = await database.query<{ id: string }>(
    "insert into registers (location_id, name) select id, 'Caja 1' from locations limit 1 returning id",
  );
  return { database, registerId: rows[0]?.id };
}

describe("the fiscal-task-closing-record migration applied over a database that already holds data", {
  timeout: 30_000,
}, () => {
  it("keeps an open task and a task closed on its own, with nobody who closed them and no note", async () => {
    const { database, registerId } = await databaseBefore();
    await database.query(INSERT_TASK, [registerId, 1, "open", null]);
    await database.query(INSERT_TASK, [registerId, 2, "closed", "2026-01-06T10:00:00.000Z"]);

    const migrated = await database.applyMigration();

    const { rows } = await migrated.query(
      "select number, state, closed_at, closed_by, closing_note from fiscal_tasks order by number",
    );
    expect(rows).toEqual([
      { number: 1, state: "open", closed_at: null, closed_by: null, closing_note: null },
      {
        number: 2,
        state: "closed",
        closed_at: new Date("2026-01-06T10:00:00.000Z"),
        closed_by: null,
        closing_note: null,
      },
    ]);
  });
});
