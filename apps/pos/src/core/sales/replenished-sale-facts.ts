import { type SaleLine, type SalePayment, saleUnitOfWeightSource } from "@purosur/domain";
import type { ReplenishedEventSource, SyncedFact } from "@purosur/domain/sync/use-cases";
import {
  approvePendingMercadoPagoPayment,
  insertPaymentRefund,
  insertPendingMercadoPagoPayment,
  markQrPaymentReplaced,
  readPendingMercadoPagoPayment,
} from "../payments/sqlite-sale-payments";
import type { LocalDatabase } from "../platform/local-database";
import { insertCashMovement, readRegisterIdentity } from "../register/sqlite-cash-ledger";
import { addToStockBalance, insertSaleStockMovement } from "../stock/sqlite-stock-ledger";
import {
  advanceOperationCounterTo,
  deleteSaleLine,
  discardOpenSale,
  insertOpenedSale,
  insertSaleLine,
  insertSalePayment,
  markSaleCancelled,
  markSaleCompleted,
  takeOperationNumber,
  updateSaleDiscount,
} from "./sqlite-sale-ledger";

type CompletedSaleFact = Extract<SyncedFact, { kind: "sale_completed" }>["sale"];
type CancelledSaleFact = Extract<SyncedFact, { kind: "sale_cancelled" }>["sale"];
type SaleFact = Extract<
  SyncedFact,
  { kind: "sale_completed" | "sale_cancelled" | "qr_payment_replaced" }
>;
type PaymentFact = CompletedSaleFact["payments"][number];
type LineFact = CompletedSaleFact["lines"][number];

function lineOf(line: LineFact): SaleLine {
  return {
    id: line.id,
    productId: line.productId,
    productName: line.productName,
    saleUnit: saleUnitOfWeightSource(line.weightSource),
    weightSource: line.weightSource,
    quantity: line.quantity,
    listUnitPrice: line.listUnitPrice,
    priceListId: line.priceListId,
    promotions: [],
    manualAdjustment: line.manualAdjustment,
    promotionId: line.promotionId,
    discountAmount: line.discountAmount,
    lineTotal: line.lineTotal,
  };
}

function paymentOf(saleId: string, payment: PaymentFact): SalePayment {
  const common = {
    id: payment.id,
    saleId,
    kind: "SALE",
    amount: payment.amount,
    state: "APPROVED",
    occurredAt: payment.occurredAt,
  } as const;
  switch (payment.method) {
    case "CASH":
      return {
        ...common,
        method: "CASH",
        provider: "NONE",
        ...(payment.tendered === null ? {} : { tendered: payment.tendered }),
      };
    case "QR":
      return { ...common, method: "QR", provider: "MERCADOPAGO_QR" };
    case "POINT":
      return { ...common, method: "POINT", provider: "MERCADOPAGO_POINT" };
    case "TRANSFER":
    case "STANDALONE_TERMINAL": {
      const { authorizedBy, confirmedAt } = payment;
      if (authorizedBy === null || confirmedAt === null) {
        throw new Error(`payment ${payment.id} is confirmed by hand but says nobody confirmed it`);
      }
      return payment.method === "TRANSFER"
        ? { ...common, method: "TRANSFER", provider: "NONE", authorizedBy, confirmedAt }
        : {
            ...common,
            method: "STANDALONE_TERMINAL",
            provider: "EXTERNAL_TERMINAL",
            authorizedBy,
            confirmedAt,
          };
    }
  }
}

function pendingMercadoPagoPaymentOf(
  saleId: string,
  payment: PaymentFact & { method: "QR" | "POINT" },
): PendingMercadoPagoSalePayment {
  const common = {
    id: payment.id,
    saleId,
    kind: "SALE",
    state: "PENDING",
    amount: payment.amount,
    occurredAt: payment.occurredAt,
    waitEndsAt: payment.occurredAt,
  } as const;
  return payment.method === "QR"
    ? { ...common, method: "QR", provider: "MERCADOPAGO_QR" }
    : { ...common, method: "POINT", provider: "MERCADOPAGO_POINT" };
}

function held(database: LocalDatabase, query: string, id: string): boolean {
  return database.prepare(query).get(id) !== undefined;
}

function discardOtherOpenSales(
  database: LocalDatabase,
  sale: CompletedSaleFact | CancelledSaleFact,
) {
  const others = database
    .prepare<[string, string], { id: string }>(
      "SELECT id FROM sales WHERE session_id = ? AND state = 'OPEN' AND id <> ?",
    )
    .all(sale.sessionId, sale.id);
  for (const { id } of others) {
    discardOpenSale(database, id);
  }
}

