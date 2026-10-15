import type { FiscalDocumentState } from "@purosur/domain";
import type { LocalDatabase } from "../platform/local-database";

export function readFiscalDocumentStates(
  database: LocalDatabase,
  saleId: string,
): FiscalDocumentState[] {
  return database
    .prepare<[{ sale_id: string }], { state: FiscalDocumentState }>(
      `SELECT state FROM fiscal_documents WHERE sale_id = @sale_id
       UNION ALL
       SELECT 'AUTHORIZED' AS state FROM offline_fiscal_documents WHERE sale_id = @sale_id`,
    )
    .all({ sale_id: saleId })
    .map(({ state }) => state);
}
