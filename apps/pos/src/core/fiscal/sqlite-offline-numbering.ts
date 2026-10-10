import {
  FACTURA_C_DOCUMENT_TYPE,
  nextOfflineNumber,
  type OfflineNumberBlockRange,
} from "@purosur/domain";
import type { LocalDatabase } from "../platform/local-database";

type OfflineDocumentType = typeof FACTURA_C_DOCUMENT_TYPE;

const FISCAL_DOCUMENT_TYPE_OF: Record<OfflineDocumentType, string> = {
  [FACTURA_C_DOCUMENT_TYPE]: "FACTURA_C",
};

export class SqliteOfflineNumbering {
  private readonly database: LocalDatabase;

  constructor(database: LocalDatabase) {
    this.database = database;
  }

  async nextNumber(documentType: OfflineDocumentType): Promise<number | null> {
    const pointOfSale = this.database
      .prepare<[], { point_of_sale_number: number }>(
        "SELECT point_of_sale_number FROM register_offline_point_of_sale",
      )
      .get()?.point_of_sale_number;
    if (pointOfSale === undefined) {
      return null;
    }
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
      .get(pointOfSale, FISCAL_DOCUMENT_TYPE_OF[documentType]);
    return nextOfflineNumber(blocks, lastUsed?.last_number ?? null);
  }
}
