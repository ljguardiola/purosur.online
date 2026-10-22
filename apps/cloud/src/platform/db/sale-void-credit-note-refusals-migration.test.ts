import { describe, expect, it } from "vitest";
import { databaseBeforeMigration } from "./test-support/migration-under-test.js";

const CREDIT_NOTE_ID = "0199b7a0-0000-7000-8000-000000000011";
const SALE_ID = "0199b7a0-0000-7000-8000-000000000012";
const UNKNOWN_REGISTER_ID = "0199b7a0-0000-7000-8000-000000000013";

async function migratedDatabase() {
  const database = await databaseBeforeMigration("_sale_void_credit_note_refusals");
  const { rows } = await database.query<{ id: string }>(
    `insert into registers (location_id, name) select id, 'Caja 1' from locations limit 1 returning id`,
  );
  const registerId = rows[0]?.id as string;
  return { migrated: await database.applyMigration(), registerId };
}

const insertRefusal = (registerId: string, refusedAt: string) =>
  `insert into sale_void_credit_note_refusals (credit_note_id, register_id, sale_id, refused_at)
   values ('${CREDIT_NOTE_ID}', '${registerId}', '${SALE_ID}', '${refusedAt}')`;

describe("the sale void credit note refusals migration applied over a database that already holds data", {
  timeout: 30_000,
}, () => {
  it("records the refusal of a credit note of a register the cloud already holds", async () => {
    const { migrated, registerId } = await migratedDatabase();

    await migrated.query(insertRefusal(registerId, "2026-10-16T12:00:00Z"));

    const { rows } = await migrated.query(
      "select credit_note_id, register_id, sale_id, refused_at from sale_void_credit_note_refusals",
    );
    expect(rows).toEqual([
      {
        credit_note_id: CREDIT_NOTE_ID,
        register_id: registerId,
        sale_id: SALE_ID,
        refused_at: new Date("2026-10-16T12:00:00.000Z"),
      },
    ]);
  });

  it("refuses a second refusal of the same credit note", async () => {
    const { migrated, registerId } = await migratedDatabase();
    await migrated.query(insertRefusal(registerId, "2026-10-16T12:00:00Z"));

    await expect(migrated.query(insertRefusal(registerId, "2026-10-16T13:00:00Z"))).rejects.toThrow(
      /sale_void_credit_note_refusals_pkey/,
    );
  });

  it("refuses a refusal of a register the cloud does not hold", async () => {
    const { migrated } = await migratedDatabase();

    await expect(
      migrated.query(insertRefusal(UNKNOWN_REGISTER_ID, "2026-10-16T12:00:00Z")),
    ).rejects.toThrow(/sale_void_credit_note_refusals_register_id_registers_id_fk/);
  });
});
