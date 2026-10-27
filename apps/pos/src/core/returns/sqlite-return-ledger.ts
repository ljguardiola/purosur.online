import type { OutboxEventDraft } from "@purosur/domain";
import type {
  RecordedReturn,
  ReturnCashMovement,
  ReturningSession,
  ReturnLedger,
  ReturnRefund,
  ReturnStockMovement,
  ReturnTransaction,
  SaleReturnSearch,
} from "@purosur/domain/returns/use-cases";
import { insertPaymentRefund } from "../payments/sqlite-sale-payments";
import type { LocalDatabase } from "../platform/local-database";
import { insertCashMovement, readOpenSession } from "../register/sqlite-cash-ledger";
import { addToStockBalance, insertReturnStockMovement } from "../stock/sqlite-stock-ledger";
import { appendOutboxEvent } from "../sync/sqlite-outbox";
import { returnCreditNotePorts } from "./sqlite-return-credit-notes";
import { readGoodConditionReturnDays, readSaleForReturn } from "./sqlite-return-sale-reader";

export function insertReturn(database: LocalDatabase, returned: RecordedReturn): void {
  database
    .prepare(
      `INSERT INTO returns (
         id, sale_id, register_id, device_id, session_id, actor_id, authorized_by, ticket_source,
         occurred_at
       )
       SELECT @id, sales.id, sales.register_id, sales.device_id, @session_id, @actor_id,
              @authorized_by, @ticket_source, @occurred_at
       FROM sales WHERE sales.id = @sale_id`,
    )
    .run({
      id: returned.id,
      sale_id: returned.saleId,
      session_id: returned.sessionId,
      actor_id: returned.actorId,
      authorized_by: returned.authorizedBy,
      ticket_source: returned.ticketSource,
      occurred_at: returned.occurredAt.toISOString(),
    });
  const insertLine = database.prepare(
    `INSERT INTO return_lines (return_id, sale_line_id, quantity, reason, disposition, refunded_amount)
     VALUES (@return_id, @sale_line_id, @quantity, @reason, @disposition, @refunded_amount)`,
  );
  for (const line of returned.lines) {
    insertLine.run({
      return_id: returned.id,
      sale_line_id: line.saleLineId,
      quantity: line.quantity,
      reason: line.reason,
      disposition: line.disposition,
      refunded_amount: line.refundedAmount,
    });
  }
}

export class SqliteReturnLedger implements ReturnLedger {
  private readonly database: LocalDatabase;
  private readonly outboxChainKey: string | undefined;

  constructor(database: LocalDatabase, outboxChainKey?: string) {
    this.database = database;
    this.outboxChainKey = outboxChainKey;
  }

  transaction<TOutcome>(work: (tx: ReturnTransaction) => TOutcome): TOutcome {
    return this.database.transaction(() => work(this.transactionScope()))();
  }

  private transactionScope(): ReturnTransaction {
    return {
      saleForReturn: (search: SaleReturnSearch) => readSaleForReturn(this.database, search),
      goodConditionReturnDays: () => readGoodConditionReturnDays(this.database),
      openSession: (): ReturningSession | undefined => {
        const session = readOpenSession(this.database);
        return (
          session && {
            id: session.id,
            openedBy: session.openedBy,
            registerId: session.registerId,
            deviceId: session.deviceId,
          }
        );
      },
      outboxReady: () => this.outboxChainKey !== undefined,
      recordReturn: (returned: RecordedReturn) => insertReturn(this.database, returned),
      recordRefund: (refund: ReturnRefund) => insertPaymentRefund(this.database, refund),
      recordCashMovement: (movement: ReturnCashMovement) =>
        insertCashMovement(this.database, movement),
      recordReturnStockMovement: (movement: ReturnStockMovement) =>
        insertReturnStockMovement(this.database, movement),
      addToStockBalance: (productId, delta) => addToStockBalance(this.database, productId, delta),
      ...returnCreditNotePorts(this.database),
      appendOutboxEvent: (draft: OutboxEventDraft) => this.appendOutboxEvent(draft),
    };
  }

  private appendOutboxEvent(draft: OutboxEventDraft): void {
    if (this.outboxChainKey === undefined) {
      throw new Error("the ledger has no outbox chain key");
    }
    appendOutboxEvent(this.database, this.outboxChainKey, draft);
  }
}
