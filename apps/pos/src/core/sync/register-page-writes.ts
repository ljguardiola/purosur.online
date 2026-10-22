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

const COUNT = "tax_authority_last_authorized_number";
const DAY = "tax_authority_last_authorized_issued_on";
const AWAITED_FROM_CLOUD = `EXISTS (
           SELECT 1 FROM awaiting_restored_numbering
           WHERE awaiting_restored_numbering.register_id = register_point_of_sale.register_id)
           AND excluded.version >= register_point_of_sale.version`;

function latestDay(table: string): string {
  return `CASE
         WHEN excluded.point_of_sale_number = ${table}.point_of_sale_number
           AND ${table}.${COUNT} IS NOT NULL
           AND (excluded.${COUNT} IS NULL OR excluded.${COUNT} < ${table}.${COUNT})
         THEN ${table}.${DAY}
         WHEN excluded.point_of_sale_number = ${table}.point_of_sale_number
           AND ${table}.${DAY} IS NOT NULL
           AND (excluded.${DAY} IS NULL OR excluded.${DAY} < ${table}.${DAY})
         THEN ${table}.${DAY}
         ELSE excluded.${DAY} END`;
}

function redeliveredPointOfSale(table: string, fiscalAddress: boolean): string {
  const keptNumbers = [
    keepingHighest(table, COUNT),
    ...(fiscalAddress ? [`${DAY} = ${latestDay(table)}`] : []),
    ...(fiscalAddress ? [] : [keepingHighest(table, "highest_synced_offline_number")]),
  ];
  return `ON CONFLICT (register_id) DO UPDATE SET
       point_of_sale_number = excluded.point_of_sale_number,
       ${fiscalAddress ? "fiscal_address_id = excluded.fiscal_address_id," : ""}
       ${fiscalAddress ? "numbering_frozen = excluded.numbering_frozen," : ""}
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
         WHEN ${AWAITED_FROM_CLOUD} THEN excluded.tax_authority_last_authorized_number
         WHEN excluded.version = register_point_of_sale.version
           AND excluded.tax_authority_last_authorized_number IS NOT NULL
           AND (register_point_of_sale.tax_authority_last_authorized_number IS NULL
             OR excluded.tax_authority_last_authorized_number > register_point_of_sale.tax_authority_last_authorized_number)
         THEN excluded.tax_authority_last_authorized_number
         WHEN excluded.version = register_point_of_sale.version THEN register_point_of_sale.tax_authority_last_authorized_number
         WHEN excluded.point_of_sale_number = register_point_of_sale.point_of_sale_number
           AND register_point_of_sale.tax_authority_last_authorized_number IS NOT NULL
           AND (excluded.tax_authority_last_authorized_number IS NULL
             OR excluded.tax_authority_last_authorized_number < register_point_of_sale.tax_authority_last_authorized_number)
         THEN register_point_of_sale.tax_authority_last_authorized_number
         ELSE excluded.tax_authority_last_authorized_number END,
       ${DAY} = CASE
         WHEN ${AWAITED_FROM_CLOUD} THEN excluded.${DAY}
         WHEN excluded.version = register_point_of_sale.version THEN
           CASE
             WHEN excluded.${COUNT} IS NOT NULL
               AND (register_point_of_sale.${COUNT} IS NULL
                 OR excluded.${COUNT} > register_point_of_sale.${COUNT})
             THEN CASE
               WHEN register_point_of_sale.${DAY} IS NOT NULL
                 AND (excluded.${DAY} IS NULL OR excluded.${DAY} < register_point_of_sale.${DAY})
               THEN register_point_of_sale.${DAY}
               ELSE excluded.${DAY} END
             WHEN excluded.${COUNT} = register_point_of_sale.${COUNT}
               AND excluded.${DAY} IS NOT NULL
               AND (register_point_of_sale.${DAY} IS NULL
                 OR excluded.${DAY} > register_point_of_sale.${DAY})
             THEN excluded.${DAY}
             ELSE register_point_of_sale.${DAY} END
         ELSE ${latestDay("register_point_of_sale")} END,
       numbering_frozen = excluded.numbering_frozen,
       version = excluded.version
     WHERE excluded.version > register_point_of_sale.version
       OR (${AWAITED_FROM_CLOUD})
       OR (excluded.version = register_point_of_sale.version
         AND excluded.tax_authority_last_authorized_number IS NOT NULL
         AND (register_point_of_sale.tax_authority_last_authorized_number IS NULL
           OR excluded.tax_authority_last_authorized_number > register_point_of_sale.tax_authority_last_authorized_number))
       OR (excluded.version = register_point_of_sale.version
         AND excluded.${COUNT} = register_point_of_sale.${COUNT}
         AND excluded.${DAY} IS NOT NULL
         AND (register_point_of_sale.${DAY} IS NULL
           OR excluded.${DAY} > register_point_of_sale.${DAY}))
       OR (excluded.version = register_point_of_sale.version
         AND excluded.numbering_frozen <> register_point_of_sale.numbering_frozen)`
      : redeliveredPointOfSale("register_point_of_sale", true);
  const savePointOfSale = database.prepare(
    `INSERT INTO register_point_of_sale (
       register_id, point_of_sale_number, fiscal_address_id, tax_authority_last_authorized_number,
       tax_authority_last_authorized_issued_on, numbering_frozen, version
     ) VALUES (
       @register_id, @point_of_sale_number, @fiscal_address_id, @tax_authority_last_authorized_number,
       @tax_authority_last_authorized_issued_on, @numbering_frozen, @version
     )
     ${savePointOfSaleConflict}`,
  );
  const settleAwaitedNumbering = database.prepare(
    `DELETE FROM awaiting_restored_numbering
     WHERE register_id = @register_id
       AND EXISTS (
         SELECT 1 FROM register_point_of_sale
         WHERE register_id = @register_id AND version = @version
           AND numbering_frozen = 0 AND ${COUNT} IS NOT NULL)`,
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
      savePointOfSale.run({
        register_id: entity_id,
        ...row,
        numbering_frozen: row.numbering_frozen ? 1 : 0,
      });
      if (mode === "pull") {
        settleAwaitedNumbering.run({ register_id: entity_id, version: row.version });
      }
    },

    offlinePointOfSale({
      entity_id,
      row,
    }: Extract<SyncChange, { entity: "register_offline_point_of_sale" }>): void {
      saveOfflinePointOfSale.run({
        register_id: entity_id,
        point_of_sale_number: row.point_of_sale_number,
        tax_authority_last_authorized_number: row.tax_authority_last_authorized_number,
        highest_synced_offline_number: row.highest_synced_offline_number,
        version: row.version,
      });
    },

    removal({ entity_id, version }: RemovalOf<"register">): void {
      removeRegister.run({ id: entity_id, version });
    },
  };
}
