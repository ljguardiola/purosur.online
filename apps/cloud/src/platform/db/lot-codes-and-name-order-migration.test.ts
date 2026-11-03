import { describe, expect, it } from "vitest";
import { databaseBeforeMigration } from "./test-support/migration-under-test.js";

async function databaseBefore(lotsCreatedAt: string[]) {
  const database = await databaseBeforeMigration("_lot_codes_and_name_order");
  const first = async (sql: string, params: unknown[] = []) => {
    const { rows } = await database.query<{ id: string }>(sql, params);
    return rows[0]?.id as string;
  };
  const locationId = await first("select id from locations limit 1");
  const categoryId = await first("insert into categories (name) values ('Almacen') returning id");
  const insertLot = async (createdAt: string, name: string) => {
    const productId = await first(
      "insert into products (name, category_id, sale_unit) values ($1, $2, 'UNIT') returning id",
      [name, categoryId],
    );
    return first(
      `insert into lots (product_id, location_id, quantity_received, technical, cost_incomplete, created_at)
       values ($1, $2, 0, true, true, $3) returning id`,
      [productId, locationId, createdAt],
    );
  };
  const lotIds: string[] = [];
  for (const [index, createdAt] of lotsCreatedAt.entries()) {
    lotIds.push(await insertLot(createdAt, `Producto ${index}`));
  }
  return { database, insertLot, lotIds };
}

const LATER_FIRST = ["2026-10-03T10:00:00Z", "2026-10-01T10:00:00Z", "2026-10-02T10:00:00Z"];

describe("the lot codes and name order migration applied over a database that already holds lots", {
  timeout: 30_000,
}, () => {
  it("gives every existing lot a distinct code and name order in the order it was created", async () => {
    const { database, lotIds } = await databaseBefore(LATER_FIRST);
    const client = await database.applyMigration();

    const { rows } = await client.query(
      "select id, code, name_order from lots order by created_at",
    );

    expect(rows).toEqual([
      { id: lotIds[1], code: 1, name_order: 1 },
      { id: lotIds[2], code: 2, name_order: 2 },
      { id: lotIds[0], code: 3, name_order: 3 },
    ]);
  });

  it("numbers lots tied on creation time by id so the order is stable", async () => {
    const sameInstant = "2026-10-01T10:00:00Z";
    const { database, lotIds } = await databaseBefore([sameInstant, sameInstant]);
    const client = await database.applyMigration();

    const { rows } = await client.query<{ id: string }>("select id from lots order by code");

    expect(rows.map((row) => row.id)).toEqual([...lotIds].sort());
  });

  it("gives a lot inserted afterwards, without naming either column, the next code and name order", async () => {
    const { database, insertLot } = await databaseBefore(LATER_FIRST);
    await database.applyMigration();

    const lotId = await insertLot("2026-10-04T10:00:00Z", "Producto nuevo");

    const { rows } = await database.query("select code, name_order from lots where id = $1", [
      lotId,
    ]);
    expect(rows).toEqual([{ code: 4, name_order: 4 }]);
  });

  it("starts both sequences at one when there is no lot yet", async () => {
    const { database, insertLot } = await databaseBefore([]);
    await database.applyMigration();

    const lotId = await insertLot("2026-10-04T10:00:00Z", "Producto nuevo");

    const { rows } = await database.query("select code, name_order from lots where id = $1", [
      lotId,
    ]);
    expect(rows).toEqual([{ code: 1, name_order: 1 }]);
  });

  it("refuses two lots with the same code", async () => {
    const { database } = await databaseBefore(LATER_FIRST);
    const client = await database.applyMigration();

    await expect(client.query("update lots set code = 1 where code = 2")).rejects.toThrow(
      /lots_code_key/,
    );
  });
});
