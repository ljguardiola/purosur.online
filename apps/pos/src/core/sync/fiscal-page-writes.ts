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
    `INSERT INTO buyer_identification_thresholds (id, amount, valid_from, revision)
     VALUES (@id, @amount, @valid_from, @revision)
     ON CONFLICT (id) DO NOTHING`,
  );
  const saveTaxStatusSet = database.prepare(
    `INSERT INTO buyer_tax_status_sets (params_version, set_id, options)
     VALUES (@params_version, @set_id, @options)
     ON CONFLICT (params_version) DO NOTHING`,
  );
  const saveOfflineAuthorizationCode = database.prepare(
    `INSERT INTO offline_authorization_codes (
       fortnight_start, fortnight_end, code, report_deadline, version
     ) VALUES (@fortnight_start, @fortnight_end, @code, @report_deadline, @version)
     ON CONFLICT (fortnight_start) DO UPDATE SET
       fortnight_end = excluded.fortnight_end,
       code = excluded.code,
       report_deadline = excluded.report_deadline,
       version = excluded.version
     WHERE excluded.version > offline_authorization_codes.version`,
  );
  const saveOfflineNumberBlock = database.prepare(
    `INSERT INTO offline_number_blocks (
       id, point_of_sale, document_type, first_number, last_number, status, version
     ) VALUES (
       @id, @point_of_sale, @document_type, @first_number, @last_number, @status, @version
     )
     ON CONFLICT (id) DO UPDATE SET
       point_of_sale = excluded.point_of_sale,
       document_type = excluded.document_type,
       first_number = excluded.first_number,
       last_number = excluded.last_number,
       status = excluded.status,
       version = excluded.version
     WHERE excluded.version > offline_number_blocks.version`,
  );

  return {
    issuerIdentification({ row }: Extract<SyncChange, { entity: "issuer_identification" }>): void {
      saveIssuerVersion.run(row);
    },

    buyerIdentificationThreshold({
      entity_id,
      row,
    }: Extract<SyncChange, { entity: "buyer_identification_threshold" }>): void {
      saveThreshold.run({
        id: entity_id,
        amount: row.amount,
        valid_from: row.valid_from,
        revision: row.revision,
      });
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

    offlineAuthorizationCode({
      row,
    }: Extract<SyncChange, { entity: "offline_authorization_code" }>): void {
      saveOfflineAuthorizationCode.run(row);
    },

    offlineNumberBlock({
      entity_id,
      row,
    }: Extract<SyncChange, { entity: "offline_number_block" }>): void {
      saveOfflineNumberBlock.run({
        id: entity_id,
        point_of_sale: row.point_of_sale_number,
        document_type: row.document_type,
        first_number: row.first_number,
        last_number: row.last_number,
        status: row.status,
        version: row.version,
      });
    },
  };
}
