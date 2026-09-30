import type { SyncChange } from "@purosur/contracts";
import type { Statement } from "better-sqlite3";
import type { LocalDatabase } from "../platform/local-database";

type ChangeOf<TEntity extends SyncChange["entity"]> = Extract<SyncChange, { entity: TEntity }>;

// Every save is guarded by the row's version, so a version the register already has, or an older
// one delivered late, never overwrites it, and nothing is ever deleted.
export function prepareCatalogPageWrites(database: LocalDatabase) {
  const saveCategory = database.prepare(
    `INSERT INTO categories (id, name, parent_id, version, removed)
     VALUES (@id, @name, @parent_id, @version, 0)
     ON CONFLICT (id) DO UPDATE SET
       name = excluded.name, parent_id = excluded.parent_id, version = excluded.version, removed = 0
     WHERE excluded.version > categories.version`,
  );
  const saveProduct = database.prepare(
    `INSERT INTO products (
       id, name, category_id, brand_id, sale_unit, active, net_content_quantity, net_content_unit,
       version, removed
     ) VALUES (
       @id, @name, @category_id, @brand_id, @sale_unit, @active, @net_content_quantity,
       @net_content_unit, @version, 0
     )
     ON CONFLICT (id) DO UPDATE SET
       name = excluded.name,
       category_id = excluded.category_id,
       brand_id = excluded.brand_id,
       sale_unit = excluded.sale_unit,
       active = excluded.active,
       net_content_quantity = excluded.net_content_quantity,
       net_content_unit = excluded.net_content_unit,
       version = excluded.version,
       removed = 0
     WHERE excluded.version > products.version`,
  );
  const saveBarcode = database.prepare(
    `INSERT INTO product_barcodes (product_id, position, code, active)
     VALUES (@product_id, @position, @code, 1)
     ON CONFLICT (product_id, position) DO UPDATE SET code = excluded.code, active = 1`,
  );
  const deactivateBarcodesOutside = database.prepare(
    `UPDATE product_barcodes SET active = 0
     WHERE product_id = @product_id
       AND position NOT IN (SELECT value FROM json_each(@positions))`,
  );
  const savePriceList = database.prepare(
    `INSERT INTO price_lists (id, name, version) VALUES (@id, @name, @version)
     ON CONFLICT (id) DO UPDATE SET name = excluded.name, version = excluded.version
     WHERE excluded.version > price_lists.version`,
  );
  const savePrice = database.prepare(
    `INSERT INTO prices (id, product_id, price_list_id, unit_price, valid_from, version, removed)
     VALUES (@id, @product_id, @price_list_id, @unit_price, @valid_from, @version, 0)
     ON CONFLICT (id) DO UPDATE SET
       product_id = excluded.product_id,
       price_list_id = excluded.price_list_id,
       unit_price = excluded.unit_price,
       valid_from = excluded.valid_from,
       version = excluded.version,
       removed = 0
     WHERE excluded.version > prices.version`,
  );
  const removals: Record<ChangeOf<"removal">["removed_entity"], Statement> = {
    category: database.prepare(
      "UPDATE categories SET removed = 1, version = @version WHERE id = @id AND version < @version",
    ),
    product: database.prepare(
      "UPDATE products SET removed = 1, version = @version WHERE id = @id AND version < @version",
    ),
    price: database.prepare(
      "UPDATE prices SET removed = 1, version = @version WHERE id = @id AND version < @version",
    ),
  };
  const deactivateBarcodes = database.prepare(
    "UPDATE product_barcodes SET active = 0 WHERE product_id = ?",
  );

  return {
    category({ entity_id, row }: ChangeOf<"category">): void {
      saveCategory.run({
        id: entity_id,
        name: row.name,
        parent_id: row.parent_id,
        version: row.version,
      });
    },

    product({ entity_id, row }: ChangeOf<"product">): void {
      const saved = saveProduct.run({
        id: entity_id,
        name: row.name,
        category_id: row.category_id,
        brand_id: row.brand_id,
        sale_unit: row.sale_unit,
        active: row.active ? 1 : 0,
        net_content_quantity: row.net_content?.quantity ?? null,
        net_content_unit: row.net_content?.unit ?? null,
        version: row.version,
      });
      if (saved.changes === 0) {
        return;
      }
      for (const barcode of row.barcodes) {
        saveBarcode.run({ product_id: entity_id, position: barcode.position, code: barcode.code });
      }
      deactivateBarcodesOutside.run({
        product_id: entity_id,
        positions: JSON.stringify(row.barcodes.map((barcode) => barcode.position)),
      });
    },

    priceList({ entity_id, row }: ChangeOf<"price_list">): void {
      savePriceList.run({ id: entity_id, name: row.name, version: row.version });
    },

    price({ entity_id, row }: ChangeOf<"price">): void {
      savePrice.run({
        id: entity_id,
        product_id: row.product_id,
        price_list_id: row.price_list_id,
        unit_price: row.unit_price,
        valid_from: row.valid_from,
        version: row.version,
      });
    },

    removal({ entity_id, removed_entity, version }: ChangeOf<"removal">): void {
      const removed = removals[removed_entity].run({ id: entity_id, version });
      if (removed_entity === "product" && removed.changes > 0) {
        deactivateBarcodes.run(entity_id);
      }
    },
  };
}
