import type { SaleHistoryDetailOutcome, SalesHistoryOutcome } from "@purosur/contracts";
import type { SaleComprobante } from "@purosur/domain";
import { readSaleHistoryDetail, readSalesHistory } from "@purosur/domain/sales/use-cases";
import type { LocalDatabase } from "../platform/local-database";
import type { ActionGate } from "../sessions/action-gate";
import { SqliteReceiptLedger } from "./sqlite-receipt-ledger";
import { SqliteRegisterSalesHistory } from "./sqlite-register-sales-history";

export interface SalesHistoryRequestDeps {
  database: LocalDatabase;
  gate: ActionGate;
}

export interface SalesHistoryRequest {
  session: "open" | "all";
  state: "all" | "completed" | "in_progress" | "deferred";
  page: number;
}

function toWireComprobante(comprobante: SaleComprobante) {
  return comprobante.kind === "fiscal"
    ? {
        kind: comprobante.kind,
        document_type: comprobante.documentType,
        point_of_sale: comprobante.pointOfSale,
        number: comprobante.number,
      }
    : comprobante;
}

export async function salesHistoryFor(
  { database, gate }: SalesHistoryRequestDeps,
  { session, state, page }: SalesHistoryRequest,
): Promise<SalesHistoryOutcome> {
  const guarded = await gate.run({ kind: "view_sales_history" }, async () =>
    readSalesHistory(
      { history: new SqliteRegisterSalesHistory(database) },
      { session, standing: state === "all" ? undefined : state, page },
    ),
  );
  if (guarded.kind !== "performed") {
    return guarded;
  }
  const { rows, total, pageSize } = guarded.result;
  return {
    kind: "found",
    rows: rows.map((row) => ({
      sale_id: row.saleId,
      occurred_at: row.occurredAt.toISOString(),
      comprobante: toWireComprobante(row.comprobante),
      operation_number: row.operationNumber,
      payment_methods: row.paymentMethods,
      total: row.total,
      state: row.standing,
    })),
    total,
    page_size: pageSize,
  };
}

export async function saleHistoryDetailFor(
  { database, gate }: SalesHistoryRequestDeps,
  saleId: string,
): Promise<SaleHistoryDetailOutcome> {
  const guarded = await gate.run({ kind: "view_sales_history" }, async () =>
    readSaleHistoryDetail(
      {
        history: new SqliteRegisterSalesHistory(database),
        ledger: new SqliteReceiptLedger(database),
      },
      { saleId },
    ),
  );
  if (guarded.kind !== "performed") {
    return guarded;
  }
  if (guarded.result.kind === "not_found") {
    return guarded.result;
  }
  const { detail } = guarded.result;
  return {
    kind: "found",
    detail: {
      sale_id: detail.saleId,
      occurred_at: detail.occurredAt.toISOString(),
      total: detail.total,
      comprobante: toWireComprobante(detail.comprobante),
      operation_number: detail.operationNumber,
      served_by_first_name: detail.servedByFirstName,
      line_count: detail.lineCount,
      payments: detail.payments,
      state: detail.standing,
      next_copy:
        detail.nextCopy.kind === "original"
          ? detail.nextCopy
          : { kind: "duplicate", order_number: detail.nextCopy.orderNumber },
    },
  };
}
