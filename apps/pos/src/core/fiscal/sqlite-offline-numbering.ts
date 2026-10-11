import {
  type FACTURA_C_DOCUMENT_TYPE,
  nextOfflineNumber,
  type OfflineNumberBlockRange,
} from "@purosur/domain";
import type { LocalDatabase } from "../platform/local-database";

type OfflineDocumentType = typeof FACTURA_C_DOCUMENT_TYPE;

export class SqliteOfflineNumbering {
  private readonly database: LocalDatabase;

  constructor(database: LocalDatabase) {
    this.database = database;
  }

  async nextNumber(documentType: OfflineDocumentType): Promise<number | null> {
    const offlinePointOfSale = this.database
      .prepare<
        [],
        { point_of_sale_number: number; tax_authority_last_authorized_number: number | null }
      >(
        `SELECT point_of_sale_number, tax_authority_last_authorized_number
         FROM register_offline_point_of_sale`,
      )
      .get();
    if (offlinePointOfSale === undefined) {
      return null;
    }
    const pointOfSale = offlinePointOfSale.point_of_sale_number;
    const blocks = this.database
      .prepare<[number, string], OfflineNumberBlockRange>(
        `SELECT first_number AS firstNumber, last_number AS lastNumber
         FROM offline_number_blocks
         WHERE point_of_sale = ? AND document_type = ?
         ORDER BY first_number`,
      )
      .all(pointOfSale, documentType);
    const lastUsed = this.database
      .prepare<[number, string], { last_number: number | null }>(
        `SELECT max(number) AS last_number FROM fiscal_documents
         WHERE point_of_sale = ? AND document_type = ?`,
      )
      .get(pointOfSale, documentType);
    return nextOfflineNumber({
      blocksInAssignmentOrder: blocks,
      localLastUsed: lastUsed?.last_number ?? null,
      taxAuthorityLastAuthorized: offlinePointOfSale.tax_authority_last_authorized_number,
    });
  }
}
