import type { SyncChange } from "@purosur/contracts";
import type { LocalDatabase } from "../platform/local-database";
import type { RemovalOf } from "./pulled-change";

export function prepareRegisterPageWrites(database: LocalDatabase) {
  const saveRegister = database.prepare(
    `INSERT INTO own_register (id, name, version, removed) VALUES (@id, @name, @version, 0)
     ON CONFLICT (id) DO UPDATE SET name = excluded.name, version = excluded.version, removed = 0
     WHERE excluded.version > own_register.version`,
  );
  const removeRegister = database.prepare(
    "UPDATE own_register SET removed = 1, version = @version WHERE id = @id AND version < @version",
  );
  const savePointOfSale = database.prepare(
    `INSERT INTO register_point_of_sale (register_id, point_of_sale_number, fiscal_address_id, version)
     VALUES (@register_id, @point_of_sale_number, @fiscal_address_id, @version)
     ON CONFLICT (register_id) DO UPDATE SET
       point_of_sale_number = excluded.point_of_sale_number,
       fiscal_address_id = excluded.fiscal_address_id,
       version = excluded.version
     WHERE excluded.version > register_point_of_sale.version`,
  );

  return {
    save({ entity_id, row }: Extract<SyncChange, { entity: "register" }>): void {
      saveRegister.run({ id: entity_id, name: row.name, version: row.version });
    },

    pointOfSale({
      entity_id,
      row,
    }: Extract<SyncChange, { entity: "register_point_of_sale" }>): void {
      savePointOfSale.run({ register_id: entity_id, ...row });
    },

    removal({ entity_id, version }: RemovalOf<"register">): void {
      removeRegister.run({ id: entity_id, version });
    },
  };
}
