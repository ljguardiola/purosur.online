import type {
  DeferredSaleCatchUp,
  DeferredSaleCatchUpTransaction,
  DeferredSaleHoldingAuthorizedDocument,
  DeferredSaleSatisfaction,
} from "@purosur/domain/fiscal/use-cases";
import type { LocalDatabase } from "../platform/local-database";
import { appendOutboxEvent } from "../sync/sqlite-outbox";
import { readFiscalOnlineEvidence } from "./sqlite-fiscal-online-evidence";
import { readRealTimeSeries } from "./sqlite-fiscal-series";
import {
  readBuyerTaxStatusSetInEffect,
  readIssuerIdentificationInEffect,
} from "./sqlite-pre-emission-gate";
import { insertFiscalDocumentReservation, upsertClockMark } from "./sqlite-sale-authorization";

interface HoldingRow {
  deferred_sale_id: string;
  sale_id: string;
  register_id: string;
  actor_id: string;
  fiscal_document_id: string;
  point_of_sale: number;
  number: number;
  issued_on: string;
}

export class SqliteDeferredSaleCatchUp implements DeferredSaleCatchUp {
  private readonly database: LocalDatabase;
  private readonly outboxChainKey: string | undefined;

  constructor(database: LocalDatabase, outboxChainKey?: string) {
    this.database = database;
    this.outboxChainKey = outboxChainKey;
  }

  transaction<TOutcome>(work: (tx: DeferredSaleCatchUpTransaction) => TOutcome): TOutcome {
    return this.database.transaction(() =>
      work({
        realTimeSeries: () => readRealTimeSeries(this.database),
        fiscalOnlineEvidence: () => readFiscalOnlineEvidence(this.database),
        issuerIdentification: () => readIssuerIdentificationInEffect(this.database),
        buyerTaxStatuses: () => readBuyerTaxStatusSetInEffect(this.database),
        awaitsRestoredNumbering: () => this.awaitsRestoredNumbering(),
        deferredSalesHoldingAuthorizedDocument: () => this.deferredSalesHoldingAuthorizedDocument(),
        satisfyDeferredSale: (satisfaction) => this.satisfyDeferredSale(satisfaction),
        reserveFiscalDocument: (reservation) =>
          insertFiscalDocumentReservation(this.database, reservation),
        recordClockMark: (mark) => upsertClockMark(this.database, mark),
      }),
    )();
  }

  private awaitsRestoredNumbering(): boolean {
    return (
      this.database
        .prepare<[], { awaiting: 1 }>(
          `SELECT 1 AS awaiting FROM awaiting_restored_numbering
           JOIN register_point_of_sale USING (register_id) LIMIT 1`,
        )
        .get() !== undefined
    );
  }

  private deferredSalesHoldingAuthorizedDocument(): readonly DeferredSaleHoldingAuthorizedDocument[] {
    return this.database
      .prepare<[], HoldingRow>(
        `SELECT deferred_sales.id AS deferred_sale_id, deferred_sales.sale_id,
                sales.register_id, sales.actor_id, fiscal_documents.id AS fiscal_document_id,
                fiscal_documents.point_of_sale, fiscal_documents.number, fiscal_documents.issued_on
         FROM deferred_sales
         JOIN sales ON sales.id = deferred_sales.sale_id
         JOIN fiscal_documents ON fiscal_documents.sale_id = deferred_sales.sale_id
           AND fiscal_documents.state = 'AUTHORIZED'
         WHERE deferred_sales.satisfied_at IS NULL AND deferred_sales.cancelled_at IS NULL
         ORDER BY deferred_sales.occurred_at, deferred_sales.routed_at, deferred_sales.id`,
      )
      .all()
      .map((row) => ({
        deferredSaleId: row.deferred_sale_id,
        saleId: row.sale_id,
        origin: { registerId: row.register_id, actorId: row.actor_id },
        fiscalDocumentId: row.fiscal_document_id,
        pointOfSale: row.point_of_sale,
        number: row.number,
        issuedOn: row.issued_on,
      }));
  }

  private satisfyDeferredSale({
    saleId,
    fiscalDocumentId,
    satisfiedAt,
    event,
  }: DeferredSaleSatisfaction): void {
    if (this.outboxChainKey === undefined) {
      throw new Error("the register has no outbox chain key");
    }
    const { changes } = this.database
      .prepare(
        `UPDATE deferred_sales
         SET satisfied_by_fiscal_document_id = @document_id, satisfied_at = @satisfied_at
         WHERE sale_id = @sale_id AND satisfied_at IS NULL AND cancelled_at IS NULL`,
      )
      .run({
        document_id: fiscalDocumentId,
        satisfied_at: satisfiedAt.toISOString(),
        sale_id: saleId,
      });
    if (changes !== 1) {
      throw new Error("the sale has no deferred record");
    }
    appendOutboxEvent(this.database, this.outboxChainKey, event);
  }
}
