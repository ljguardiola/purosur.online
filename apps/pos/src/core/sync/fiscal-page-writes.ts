import type { SyncChange } from "@purosur/contracts";
import type { LocalDatabase } from "../platform/local-database";

export function prepareFiscalPageWrites(database: LocalDatabase) {
  const saveIssuerVersion = database.prepare(
    `INSERT INTO issuer_identification_versions (
       version, legal_name, gross_income_registration, activity_start_date, authorized_cuit,
       tax_status
     ) VALUES (
       @version, @legal_name, @gross_income_registration, @activity_start_date, @authorized_cuit,
       @tax_status
     )
     ON CONFLICT (version) DO NOTHING`,
  );
  const saveThreshold = database.prepare(
    `INSERT INTO buyer_identification_thresholds (id, amount, valid_from)
     VALUES (@id, @amount, @valid_from)
     ON CONFLICT (id) DO NOTHING`,
  );
  const saveTaxStatusSet = database.prepare(
    `INSERT INTO buyer_tax_status_sets (params_version, set_id, options)
     VALUES (@params_version, @set_id, @options)
     ON CONFLICT (params_version) DO NOTHING`,
  );

  return {
    issuerIdentification({ row }: Extract<SyncChange, { entity: "issuer_identification" }>): void {
      saveIssuerVersion.run(row);
    },

    buyerIdentificationThreshold({
      entity_id,
      row,
    }: Extract<SyncChange, { entity: "buyer_identification_threshold" }>): void {
      saveThreshold.run({ id: entity_id, amount: row.amount, valid_from: row.valid_from });
    },

    buyerTaxStatusSet({
      entity_id,
      row,
    }: Extract<SyncChange, { entity: "buyer_tax_status_set" }>): void {
      saveTaxStatusSet.run({
        params_version: row.params_version,
        set_id: entity_id,
        options: JSON.stringify(row.options),
      });
    },
  };
}
