import { describe, expect, it } from "vitest";
import { databaseBeforeMigration } from "./test-support/migration-under-test.js";

async function databaseHoldingAWebPageList() {
  const database = await databaseBeforeMigration("_supplier_price_list_store_catalog");
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
       (supplier_id, location_id, source_kind, source_url, file_content_kind, file_byte_size, state, uploaded_at, uploaded_by)
     values ($1, $2, 'WEB_PAGE', 'https://distribuidora-sur.example/lista', 'HTML', 1000, 'READING', '2026-03-01T12:00:00Z', $3) returning id`,
    [supplierId, locationId, userId],
  );
  return { database, userId, locationId, supplierId, webPageListId: lists[0]?.id as string };
}

async function migratedDatabase() {
  const before = await databaseHoldingAWebPageList();
  const migrated = await before.database.applyMigration();
  const insertWebPageList = async (contentKind: string | null) => {
    const { rows } = await migrated.query<{ id: string }>(
      `insert into supplier_price_lists
         (supplier_id, location_id, source_kind, source_url, file_content_kind, file_byte_size, state, uploaded_at, uploaded_by)
       values ($1, $2, 'WEB_PAGE', 'https://tiendista.com/almacen-del-sur', $3, 1000, 'READING', '2026-03-01T12:00:00Z', $4) returning id`,
      [before.supplierId, before.locationId, contentKind, before.userId],
    );
    return rows[0]?.id as string;
  };
  return { ...before, migrated, insertWebPageList };
}

describe("the supplier price list store catalog migration applied over a database that already holds data", {
  timeout: 30_000,
}, () => {
  it("keeps a web page list as it was", async () => {
    const { migrated, webPageListId } = await migratedDatabase();

    const { rows } = await migrated.query(
      "select source_kind, file_content_kind from supplier_price_lists where id = $1",
      [webPageListId],
    );

    expect(rows).toEqual([{ source_kind: "WEB_PAGE", file_content_kind: "HTML" }]);
  });

  it("accepts a web page list kept as a store catalog", async () => {
    const { migrated, insertWebPageList } = await migratedDatabase();

    const listId = await insertWebPageList("STORE_CATALOG");

    const { rows } = await migrated.query(
      "select file_content_kind from supplier_price_lists where id = $1",
      [listId],
    );
    expect(rows).toEqual([{ file_content_kind: "STORE_CATALOG" }]);
  });

  it.each(["XLS", "store_catalog", null])("refuses the content kind %j", async (contentKind) => {
    const { insertWebPageList } = await migratedDatabase();

    await expect(insertWebPageList(contentKind)).rejects.toThrow();
  });
});
