import { describe, expect, it } from "vitest";
import {
  databaseBeforeMigration,
  type SqlOnlyDatabase,
} from "./test-support/migration-under-test.js";

async function insertList(
  database: SqlOnlyDatabase,
  { supplierId, locationId, userId }: { supplierId: string; locationId: string; userId: string },
  contentKind: "PDF" | "STORE_CATALOG",
): Promise<string> {
  const source =
    contentKind === "PDF"
      ? { kind: "PDF", fileName: "lista.pdf", url: null }
      : { kind: "WEB_PAGE", fileName: null, url: "https://distribuidora-sur.example/catalogo" };
  const { rows } = await database.query<{ id: string }>(
    `insert into supplier_price_lists
       (supplier_id, location_id, source_kind, file_name, source_url, file_content_kind, file_byte_size, state, uploaded_at, uploaded_by)
     values ($1, $2, $3, $4, $5, $6, 1000, 'EXTRACTED', '2026-03-01T12:00:00Z', $7) returning id`,
    [supplierId, locationId, source.kind, source.fileName, source.url, contentKind, userId],
  );
  return rows[0]?.id as string;
}

async function databaseHoldingLists() {
  const database = await databaseBeforeMigration("_ai_calls_of_supplier_price_lists");
  const { rows: users } = await database.query<{ id: string; location_id: string }>(
    `insert into users (first_name, email, location_id) values ('Ada', 'ada@example.com', (select id from locations limit 1)) returning id, location_id`,
  );
  const userId = users[0]?.id as string;
  const locationId = users[0]?.location_id as string;
  const { rows: suppliers } = await database.query<{ id: string }>(
    `insert into suppliers (name, actor_id) values ('Distribuidora Ejemplo', $1) returning id`,
    [userId],
  );
  const seed = { supplierId: suppliers[0]?.id as string, locationId, userId };
  return { database, seed };
}

async function recordedFromStart(database: SqlOnlyDatabase, listId: string) {
  const { rows } = await database.query<{ recorded: boolean }>(
    `select ai_calls_recorded_from_start as recorded from supplier_price_lists where id = $1`,
    [listId],
  );
  return rows[0]?.recorded;
}

describe("the AI calls of supplier price lists migration applied over a database that already holds lists", {
  timeout: 30_000,
}, () => {
  it("marks every list that already existed as not having its AI calls recorded from the start", async () => {
    const { database, seed } = await databaseHoldingLists();
    const pdfListId = await insertList(database, seed, "PDF");
    const storeCatalogListId = await insertList(database, seed, "STORE_CATALOG");

    const migrated = await database.applyMigration();

    expect(await recordedFromStart(migrated, pdfListId)).toBe(false);
    expect(await recordedFromStart(migrated, storeCatalogListId)).toBe(false);
  });

  it("marks a list added after it as having its AI calls recorded from the start", async () => {
    const { database, seed } = await databaseHoldingLists();
    const migrated = await database.applyMigration();

    const listId = await insertList(migrated, seed, "PDF");

    expect(await recordedFromStart(migrated, listId)).toBe(true);
  });
});
