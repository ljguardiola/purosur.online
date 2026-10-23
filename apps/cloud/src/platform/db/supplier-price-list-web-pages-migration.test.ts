import { describe, expect, it } from "vitest";
import { databaseBeforeMigration } from "./test-support/migration-under-test.js";

async function databaseHoldingAPdfList() {
  const database = await databaseBeforeMigration("_supplier_price_list_web_pages");
  const { rows: users } = await database.query<{ id: string; location_id: string }>(
    `insert into users (first_name, email, location_id) values ('Ada', 'ada@example.com', (select id from locations limit 1)) returning id, location_id`,
  );
  const userId = users[0]?.id as string;
  const locationId = users[0]?.location_id as string;
  const { rows: suppliers } = await database.query<{ id: string }>(
    `insert into suppliers (name, actor_id) values ('Distribuidora Ejemplo', $1) returning id`,
    [userId],
  );
  const supplierId = suppliers[0]?.id as string;
  const { rows: lists } = await database.query<{ id: string }>(
    `insert into supplier_price_lists
       (supplier_id, location_id, source_kind, file_name, file_byte_size, state, uploaded_at, uploaded_by)
     values ($1, $2, 'PDF', 'lista.pdf', 1000, 'READING', '2026-03-01T12:00:00Z', $3) returning id`,
    [supplierId, locationId, userId],
  );
  return { database, userId, locationId, supplierId, pdfListId: lists[0]?.id as string };
}

async function migratedDatabase() {
  const before = await databaseHoldingAPdfList();
  const migrated = await before.database.applyMigration();
  const insertList = async (overrides: Record<string, string | number | null> = {}) => {
    const values = {
      supplier_id: before.supplierId,
      location_id: before.locationId,
      source_kind: "PDF",
      file_name: "lista.pdf",
      source_url: null,
      file_content_kind: "PDF",
      file_byte_size: 1_000,
      state: "READING",
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
  return { ...before, migrated, insertList };
}

const WEB_PAGE = {
  source_kind: "WEB_PAGE",
  file_name: null,
  source_url: "https://distribuidora-sur.example/lista",
  file_content_kind: "HTML",
};

describe("the supplier price list web pages migration applied over a database that already holds data", {
  timeout: 30_000,
}, () => {
  it("keeps a PDF list as a PDF list with its file and no web address", async () => {
    const { migrated, pdfListId } = await migratedDatabase();

    const { rows } = await migrated.query(
      `select source_kind, file_name, source_url, file_content_kind, file_byte_size
       from supplier_price_lists where id = $1`,
      [pdfListId],
    );

    expect(rows).toEqual([
      {
        source_kind: "PDF",
        file_name: "lista.pdf",
        source_url: null,
        file_content_kind: "PDF",
        file_byte_size: 1000,
      },
    ]);
  });

  it.each([
    ["a web page kept as HTML", WEB_PAGE],
    ["a web page that is a PDF", { ...WEB_PAGE, file_content_kind: "PDF" }],
  ])("accepts %s", async (_name, overrides) => {
    const { migrated, insertList } = await migratedDatabase();

    const listId = await insertList(overrides);

    const { rows } = await migrated.query(
      "select source_kind, file_name, source_url, file_content_kind from supplier_price_lists where id = $1",
      [listId],
    );
    expect(rows).toEqual([
      {
        source_kind: "WEB_PAGE",
        file_name: null,
        source_url: WEB_PAGE.source_url,
        file_content_kind: overrides.file_content_kind,
      },
    ]);
  });

  it.each([
    ["a PDF list without the name of its file", { file_name: null }],
    ["a PDF list with a web address", { source_url: "https://distribuidora-sur.example/lista" }],
    ["a web page without its address", { ...WEB_PAGE, source_url: null }],
    ["a web page with the name of a file", { ...WEB_PAGE, file_name: "lista.pdf" }],
    ["a content kind that is neither PDF nor HTML", { file_content_kind: "XLS" }],
    ["a missing content kind", { file_content_kind: null }],
    ["a source kind that is neither a PDF nor a web page", { source_kind: "XLS" }],
  ])("refuses %s", async (_name, overrides) => {
    const { insertList } = await migratedDatabase();

    await expect(insertList(overrides)).rejects.toThrow();
  });
});
