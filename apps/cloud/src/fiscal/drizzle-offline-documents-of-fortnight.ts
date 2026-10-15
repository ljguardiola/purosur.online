import type {
  Fortnight,
  OfflineDocumentOfFortnight,
  OfflineDocumentsOfFortnight,
} from "@purosur/domain/fiscal/use-cases";
import { and, asc, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { offlineFiscalDocuments } from "../platform/db/schema.js";

export class DrizzleOfflineDocumentsOfFortnight<TQueryResult extends PgQueryResultHKT>
  implements OfflineDocumentsOfFortnight
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  async documentsOn(
    pointOfSaleNumber: number,
    fortnight: Fortnight,
  ): Promise<OfflineDocumentOfFortnight[]> {
    return this.db
      .select({
        documentType: offlineFiscalDocuments.documentType,
        number: offlineFiscalDocuments.number,
        issuedOn: offlineFiscalDocuments.issuedOn,
        generatedAt: offlineFiscalDocuments.generatedAt,
        buyerDocumentType: offlineFiscalDocuments.buyerDocumentType,
        buyerDocumentNumber: offlineFiscalDocuments.buyerDocumentNumber,
        buyerTaxStatusCode: offlineFiscalDocuments.buyerTaxStatusCode,
        total: offlineFiscalDocuments.total,
        netAmount: offlineFiscalDocuments.netAmount,
      })
      .from(offlineFiscalDocuments)
      .where(
        and(
          eq(offlineFiscalDocuments.pointOfSale, pointOfSaleNumber),
          eq(offlineFiscalDocuments.fortnightStart, fortnight.start),
        ),
      )
      .orderBy(asc(offlineFiscalDocuments.documentType), asc(offlineFiscalDocuments.number));
  }
}
