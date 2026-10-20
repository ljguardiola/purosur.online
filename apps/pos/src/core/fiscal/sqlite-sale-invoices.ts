import type { FiscalDocumentState, SaleInvoice } from "@purosur/domain";
import type { LocalDatabase } from "../platform/local-database";

interface InvoiceRow {
  origin: SaleInvoice["origin"];
  state: FiscalDocumentState;
  point_of_sale: number;
  number: number;
  document: string;
}

export function readSaleInvoices(database: LocalDatabase, saleId: string): SaleInvoice[] {
  return database
    .prepare<[{ sale_id: string }], InvoiceRow>(
      `SELECT 'real_time' AS origin, state, point_of_sale, number, document
         FROM fiscal_documents WHERE sale_id = @sale_id
       UNION ALL
       SELECT 'offline' AS origin, 'AUTHORIZED' AS state, point_of_sale, number, document
         FROM offline_fiscal_documents WHERE sale_id = @sale_id`,
    )
    .all({ sale_id: saleId })
    .map(({ origin, state, point_of_sale, number, document }) => ({
      origin,
      state,
      pointOfSale: point_of_sale,
      number,
      buyerTaxStatusCode: (JSON.parse(document) as { buyerTaxStatusCode: number })
        .buyerTaxStatusCode,
    }));
}
