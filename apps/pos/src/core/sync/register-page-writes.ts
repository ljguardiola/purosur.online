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
    `INSERT INTO register_point_of_sale (
       register_id, point_of_sale_number, fiscal_address_id, tax_authority_last_authorized_number, version
     ) VALUES (
       @register_id, @point_of_sale_number, @fiscal_address_id, @tax_authority_last_authorized_number, @version
     )
     ON CONFLICT (register_id) DO UPDATE SET
       point_of_sale_number = CASE WHEN excluded.version > register_point_of_sale.version
         THEN excluded.point_of_sale_number ELSE register_point_of_sale.point_of_sale_number END,
       fiscal_address_id = CASE WHEN excluded.version > register_point_of_sale.version
         THEN excluded.fiscal_address_id ELSE register_point_of_sale.fiscal_address_id END,
       tax_authority_last_authorized_number = CASE
         WHEN excluded.version = register_point_of_sale.version THEN excluded.tax_authority_last_authorized_number
         WHEN excluded.point_of_sale_number = register_point_of_sale.point_of_sale_number
           AND register_point_of_sale.tax_authority_last_authorized_number IS NOT NULL
           AND (excluded.tax_authority_last_authorized_number IS NULL
             OR excluded.tax_authority_last_authorized_number < register_point_of_sale.tax_authority_last_authorized_number)
         THEN register_point_of_sale.tax_authority_last_authorized_number
         ELSE excluded.tax_authority_last_authorized_number END,
       version = excluded.version
     WHERE excluded.version > register_point_of_sale.version
       OR (excluded.version = register_point_of_sale.version
         AND excluded.tax_authority_last_authorized_number IS NOT NULL
         AND (register_point_of_sale.tax_authority_last_authorized_number IS NULL
           OR excluded.tax_authority_last_authorized_number > register_point_of_sale.tax_authority_last_authorized_number))`,
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