function replenishPayment(database: LocalDatabase, saleId: string, payment: PaymentFact): void {
  const recorded = database
    .prepare<[string], { state: string }>("SELECT state FROM payment_transactions WHERE id = ?")
    .get(payment.id);
  if (recorded === undefined && (payment.method === "QR" || payment.method === "POINT")) {
    insertPendingMercadoPagoPayment(database, pendingMercadoPagoPaymentOf(saleId, payment));
    approvePendingMercadoPagoPayment(database, payment.id);
  } else if (recorded === undefined) {
    insertSalePayment(database, paymentOf(saleId, payment));
  } else if (recorded.state === "PENDING") {
    approvePendingMercadoPagoPayment(database, payment.id);
  }
}

// An open sale the snapshot holds is rebuilt from the fact, keeping the payments and cash
// movements it already holds; answers false for a sale the snapshot already closed.
function holdOpenSale(
  database: LocalDatabase,
  sale: CompletedSaleFact | CancelledSaleFact,
  source: ReplenishedEventSource,
): boolean {
  const recorded = database
    .prepare<[string], { state: string }>("SELECT state FROM sales WHERE id = ?")
    .get(sale.id);
  if (recorded !== undefined && recorded.state !== "OPEN") {
    return false;
  }
  const identity = readRegisterIdentity(database);
  if (identity === undefined) {
    throw new Error("the register has no identity");
  }
  discardOtherOpenSales(database, sale);
  if (recorded === undefined) {
    insertOpenedSale(database, {
      id: sale.id,
      registerId: identity.registerId,
      deviceId: source.deviceId,
      sessionId: sale.sessionId,
      actorId: sale.actorId,
      state: "OPEN",
    });
  } else {
    const lines = database
      .prepare<[string], { id: string }>("SELECT id FROM sale_lines WHERE sale_id = ?")
      .all(sale.id);
    for (const { id } of lines) {
      deleteSaleLine(database, id);
    }
  }
  for (const line of sale.lines) {
    insertSaleLine(database, sale.id, lineOf(line));
  }
  updateSaleDiscount(database, sale.id, sale.saleDiscount);
  for (const payment of sale.payments) {
    replenishPayment(database, sale.id, payment);
  }
  for (const movement of sale.cashMovements) {
    if (!held(database, "SELECT 1 FROM cash_movements WHERE id = ?", movement.id)) {
      insertCashMovement(database, {
        id: movement.id,
        sessionId: sale.sessionId,
        type: movement.type,
        amount: movement.amount,
        actorId: movement.actorId,
        occurredAt: movement.occurredAt,
        ref: { type: "sale", id: sale.id },
      });
    }
  }
  return true;
}

function completeSale(
  database: LocalDatabase,
  sale: CompletedSaleFact,
  source: ReplenishedEventSource,
): void {
  if (!holdOpenSale(database, sale, source)) {
    return;
  }
  const operationNumber = sale.operationNumber ?? takeOperationNumber(database);
  advanceOperationCounterTo(database, operationNumber);
  markSaleCompleted(database, sale.id, sale.completedAt, operationNumber);
  for (const movement of sale.stockMovements ?? []) {
    if (held(database, "SELECT 1 FROM stock_movements WHERE id = ?", movement.id)) {
      continue;
    }
    insertSaleStockMovement(database, { ...movement, occurredAt: sale.completedAt });
    addToStockBalance(database, movement.productId, movement.delta);
  }
}

function cancelSale(
  database: LocalDatabase,
  sale: CancelledSaleFact,
  source: ReplenishedEventSource,
): void {
  if (!holdOpenSale(database, sale, source)) {
    return;
  }
  for (const refund of sale.refunds) {
    if (!held(database, "SELECT 1 FROM payment_refunds WHERE id = ?", refund.id)) {
      insertPaymentRefund(database, { ...refund, saleId: sale.id });
    }
  }
  markSaleCancelled(database, sale.id, sale.cancelledAt, sale.authorizedBy ?? undefined);
}

function stopFollowingReplacedQrPayment(
  database: LocalDatabase,
  paymentTransactionId: string,
): void {
  const pending = readPendingMercadoPagoPayment(database, paymentTransactionId);
  if (pending !== undefined) {
    markQrPaymentReplaced(database, paymentTransactionId, pending.waitEndsAt);
  }
}

export function applyReplenishedSaleFact(
  database: LocalDatabase,
  fact: SaleFact,
  source: ReplenishedEventSource,
): void {
  switch (fact.kind) {
    case "sale_completed":
      completeSale(database, fact.sale, source);
      break;
    case "sale_cancelled":
      cancelSale(database, fact.sale, source);
      break;
    case "qr_payment_replaced":
      stopFollowingReplacedQrPayment(database, fact.replacement.paymentTransactionId);
      break;
  }
}
