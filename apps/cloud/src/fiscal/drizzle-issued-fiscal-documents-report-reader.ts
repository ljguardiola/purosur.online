import { COUNTED_AS_ISSUED_STATE, type IssuedDocumentGroup } from "@purosur/domain";
import type {
  IssuedFiscalDocumentsReportQuery,
  IssuedFiscalDocumentsReportReader,
} from "@purosur/domain/fiscal/use-cases";
import { and, eq, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { issuedDocuments } from "./drizzle-issued-fiscal-documents-reader.js";

export class DrizzleIssuedFiscalDocumentsReportReader<TQueryResult extends PgQueryResultHKT>
  implements IssuedFiscalDocumentsReportReader
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  async issuedGroups({
    locationId,
    range,
    registerId,
  }: IssuedFiscalDocumentsReportQuery): Promise<IssuedDocumentGroup[]> {
    const issued = issuedDocuments(this.db);
    const rows = await this.db
      .select({
        kind: issued.kind,
        voucherType: issued.voucherType,
        pointOfSale: issued.pointOfSale,
        authorizationKind: issued.authorizationKind,
        count: sql<number>`count(*)`.mapWith(Number),
        amount: sql<number>`sum(${issued.total})`.mapWith(Number),
      })
      .from(issued)
      .where(
        and(
          eq(issued.locationId, locationId),
          eq(issued.state, COUNTED_AS_ISSUED_STATE),
          sql`${issued.issuedOn} >= ${range.from}`,
          sql`${issued.issuedOn} <= ${range.to}`,
          registerId === undefined ? undefined : eq(issued.registerId, registerId),
        ),
      )
      .groupBy(issued.kind, issued.voucherType, issued.pointOfSale, issued.authorizationKind);
    return rows.map((row) => ({
      ...row,
      authorizationKind: row.authorizationKind === "caea" ? "caea" : "cae",
    }));
  }
}
