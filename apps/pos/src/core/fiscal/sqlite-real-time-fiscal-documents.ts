import {
  type FacturaC,
  type FiscalDocumentState,
  IN_PROGRESS_FISCAL_DOCUMENT_STATES,
  type PushedEvent,
  SALE_COMPLETED_EVENT_TYPE,
} from "@purosur/domain";
import type {
  InterruptedRealTimeAuthorization,
  InterruptedRealTimeAuthorizations,
  InterruptedRealTimeAuthorizationsTransaction,
  RealTimeAuthorizationResolved,
  RealTimeFiscalDocuments,
  UnclearDocumentSettled,
  UnclearDocumentSettlement,
  UnclearFiscalDocuments,
  WaitingFiscalDocument,
} from "@purosur/domain/fiscal/use-cases";
import type { LocalDatabase } from "../platform/local-database";

interface WaitingDocumentRow {
  id: string;
  sale_id: string;
  point_of_sale: number;
  number: number;
  issued_on: string;
  document: string;
}

interface SaleEventRow extends Omit<PushedEvent, "payload"> {
  payload: string;
}

interface RequestingDocumentRow {
  id: string;
  sale_id: string;
}

export class SqliteRealTimeFiscalDocuments
  implements RealTimeFiscalDocuments, InterruptedRealTimeAuthorizations, UnclearFiscalDocuments
{
  private readonly database: LocalDatabase;

  constructor(database: LocalDatabase) {
    this.database = database;
  }

  async waitingDocumentOfSale(saleId: string): Promise<WaitingFiscalDocument | null> {
    const row = this.database
      .prepare<[string], WaitingDocumentRow>(
        `SELECT id, sale_id, point_of_sale, number, issued_on, document
         FROM fiscal_documents WHERE sale_id = ? AND state = 'REQUESTING'`,
      )
      .get(saleId);
    return row === undefined ? null : this.waitingDocumentOf(row);
  }

  async unclearDocuments(): Promise<readonly WaitingFiscalDocument[]> {
    return this.database
      .prepare<[], WaitingDocumentRow>(
        `SELECT id, sale_id, point_of_sale, number, issued_on, document
         FROM fiscal_documents WHERE state = 'UNKNOWN' ORDER BY reserved_at, id`,
      )
      .all()
      .map((row) => this.waitingDocumentOf(row));
  }

  async settle({
    fiscalDocumentId,
    saleId,
    settlement,
    settledAt,
  }: UnclearDocumentSettled): Promise<void> {
    this.database.transaction(() => {
      this.changeState(
        fiscalDocumentId,
        "UNKNOWN",
        settlement,
        settledAt,
        "the fiscal document is not unclear",
      );
      this.updateDeferredSale(fiscalDocumentId, saleId, settlement, settledAt);
    })();
  }

  private waitingDocumentOf(row: WaitingDocumentRow): WaitingFiscalDocument {
    return {
      fiscalDocumentId: row.id,
      saleId: row.sale_id,
      pointOfSale: row.point_of_sale,
      number: row.number,
      issuedOn: row.issued_on,
      document: JSON.parse(row.document) as FacturaC,
      saleEvent: this.saleCompletedEvent(row.sale_id),
    };
  }

  private updateDeferredSale(
    fiscalDocumentId: string,
    saleId: string,
    settlement: UnclearDocumentSettlement,
    settledAt: Date,
  ): void {
    if (settlement.state === "AUTHORIZED") {
      this.updateDeferredRecord(
        saleId,
        `satisfied_by_fiscal_document_id = @document_id, satisfied_at = @settled_at`,
        { document_id: fiscalDocumentId, settled_at: settledAt.toISOString() },
      );
    } else if (settlement.state === "REJECTED") {
      this.updateDeferredRecord(saleId, "reason = @reason", { reason: settlement.deferralReason });
    }
  }

  private updateDeferredRecord(
    saleId: string,
    assignments: string,
    values: Record<string, string>,
  ): void {
    const { changes } = this.database
      .prepare(`UPDATE deferred_sales SET ${assignments} WHERE sale_id = @sale_id`)
      .run({ ...values, sale_id: saleId });
    if (changes !== 1) {
      throw new Error("the sale has no deferred record");
    }
  }

  transaction<TOutcome>(
    work: (tx: InterruptedRealTimeAuthorizationsTransaction) => TOutcome,
  ): TOutcome {
    return this.database.transaction(() =>
      work({
        requestingDocuments: () => this.requestingDocuments(),
        resolve: (resolved) => this.recordResolution(resolved),
      }),
    )();
  }

  async resolve(resolved: RealTimeAuthorizationResolved): Promise<void> {
    this.database.transaction(() => this.recordResolution(resolved))();
  }

  private requestingDocuments(): readonly InterruptedRealTimeAuthorization[] {
    return this.database
      .prepare<string[], RequestingDocumentRow>(
        `SELECT id, sale_id FROM fiscal_documents
         WHERE state IN (${IN_PROGRESS_FISCAL_DOCUMENT_STATES.map(() => "?").join(", ")})
         ORDER BY reserved_at, id`,
      )
      .all(...IN_PROGRESS_FISCAL_DOCUMENT_STATES)
      .map((row) => ({ fiscalDocumentId: row.id, saleId: row.sale_id }));
  }

  private changeState(
    fiscalDocumentId: string,
    from: FiscalDocumentState,
    resolution: UnclearDocumentSettlement,
    resolvedAt: Date,
    refusal: string,
  ): void {
    const { changes } = this.database
      .prepare(
        `UPDATE fiscal_documents
         SET state = @state, authorization_code = @authorization_code,
             authorization_code_due_on = @authorization_code_due_on, resolved_at = @resolved_at
         WHERE id = @id AND state = @from`,
      )
      .run({
        id: fiscalDocumentId,
        from,
        state: resolution.state,
        authorization_code: resolution.state === "AUTHORIZED" ? resolution.authorizationCode : null,
        authorization_code_due_on:
          resolution.state === "AUTHORIZED" ? resolution.authorizationCodeDueOn : null,
        resolved_at: resolvedAt.toISOString(),
      });
    if (changes !== 1) {
      throw new Error(refusal);
    }
  }

  private recordResolution({
    fiscalDocumentId,
    saleId,
    resolution,
    resolvedAt,
  }: RealTimeAuthorizationResolved): void {
    this.changeState(
      fiscalDocumentId,
      "REQUESTING",
      resolution,
      resolvedAt,
      "the fiscal document is not waiting for an answer",
    );
    if (resolution.state !== "AUTHORIZED") {
      this.database
        .prepare(
          "INSERT INTO deferred_sales (sale_id, reason, routed_at) VALUES (@sale_id, @reason, @routed_at)",
        )
        .run({
          sale_id: saleId,
          reason: resolution.deferralReason,
          routed_at: resolvedAt.toISOString(),
        });
    }
  }

  private saleCompletedEvent(saleId: string): PushedEvent | null {
    const row = this.database
      .prepare<[string, string], SaleEventRow>(
        `SELECT event_id, device_seq, aggregate_type, aggregate_id, event_type, schema_version,
                payload, occurred_at, actor_id, chain_hmac
           FROM outbox
          WHERE device_id = (SELECT device_id FROM sync_state)
            AND event_type = ? AND aggregate_id = ?`,
      )
      .get(SALE_COMPLETED_EVENT_TYPE, saleId);
    return row === undefined ? null : { ...row, payload: JSON.parse(row.payload) };
  }
}
