import { type FacturaC, type PushedEvent, SALE_COMPLETED_EVENT_TYPE } from "@purosur/domain";
import type {
  RealTimeAuthorizationResolved,
  RealTimeFiscalDocuments,
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

export class SqliteRealTimeFiscalDocuments implements RealTimeFiscalDocuments {
  private readonly database: LocalDatabase;

  constructor(database: LocalDatabase) {
    this.database = database;
  }

  async waitingDocument(fiscalDocumentId: string): Promise<WaitingFiscalDocument | null> {
    const row = this.database
      .prepare<[string], WaitingDocumentRow>(
        `SELECT id, sale_id, point_of_sale, number, issued_on, document
         FROM fiscal_documents WHERE id = ? AND state = 'REQUESTING'`,
      )
      .get(fiscalDocumentId);
    if (row === undefined) {
      return null;
    }
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

  async resolve({
    fiscalDocumentId,
    saleId,
    resolution,
    resolvedAt,
  }: RealTimeAuthorizationResolved): Promise<void> {
    this.database.transaction(() => {
      const { changes } = this.database
        .prepare(
          `UPDATE fiscal_documents
           SET state = @state, authorization_code = @authorization_code,
               authorization_code_due_on = @authorization_code_due_on, resolved_at = @resolved_at
           WHERE id = @id AND state = 'REQUESTING'`,
        )
        .run({
          id: fiscalDocumentId,
          state: resolution.state,
          authorization_code:
            resolution.state === "AUTHORIZED" ? resolution.authorizationCode : null,
          authorization_code_due_on:
            resolution.state === "AUTHORIZED" ? resolution.authorizationCodeDueOn : null,
          resolved_at: resolvedAt.toISOString(),
        });
      if (changes !== 1) {
        throw new Error("the fiscal document is not waiting for an answer");
      }
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
    })();
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
