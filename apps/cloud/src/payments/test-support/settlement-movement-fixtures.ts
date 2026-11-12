import type { SettlementReportRow } from "@purosur/domain/payments/use-cases";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { mercadoPagoSettlementMovements } from "../../platform/db/schema.js";

const MOVEMENT_DATE = new Date("2026-10-09T15:00:00.000Z");

export function settlementRow(overrides: Partial<SettlementReportRow> = {}): SettlementReportRow {
  return {
    sourceId: "PAY1",
    transactionType: "SETTLEMENT",
    transactionDate: MOVEMENT_DATE,
    externalReference: null,
    paymentMethod: "master",
    paymentMethodType: "credit_card",
    grossAmount: 10_000,
    feeAmount: -450,
    financingFeeAmount: 0,
    taxesAmount: -90,
    netAmount: 9_460,
    moneyReleaseDate: null,
    ...overrides,
  };
}

export function accountWithdrawalRow(overrides: Partial<SettlementReportRow> = {}) {
  return settlementRow({
    sourceId: "WITHDRAWAL1",
    paymentMethod: "available_money",
    paymentMethodType: "available_money",
    grossAmount: -9_306_592,
    feeAmount: 0,
    taxesAmount: 0,
    netAmount: -9_306_592,
    ...overrides,
  });
}

export function accountYieldRow(overrides: Partial<SettlementReportRow> = {}) {
  return settlementRow({
    sourceId: "YIELD1",
    paymentMethod: null,
    paymentMethodType: null,
    grossAmount: 1_237,
    feeAmount: 0,
    taxesAmount: 0,
    netAmount: 1_237,
    ...overrides,
  });
}

export function receivedTransferRow(overrides: Partial<SettlementReportRow> = {}) {
  return settlementRow({
    sourceId: "TRANSFER1",
    paymentMethod: null,
    paymentMethodType: null,
    grossAmount: 2_500_000,
    feeAmount: 0,
    taxesAmount: 0,
    netAmount: 2_500_000,
    ...overrides,
  });
}

export async function insertSettlementMovements<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  rows: SettlementReportRow[],
): Promise<void> {
  await db
    .insert(mercadoPagoSettlementMovements)
    .values(rows.map((row) => ({ ...row, recordedAt: MOVEMENT_DATE })));
}
