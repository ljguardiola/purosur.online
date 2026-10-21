import type { CashMovement, OutboxEventDraft, SaleVoidCreditNote } from "@purosur/domain";
import type {
  SaleRefund,
  SaleStockMovement,
  SaleToVoid,
  SaleVoidLedger,
  SaleVoidTransaction,
} from "@purosur/domain/sales/use-cases";
import {
  cancelDeferredSale,
  readUncancelledDeferredSaleRecord,
} from "../fiscal/sqlite-deferred-sales";
import { readFiscalOnlineEvidence } from "../fiscal/sqlite-fiscal-online-evidence";
import { readSaleInvoices } from "../fiscal/sqlite-sale-invoices";
import { insertPendingCreditNote } from "../fiscal/sqlite-void-credit-notes";
import { insertPaymentRefund, readRecordedPayments } from "../payments/sqlite-sale-payments";
import type { LocalDatabase } from "../platform/local-database";
import { insertCashMovement, readMovementsOf } from "../register/sqlite-cash-ledger";
import {
  addToStockBalance,
  insertSaleVoidStockMovement,
  readSaleStockMovements,
} from "../stock/sqlite-stock-ledger";
import { appendOutboxEvent } from "../sync/sqlite-outbox";
import { readSale } from "./sqlite-open-sale";

export function markSaleVoided(
  database: LocalDatabase,
  saleId: string,
  voidedAt: Date,
  authorizedBy: string | undefined,
): void {
  const { changes } = database
    .prepare(
      `UPDATE sales
       SET state = 'VOIDED', voided_at = ?, void_authorized_by = ?
       WHERE id = ? AND state = 'COMPLETED'`,
    )
    .run(voidedAt.toISOString(), authorizedBy ?? null, saleId);
  if (changes !== 1) {
    throw new Error("the sale is not completed");
  }
}

export class SqliteSaleVoidLedger implements SaleVoidLedger {
  private readonly database: LocalDatabase;
  private readonly outboxChainKey: string | undefined;

  constructor(database: LocalDatabase, outboxChainKey?: string) {
    this.database = database;
    this.outboxChainKey = outboxChainKey;
  }

  transaction<TOutcome>(work: (tx: SaleVoidTransaction) => TOutcome): TOutcome {
    return this.database.transaction(() => work(this.transactionScope()))();
  }

  private transactionScope(): SaleVoidTransaction {
    return {
      saleToVoid: (saleId) => this.saleToVoid(saleId),
      saleCashMovements: (saleId) => readMovementsOf(this.database, { type: "sale", id: saleId }),
      fiscalOnlineEvidence: () => readFiscalOnlineEvidence(this.database),
      outboxReady: () => this.outboxChainKey !== undefined,
      recordVoidedSale: (saleId, voidedAt, authorizedBy) =>
        markSaleVoided(this.database, saleId, voidedAt, authorizedBy),
      recordRefund: (refund: SaleRefund) => insertPaymentRefund(this.database, refund),
      recordCashMovement: (movement: CashMovement) => insertCashMovement(this.database, movement),
      recordSaleVoidStockMovement: (movement: SaleStockMovement) =>
        insertSaleVoidStockMovement(this.database, movement),
      addToStockBalance: (productId, delta) => addToStockBalance(this.database, productId, delta),
      cancelDeferredSale: (saleId, cancelledAt) =>
        cancelDeferredSale(this.database, saleId, cancelledAt),
      recordPendingCreditNote: (creditNote: SaleVoidCreditNote) =>
        insertPendingCreditNote(this.database, creditNote),
      appendOutboxEvent: (draft: OutboxEventDraft) => this.appendOutboxEvent(draft),
    };
  }

  private saleToVoid(saleId: string): SaleToVoid | undefined {
    const sale = readSale(this.database, saleId);
    if (sale === undefined) {
      return undefined;
    }
    return {
      sale,
      inOpenSession: this.isOpenSession(sale.sessionId),
      payments: readRecordedPayments(this.database, saleId),
      fiscalDocuments: readSaleInvoices(this.database, saleId),
      deferredRecord: readUncancelledDeferredSaleRecord(this.database, saleId),
      stockMovements: readSaleStockMovements(this.database, saleId),
    };
  }

  private isOpenSession(sessionId: string): boolean {
    return (
      this.database
        .prepare<[string], { id: string }>(
          "SELECT id FROM cash_sessions WHERE id = ? AND state = 'OPEN'",
        )
        .get(sessionId) !== undefined
    );
  }

  private appendOutboxEvent(draft: OutboxEventDraft): void {
    if (this.outboxChainKey === undefined) {
      throw new Error("the ledger has no outbox chain key");
    }
    appendOutboxEvent(this.database, this.outboxChainKey, draft);
  }
}
