import type { DocumentFieldChange } from "@purosur/domain";
import type {
  FortnightReportKey,
  OfflineDocumentOfFortnight,
  RecordedDocumentTypeReport,
  RejectedDocumentRemedyAudit,
  RejectedDocumentRemedyRecord,
  RemedyRejectedDocumentStore,
  RemedyRejectedDocumentStoreTransaction,
} from "@purosur/domain/fiscal/use-cases";
import { and, eq, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import {
  auditLog,
  offlineFiscalDocuments,
  rejectedDocumentRemedies,
} from "../platform/db/schema.js";
import { DrizzleOfflineDocumentsOfFortnight } from "./drizzle-offline-documents-of-fortnight.js";
import { recordedDocumentTypeReports } from "./drizzle-recorded-document-type-reports.js";
import { fortnightReportLock } from "./fortnight-report-lock.js";

const AUDITED_COLUMN: Record<DocumentFieldChange["field"], string> = {
  issuedOn: "issued_on",
  total: "total",
  buyerDocumentType: "buyer_document_type",
  buyerDocumentNumber: "buyer_document_number",
  buyerTaxStatusCode: "buyer_tax_status_code",
};

function auditedValues(
  changes: DocumentFieldChange[],
  side: "before" | "after",
): Record<string, number | string> {
  return Object.fromEntries(changes.map((change) => [AUDITED_COLUMN[change.field], change[side]]));
}

class DrizzleRejectedDocumentRemedyTransaction<TQueryResult extends PgQueryResultHKT>
  implements RemedyRejectedDocumentStoreTransaction
{
  private readonly tx: PgDatabase<TQueryResult>;

  constructor(tx: PgDatabase<TQueryResult>) {
    this.tx = tx;
  }

  async holdFortnightPresentation(key: FortnightReportKey): Promise<void> {
    await this.tx.execute(sql`select pg_advisory_xact_lock(${fortnightReportLock(key)})`);
  }

  async documentTypeReport(
    { pointOfSaleNumber, fortnight }: FortnightReportKey,
    documentType: RecordedDocumentTypeReport["documentType"],
    locationId: string,
  ): Promise<RecordedDocumentTypeReport | null> {
    const reports = await recordedDocumentTypeReports(
      this.tx,
      pointOfSaleNumber,
      fortnight,
      locationId,
    );
    return reports.find((report) => report.documentType === documentType) ?? null;
  }

  documentsOn(
    pointOfSaleNumber: number,
    fortnight: FortnightReportKey["fortnight"],
    locationId: string,
  ): Promise<OfflineDocumentOfFortnight[]> {
    return new DrizzleOfflineDocumentsOfFortnight(this.tx).documentsOn(
      pointOfSaleNumber,
      fortnight,
      locationId,
    );
  }

  async recordRemedy({
    pointOfSaleNumber,
    fortnight,
    documentType,
    number,
    remedy,
    rejectedAt,
    recordedAt,
  }: RejectedDocumentRemedyRecord): Promise<void> {
    await this.tx.insert(rejectedDocumentRemedies).values({
      pointOfSaleNumber,
      fortnightStart: fortnight.start,
      documentType,
      number,
      kind: remedy.kind,
      correction: remedy.kind === "printed" ? remedy.correction : null,
      rejectedAt,
      recordedAt,
    });
  }

  async recordRemedyAudit({
    pointOfSaleNumber,
    fortnight,
    documentType,
    number,
    kind,
    actorId,
    at,
    changes,
  }: RejectedDocumentRemedyAudit): Promise<void> {
    const [document] = await this.tx
      .select({ id: offlineFiscalDocuments.id })
      .from(offlineFiscalDocuments)
      .where(
        and(
          eq(offlineFiscalDocuments.pointOfSale, pointOfSaleNumber),
          eq(offlineFiscalDocuments.fortnightStart, fortnight.start),
          eq(offlineFiscalDocuments.documentType, documentType),
          eq(offlineFiscalDocuments.number, number),
        ),
      );
    if (document === undefined) {
      throw new Error("a remedied document has no offline fiscal document to audit");
    }
    await this.tx.insert(auditLog).values({
      entity: "offline_fiscal_document",
      entityId: document.id,
      actorId,
      previousValue: kind === "printed" ? auditedValues(changes, "before") : null,
      newValue: kind === "printed" ? auditedValues(changes, "after") : { remedy: kind, number },
      at,
    });
  }
}

export class DrizzleRejectedDocumentRemedyStore<TQueryResult extends PgQueryResultHKT>
  implements RemedyRejectedDocumentStore
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  transaction<TOutcome>(
    work: (tx: RemedyRejectedDocumentStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    return this.db.transaction((tx) => work(new DrizzleRejectedDocumentRemedyTransaction(tx)));
  }
}
