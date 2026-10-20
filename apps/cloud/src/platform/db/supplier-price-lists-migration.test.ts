import { describe, expect, it } from "vitest";
import { databaseBeforeMigration } from "./test-support/migration-under-test.js";

async function databaseBefore() {
  const database = await databaseBeforeMigration("_supplier_price_lists");
  const { rows: users } = await database.query<{ id: string; location_id: string }>(
    `insert into users (first_name, email, location_id) values ('Ada', 'ada@example.com', (select id from locations limit 1)) returning id, location_id`,
  );
  const { rows: suppliers } = await database.query<{ id: string }>(
    `insert into suppliers (name, actor_id) values ('Distribuidora Ejemplo', $1) returning id`,
    [users[0]?.id],
  );
  return {
    database,
    userId: users[0]?.id as string,
    locationId: users[0]?.location_id as string,
    supplierId: suppliers[0]?.id as string,
  };
}

async function migratedDatabase() {
  const before = await databaseBefore();
  const migrated = await before.database.applyMigration();
  const insertList = async (overrides: Record<string, string | number | null> = {}) => {
    const values = {
      supplier_id: before.supplierId,
      location_id: before.locationId,
      source_kind: "PDF",
      file_name: "lista.pdf",
      file_byte_size: 1_000,
      state: "READING",
      read_failure: null,
      uploaded_at: "2026-03-01T12:00:00Z",
      uploaded_by: before.userId,
      ...overrides,
    };
    const columns = Object.keys(values);
    const { rows } = await migrated.query<{ id: string }>(
      `insert into supplier_price_lists (${columns.join(", ")})
       values (${columns.map((_column, index) => `$${index + 1}`).join(", ")}) returning id`,
      Object.values(values),
    );
    return rows[0]?.id as string;
  };
  const insertRow = (listId: string, overrides: Record<string, string | number | null> = {}) => {
    const values = { list_id: listId, position: 0, description: "Yerba 1 kg", ...overrides };
    const columns = Object.keys(values);
    return migrated.query(
      `insert into supplier_price_list_rows (${columns.join(", ")})
       values (${columns.map((_column, index) => `$${index + 1}`).join(", ")})`,
      Object.values(values),
    );
  };
  return { ...before, migrated, insertList, insertRow };
}

describe("the supplier price lists migration applied over a database that already holds data", {
  timeout: 30_000,
}, () => {
  it("keeps the users and the suppliers it finds", async () => {
    const { database, userId, supplierId } = await databaseBefore();

    const migrated = await database.applyMigration();

    const { rows: users } = await migrated.query("select id from users where id = $1", [userId]);
    const { rows: suppliers } = await migrated.query("select id from suppliers where id = $1", [
      supplierId,
    ]);
    expect(users).toHaveLength(1);
    expect(suppliers).toHaveLength(1);
  });

  it("starts a list reading, at version 1, with nothing sent yet", async () => {
    const { migrated, insertList } = await migratedDatabase();

    const listId = await insertList();

    const { rows } = await migrated.query(
      "select state, version, sent_at, sent_on, list_date from supplier_price_lists where id = $1",
      [listId],
    );
    expect(rows).toEqual([
      { state: "READING", version: 1, sent_at: null, sent_on: null, list_date: null },
    ]);
  });

  it("keeps the calendar day an extraction was sent on and the list date as plain dates", async () => {
    const { migrated, insertList } = await migratedDatabase();
    const listId = await insertList({ sent_on: "2026-03-01", list_date: "2026-02-27" });

    const { rows } = await migrated.query<{ sent_on: string; list_date: string }>(
      "select sent_on::text as sent_on, list_date::text as list_date from supplier_price_lists where id = $1",
      [listId],
    );

    expect(rows).toEqual([{ sent_on: "2026-03-01", list_date: "2026-02-27" }]);
  });

  it.each([
    ["a state that is not one of the five", { state: "PENDING" }],
    ["a source kind that is not a PDF", { source_kind: "XLS" }],
    ["a web page as the source", { source_kind: "WEB" }],
    ["a web address as the source", { source_url: "https://proveedor.example/lista" }],
    ["a list without the name of its file", { file_name: null }],
    ["a list without the size of its file", { file_byte_size: null }],
    ["a read failure that is not one the reading can end with", { read_failure: "lost" }],
  ])("refuses %s", async (_name, overrides) => {
    const { insertList } = await migratedDatabase();

    await expect(insertList(overrides)).rejects.toThrow();
  });

  it.each(["READING", "READ_FAILED", "EXTRACTED", "REVIEWED", "DISCARDED"])(
    "accepts the %s state",
    async (state) => {
      const { insertList } = await migratedDatabase();

      await expect(insertList({ state })).resolves.toEqual(expect.any(String));
    },
  );

  it("refuses a list for a supplier or a branch that does not exist", async () => {
    const { insertList } = await migratedDatabase();

    await expect(
      insertList({ supplier_id: "00000000-0000-4000-8000-000000000000" }),
    ).rejects.toThrow();
    await expect(
      insertList({ location_id: "00000000-0000-4000-8000-000000000000" }),
    ).rejects.toThrow();
  });

  it("keeps the rows of a list in position order with the price as printed and the source page", async () => {
    const { migrated, insertList, insertRow } = await migratedDatabase();
    const listId = await insertList({ state: "EXTRACTED" });
    await insertRow(listId, { position: 1, description: "Azúcar 1 kg" });
    await insertRow(listId, {
      position: 0,
      description: "Yerba 1 kg",
      supplier_code: "Y-01",
      presentation: "Caja x 10",
      price_cents: 123_456,
      page: 3,
    });

    const { rows } = await migrated.query(
      `select description, supplier_code, presentation, price_cents, page
       from supplier_price_list_rows where list_id = $1 order by position`,
      [listId],
    );

    expect(rows).toEqual([
      {
        description: "Yerba 1 kg",
        supplier_code: "Y-01",
        presentation: "Caja x 10",
        price_cents: 123_456,
        page: 3,
      },
      {
        description: "Azúcar 1 kg",
        supplier_code: null,
        presentation: null,
        price_cents: null,
        page: null,
      },
    ]);
  });

  it("refuses a negative price and a source page below one", async () => {
    const { insertList, insertRow } = await migratedDatabase();
    const listId = await insertList();

    await expect(insertRow(listId, { price_cents: -1 })).rejects.toThrow();
    await expect(insertRow(listId, { page: 0 })).rejects.toThrow();
  });

  it("refuses two rows in the same position of a list", async () => {
    const { insertList, insertRow } = await migratedDatabase();
    const listId = await insertList();
    await insertRow(listId, { position: 0 });

    await expect(insertRow(listId, { position: 0 })).rejects.toThrow();
  });

  it("holds one extraction cap per branch, above zero, apart from the settings the register syncs", async () => {
    const { migrated, locationId } = await migratedDatabase();

    await migrated.query(
      "insert into supplier_price_list_extraction_caps (location_id, daily_cap) values ($1, 5)",
      [locationId],
    );

    await expect(
      migrated.query(
        "insert into supplier_price_list_extraction_caps (location_id, daily_cap) values ($1, 6)",
        [locationId],
      ),
    ).rejects.toThrow();
    await expect(
      migrated.query("update supplier_price_list_extraction_caps set daily_cap = 0"),
    ).rejects.toThrow();
    const { rows } = await migrated.query(
      "select daily_cap from supplier_price_list_extraction_caps",
    );
    expect(rows).toEqual([{ daily_cap: 5 }]);
  });
});
