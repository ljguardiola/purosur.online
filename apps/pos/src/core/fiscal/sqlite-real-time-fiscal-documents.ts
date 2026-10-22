import {
  type FacturaC,
  type FiscalDocumentState,
  IN_PROGRESS_FISCAL_DOCUMENT_STATES,
  type OutboxEventDraft,
  type PushedEvent,
  SALE_COMPLETED_EVENT_TYPE,
} from "@purosur/domain";
import type {
  InterruptedRealTimeAuthorization,
  InterruptedRealTimeAuthorizations,
  InterruptedRealTimeAuthorizationsTransaction,
  RealTimeAuthorizationResolved,
  RealTimeFiscalDocuments,
  RequestedFiscalDocument,
  UnclearDocumentSettled,
  UnclearDocumentSettlement,
  UnclearFiscalDocuments,
  WaitingFiscalDocument,
} from "@purosur/domain/fiscal/use-cases";
import type { LocalDatabase } from "../platform/local-database";
import { appendOutboxEvent } from "../sync/sqlite-outbox";
import { insertDeferredSale } from "./sqlite-deferred-sales";

interface WaitingDocumentRow {
  id: string;
  sale_id: string;
  point_of_sale: number;
  number: number;
  issued_on: string;
  document: string;
}

interface RequestedDocumentRow extends WaitingDocumentRow {
  reserved_at: string;
  register_id: string;
  actor_id: string;
}

interface SaleEventRow extends Omit<PushedEvent, "payload"> {
  payload: string;
}

interface RequestingDocumentRow {
  id: string;
  sale_id: string;
  reserved_at: string;
  document: string;
  register_id: string;
  actor_id: string;
}

export class SqliteRealTimeFiscalDocuments
  implements RealTimeFiscalDocuments, InterruptedRealTimeAuthorizations, UnclearFiscalDocuments
{
  private readonly database: LocalDatabase;
  private readonly outboxChainKey: string | undefined;

  constructor(database: LocalDatabase, outboxChainKey?: string) {
    this.database = database;
    this.outboxChainKey = outboxChainKey;
  }

  async waitingDocumentOfSale(saleId: string): Promise<RequestedFiscalDocument | null> {
    const row = this.database
      .prepare<[string], RequestedDocumentRow>(
        `SELECT fiscal_documents.id, fiscal_documents.sale_id, point_of_sale, number, issued_on,
                document, reserved_at, sales.register_id, sales.actor_id
         FROM fiscal_documents JOIN sales ON sales.id = fiscal_documents.sale_id
         WHERE fiscal_documents.sale_id = ? AND fiscal_documents.state = 'REQUESTING'`,
      )
      .get(saleId);
    return row === undefined
      ? null
      : {
          ...this.waitingDocumentOf(row),
          reservedAt: new Date(row.reserved_at),
          origin: { registerId: row.register_id, actorId: row.actor_id },
        };
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
      this.refuseUnlessDocumentOfSale(fiscalDocumentId, saleId);
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

  private refuseUnlessDocumentOfSale(fiscalDocumentId: string, saleId: string): void {
    const document = this.database
      .prepare<[string, string], { id: string }>(
        "SELECT id FROM fiscal_documents WHERE id = ? AND sale_id = ?",
      )
      .get(fiscalDocumentId, saleId);
    if (document === undefined) {
      throw new Error("the fiscal document is not of that sale");
    }
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
        resolve: (resolved) => this.database.transaction(() => this.recordResolution(resolved))(),
      }),
    )();
  }

  async resolve(resolved: RealTimeAuthorizationResolved): Promise<void> {
    this.database.transaction(() => this.recordResolution(resolved))();
  }

  private requestingDocuments(): readonly InterruptedRealTimeAuthorization[] {
    return this.database
      .prepare<string[], RequestingDocumentRow>(
        `SELECT fiscal_documents.id, fiscal_documents.sale_id, reserved_at, document,
                sales.register_id, sales.actor_id
         FROM fiscal_documents JOIN sales ON sales.id = fiscal_documents.sale_id
         WHERE fiscal_documents.state IN (${IN_PROGRESS_FISCAL_DOCUMENT_STATES.map(() => "?").join(", ")})
         ORDER BY reserved_at, fiscal_documents.id`,
      )
      .all(...IN_PROGRESS_FISCAL_DOCUMENT_STATES)
      .map((row) => ({
        fiscalDocumentId: row.id,
        saleId: row.sale_id,
        origin: { registerId: row.register_id, actorId: row.actor_id },
        reservedAt: new Date(row.reserved_at),
        total: (JSON.parse(row.document) as FacturaC).total,
      }));
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
    deferredSale,
  }: RealTimeAuthorizationResolved): void {
    this.refuseUnlessDocumentOfSale(fiscalDocumentId, saleId);
    this.changeState(
      fiscalDocumentId,
      "REQUESTING",
      resolution,
      resolvedAt,
      "the fiscal document is not waiting for an answer",
    );
    if (deferredSale !== null) {
      insertDeferredSale(this.database, deferredSale.sale);
      this.appendOutboxEvent(deferredSale.event);
    }
  }

  private appendOutboxEvent(event: OutboxEventDraft): void {
    if (this.outboxChainKey === undefined) {
      throw new Error("the register has no outbox chain key");
    }
    appendOutboxEvent(this.database, this.outboxChainKey, event);
  }

  private saleCompletedEvent(saleId: string): PushedEvent | null {
    const row = this.database
      .prepare<[string, string], SaleEventRow>(
        `SELECT event_id, device_seq, aggregate_type, aggregate_id, event_type, schema_version,
                payload, occurred_at, actor_id, chain_hmac
           FROM outbox
          WHERE event_type = ? AND aggregate_id = ?`,
      )
      .get(SALE_COMPLETED_EVENT_TYPE, saleId);
    return row === undefined ? null : { ...row, payload: JSON.parse(row.payload) };
  }
}
