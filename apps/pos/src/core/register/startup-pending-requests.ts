import type { StartupPending } from "@purosur/contracts";
import { readUnknownFiscalDocuments } from "@purosur/domain/fiscal/use-cases";
import {
  readPaidOrdersWithoutSale,
  readPendingMercadoPagoPayments,
} from "@purosur/domain/payments/use-cases";
import { readSalesToPrintAtStartup } from "@purosur/domain/sales/use-cases";
import { SqliteCompletedSaleFiscalDocuments } from "../fiscal/sqlite-completed-sale-fiscal-documents";
import type { PaidOrderDiscoveryState } from "../payments/paid-order-discovery-wiring";
import { SqliteLocalPaidOrders } from "../payments/sqlite-local-paid-orders";
import { SqliteMercadoPagoPayments } from "../payments/sqlite-mercado-pago-payments";
import type { LocalDatabase } from "../platform/local-database";
import { SqliteStartupSales } from "../sales/sqlite-startup-sales";
import type { ActionGate } from "../sessions/action-gate";

export type StartupPendingAnswer = StartupPending | "not_permitted";

export async function startupPendingFor({
  database,
  gate,
  paidOrderDiscovery,
}: {
  database: LocalDatabase;
  gate: ActionGate;
  paidOrderDiscovery: () => PaidOrderDiscoveryState;
}): Promise<StartupPendingAnswer> {
  const guarded = await gate.run({ kind: "sell" }, async () => {
    const { paidOrders, sellingBlocked } = readPaidOrdersWithoutSale({
      local: new SqliteLocalPaidOrders({ database }),
    });
    return {
      sales_to_print: readSalesToPrintAtStartup({ sales: new SqliteStartupSales(database) }).map(
        ({ saleId, completedAt, total, standing }) => ({
          sale_id: saleId,
          completed_at: completedAt.toISOString(),
          total,
          standing,
        }),
      ),
      unknown_fiscal_documents: readUnknownFiscalDocuments({
        documents: new SqliteCompletedSaleFiscalDocuments(database),
      }).map(({ id, saleId, completedAt, total }) => ({
        id,
        sale_id: saleId,
        completed_at: completedAt.toISOString(),
        total,
      })),
      pending_payments: readPendingMercadoPagoPayments({
        payments: new SqliteMercadoPagoPayments(database),
      }).map(({ paymentId, saleId, method, amount, occurredAt }) => ({
        payment_id: paymentId,
        sale_id: saleId,
        method,
        amount,
        occurred_at: occurredAt.toISOString(),
      })),
      paid_orders_without_sale: paidOrders.map(
        ({ paymentTransactionId, saleId, method, amount, createdAt }) => ({
          payment_transaction_id: paymentTransactionId,
          sale_id: saleId,
          method,
          amount,
          created_at: createdAt.toISOString(),
        }),
      ),
      paid_order_discovery: paidOrderDiscovery(),
      selling_blocked: sellingBlocked,
    };
  });
  return guarded.kind === "performed" ? guarded.result : "not_permitted";
}
