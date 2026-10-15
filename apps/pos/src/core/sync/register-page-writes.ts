import type { SyncChange } from "@purosur/contracts";
import type { LocalDatabase } from "../platform/local-database";
import { type PageWriteMode, versionAccepted } from "./page-write-mode";
import type { RemovalOf } from "./pulled-change";

function keepingHighest(table: string, column: string): string {
  return `${column} = CASE
         WHEN excluded.point_of_sale_number = ${table}.point_of_sale_number
           AND ${table}.${column} IS NOT NULL
           AND (excluded.${column} IS NULL OR excluded.${column} < ${table}.${column})
         THEN ${table}.${column}
         ELSE excluded.${column} END`;
}

function redeliveredPointOfSale(table: string, fiscalAddress: boolean): string {
  const keptNumbers = [
    keepingHighest(table, "tax_authority_last_authorized_number"),
    ...(fiscalAddress ? [] : [keepingHighest(table, "highest_synced_offline_number")]),
  ];
  return `ON CONFLICT (register_id) DO UPDATE SET
       point_of_sale_number = excluded.point_of_sale_number,
       ${fiscalAddress ? "fiscal_address_id = excluded.fiscal_address_id," : ""}
       ${keptNumbers.join(",\n       ")},
       version = excluded.version
     WHERE excluded.version >= ${table}.version`;
}

export function prepareRegisterPageWrites(database: LocalDatabase, mode: PageWriteMode) {
  const accepts = versionAccepted(mode);
  const saveRegister = database.prepare(
    `INSERT INTO own_register (id, name, version, removed) VALUES (@id, @name, @version, 0)
     ON CONFLICT (id) DO UPDATE SET name = excluded.name, version = excluded.version, removed = 0
     WHERE excluded.version ${accepts} own_register.version`,
  );
  const removeRegister = database.prepare(
    "UPDATE own_register SET removed = 1, version = @version WHERE id = @id AND version < @version",
  );
  const savePointOfSaleConflict =
    mode === "pull"
      ? `ON CONFLICT (register_id) DO UPDATE SET
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
           OR excluded.tax_authority_last_authorized_number > register_point_of_sale.tax_authority_last_authorized_number))`
      : redeliveredPointOfSale("register_point_of_sale", true);
  const savePointOfSale = database.prepare(
    `INSERT INTO register_point_of_sale (
       register_id, point_of_sale_number, fiscal_address_id, tax_authority_last_authorized_number, version
     ) VALUES (
       @register_id, @point_of_sale_number, @fiscal_address_id, @tax_authority_last_authorized_number, @version
     )
     ${savePointOfSaleConflict}`,
  );
  const saveOfflinePointOfSaleConflict =
    mode === "pull"
      ? `ON CONFLICT (register_id) DO UPDATE SET
       point_of_sale_number = CASE WHEN excluded.version > register_offline_point_of_sale.version
         THEN excluded.point_of_sale_number ELSE register_offline_point_of_sale.point_of_sale_number END,
       ${keepingHighest("register_offline_point_of_sale", "tax_authority_last_authorized_number")},
       ${keepingHighest("register_offline_point_of_sale", "highest_synced_offline_number")},
       version = excluded.version
     WHERE excluded.version > register_offline_point_of_sale.version
       OR (excluded.version = register_offline_point_of_sale.version
         AND excluded.tax_authority_last_authorized_number IS NOT NULL
         AND (register_offline_point_of_sale.tax_authority_last_authorized_number IS NULL
           OR excluded.tax_authority_last_authorized_number > register_offline_point_of_sale.tax_authority_last_authorized_number))
       OR (excluded.version = register_offline_point_of_sale.version
         AND excluded.highest_synced_offline_number IS NOT NULL
         AND (register_offline_point_of_sale.highest_synced_offline_number IS NULL
           OR excluded.highest_synced_offline_number > register_offline_point_of_sale.highest_synced_offline_number))`
      : redeliveredPointOfSale("register_offline_point_of_sale", false);
  const saveOfflinePointOfSale = database.prepare(
    `INSERT INTO register_offline_point_of_sale (
       register_id, point_of_sale_number, tax_authority_last_authorized_number,
       highest_synced_offline_number, version
     ) VALUES (
       @register_id, @point_of_sale_number, @tax_authority_last_authorized_number,
       @highest_synced_offline_number, @version
     )
     ${saveOfflinePointOfSaleConflict}`,
  );
  const saveFirstCashSession = database.prepare(
    `INSERT INTO branch_first_cash_sessions (location_id, opened_at) VALUES (@location_id, @opened_at)
     ON CONFLICT (location_id) DO UPDATE SET opened_at = excluded.opened_at`,
  );

  return {
    firstCashSession({
      entity_id,
      row,
    }: Extract<SyncChange, { entity: "branch_first_cash_session" }>): void {
      saveFirstCashSession.run({ location_id: entity_id, opened_at: row.opened_at });
    },

    save({ entity_id, row }: Extract<SyncChange, { entity: "register" }>): void {
      saveRegister.run({ id: entity_id, name: row.name, version: row.version });
    },

    pointOfSale({
      entity_id,
      row,
    }: Extract<SyncChange, { entity: "register_point_of_sale" }>): void {
      savePointOfSale.run({ register_id: entity_id, ...row });
    },

    offlinePointOfSale({
      entity_id,
      row,
    }: Extract<SyncChange, { entity: "register_offline_point_of_sale" }>): void {
      saveOfflinePointOfSale.run({ register_id: entity_id, ...row });
    },

    removal({ entity_id, version }: RemovalOf<"register">): void {
      removeRegister.run({ id: entity_id, version });
    },
  };
}
