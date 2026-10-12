import type { ManualAdjustment, SaleDiscount } from "@purosur/domain";
import type { SyncedFact } from "@purosur/domain/sync/use-cases";
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
    await tx
      .insert(paymentRefunds)
      .values(sale.refunds.map((refund) => ({ ...refund, saleId: sale.id })));
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
  await recordSaleParts(tx, sale, null);
}

export async function recordAppliedCancelledSale<TQueryResult extends PgQueryResultHKT>(
  tx: PgDatabase<TQueryResult>,
  origin: AppliedOrigin,
  { sale }: Extract<SyncedFact, { kind: "sale_cancelled" }>,
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
  await recordSaleParts(tx, sale, sale.authorizedBy);
}
