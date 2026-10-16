import {
  isRefundSentByCloud,
  type ManualAdjustment,
  SALE_VOIDED_REFUND_ORIGIN,
  type SaleDiscount,
} from "@purosur/domain";
import type { SyncedFact } from "@purosur/domain/sync/use-cases";
import { and, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import {
  cashMovements,
  paymentRefunds,
  saleLines,
  salePayments,
  sales,
} from "../platform/db/schema.js";
import type { AppliedOrigin } from "../register/drizzle-applied-cash-sessions.js";

type AppliedSale = Extract<SyncedFact, { kind: "sale_completed" | "sale_cancelled" }>["sale"];
type VoidedSale = Extract<SyncedFact, { kind: "sale_voided" }>["sale"];

function manualAdjustmentColumns(adjustment: ManualAdjustment | null) {
  if (adjustment === null) {
    return {
      manualAdjustmentKind: null,
      manualAdjustmentValue: null,
      manualAdjustmentReason: null,
      manualAdjustmentAuthorizedBy: null,
    };
  }
  const columns = {
    manualAdjustmentKind: adjustment.kind,
    manualAdjustmentReason: adjustment.reason,
    manualAdjustmentAuthorizedBy: adjustment.authorizedBy,
  };
  switch (adjustment.kind) {
    case "PRICE":
      return { ...columns, manualAdjustmentValue: adjustment.unitPrice };
    case "PERCENT":
      return { ...columns, manualAdjustmentValue: adjustment.percent };
    case "AMOUNT":
      return { ...columns, manualAdjustmentValue: adjustment.amount };
  }
}

function saleDiscountColumns(discount: SaleDiscount | null, amount: number) {
  if (discount === null) {
    return {
      saleDiscountKind: null,
      saleDiscountValue: null,
      saleDiscountAmount: null,
      saleDiscountReason: null,
      saleDiscountAuthorizedBy: null,
    };
  }
  return {
    saleDiscountKind: discount.kind,
    saleDiscountValue: discount.kind === "PERCENT" ? discount.percent : discount.amount,
    saleDiscountAmount: amount,
    saleDiscountReason: discount.reason,
    saleDiscountAuthorizedBy: discount.authorizedBy,
  };
}

async function recordSaleParts<TQueryResult extends PgQueryResultHKT>(
  tx: PgDatabase<TQueryResult>,
  sale: AppliedSale,
  refundAuthorizedBy: string | null,
  originEventId: string | null,
): Promise<void> {
  const { lines, payments, cashMovements: movements } = sale;
  if (lines.length > 0) {
    await tx.insert(saleLines).values(
      lines.map(({ manualAdjustment, ...line }) => ({
        ...line,
        ...manualAdjustmentColumns(manualAdjustment),
        saleId: sale.id,
      })),
    );
  }
  await tx
    .insert(salePayments)
    .values(payments.map((payment) => ({ ...payment, saleId: sale.id })));
  if ("refunds" in sale) {
    await tx.insert(paymentRefunds).values(
      sale.refunds.map((refund) => ({
        ...refund,
        saleId: sale.id,
        paymentTransactionId: refund.method === "QR" ? refund.paymentId : null,
        originEventId,
      })),
    );
  }
  if (movements.length > 0) {
    await tx.insert(cashMovements).values(
      movements.map((movement) => ({
        ...movement,
        sessionId: sale.sessionId,
        reason: null,
        refType: "sale",
        refId: sale.id,
        authorizedBy: movement.type === "REFUND" ? refundAuthorizedBy : null,
      })),
    );
  }
}

export async function recordAppliedSale<TQueryResult extends PgQueryResultHKT>(
  tx: PgDatabase<TQueryResult>,
  origin: AppliedOrigin,
  { sale }: Extract<SyncedFact, { kind: "sale_completed" }>,
  appliedAt: Date,
): Promise<void> {
  const {
    lines: _lines,
    payments: _payments,
    cashMovements: _movements,
    stockMovements: _stockMovements,
    saleDiscount,
    saleDiscountAmount,
    ...header
  } = sale;
  await tx.insert(sales).values({
    ...origin,
    ...header,
    ...saleDiscountColumns(saleDiscount, saleDiscountAmount),
    state: "COMPLETED",
    appliedAt,
  });
  await recordSaleParts(tx, sale, null, null);
}

export async function recordAppliedCancelledSale<TQueryResult extends PgQueryResultHKT>(
  tx: PgDatabase<TQueryResult>,
  origin: AppliedOrigin,
  { sale }: Extract<SyncedFact, { kind: "sale_cancelled" }>,
  eventId: string,
  appliedAt: Date,
): Promise<void> {
  await tx.insert(sales).values({
    ...origin,
    id: sale.id,
    sessionId: sale.sessionId,
    actorId: sale.actorId,
    total: sale.total,
    ...saleDiscountColumns(sale.saleDiscount, sale.saleDiscountAmount),
    state: "CANCELLED",
    cancelledAt: sale.cancelledAt,
    cancellationAuthorizedBy: sale.authorizedBy,
    appliedAt,
  });
  await recordSaleParts(tx, sale, sale.authorizedBy, eventId);
}

export async function recordAppliedVoidedSale<TQueryResult extends PgQueryResultHKT>(
  tx: PgDatabase<TQueryResult>,
  { registerId }: AppliedOrigin,
  { sale }: Extract<SyncedFact, { kind: "sale_voided" }>,
  eventId: string,
): Promise<void> {
  const [voided] = await tx
    .update(sales)
    .set({ state: "VOIDED", voidedAt: sale.voidedAt, voidAuthorizedBy: sale.authorizedBy })
    .where(
      and(
        eq(sales.id, sale.id),
        eq(sales.registerId, registerId),
        eq(sales.sessionId, sale.sessionId),
        eq(sales.state, "COMPLETED"),
      ),
    )
    .returning({ id: sales.id });
  if (!voided) {
    throw new Error(`sale ${sale.id} is not a completed sale of cash session ${sale.sessionId}`);
  }
  await tx.insert(paymentRefunds).values(
    sale.refunds.map((refund) => {
      const sentByCloud = isRefundSentByCloud({
        method: refund.method,
        origin: SALE_VOIDED_REFUND_ORIGIN,
      });
      return {
        ...refund,
        saleId: sale.id,
        paymentTransactionId: sentByCloud ? refund.paymentId : null,
        originEventId: eventId,
        origin: SALE_VOIDED_REFUND_ORIGIN,
        confirmedBy: sentByCloud ? (sale.authorizedBy ?? sale.actorId) : null,
        confirmedAt: sentByCloud ? sale.voidedAt : null,
      };
    }),
  );
  await recordVoidedSaleCashMovements(tx, sale);
}

async function recordVoidedSaleCashMovements<TQueryResult extends PgQueryResultHKT>(
  tx: PgDatabase<TQueryResult>,
  sale: VoidedSale,
): Promise<void> {
  if (sale.cashMovements.length === 0) {
    return;
  }
  await tx
    .insert(cashMovements)
    .values(
      sale.cashMovements.map((movement) => ({
        ...movement,
        sessionId: sale.sessionId,
        reason: null,
        refType: "sale",
        refId: sale.id,
        authorizedBy: movement.type === "REFUND" ? sale.authorizedBy : null,
      })),
    )
    .onConflictDoNothing({ target: cashMovements.id });
}
