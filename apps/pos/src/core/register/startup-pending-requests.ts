import type { StartupPending } from "@purosur/contracts";
import type { PaidOrderDiscoveryState, ZoneRulesSource } from "@purosur/domain";
import { readUnknownFiscalDocuments } from "@purosur/domain/fiscal/use-cases";
import {
  readPaidOrdersWithoutSale,
  readPendingMercadoPagoPayments,
} from "@purosur/domain/payments/use-cases";
import { readSalesToPrintAtStartup } from "@purosur/domain/sales/use-cases";
import { SqliteCompletedSaleFiscalDocuments } from "../fiscal/sqlite-completed-sale-fiscal-documents";
import { SqliteLocalPaidOrders } from "../payments/sqlite-local-paid-orders";
import { SqliteMercadoPagoPayments } from "../payments/sqlite-mercado-pago-payments";
import { inArgentinaTime } from "../platform/argentina-time";
import type { LocalDatabase } from "../platform/local-database";
import { readOpenSale } from "../sales/sqlite-open-sale";
import { SqliteStartupSales } from "../sales/sqlite-startup-sales";
import type { ActionGate } from "../sessions/action-gate";
import { readOpenSession } from "./sqlite-cash-ledger";

export type StartupPendingAnswer = StartupPending | "not_permitted";

export async function startupPendingFor({
  database,
  gate,
  paidOrderDiscovery,
  zoneRules,
}: {
  database: LocalDatabase;
  gate: ActionGate;
  paidOrderDiscovery: () => PaidOrderDiscoveryState;
  zoneRules: ZoneRulesSource;
}): Promise<StartupPendingAnswer> {
  const guarded = await gate.run({ kind: "sell" }, async () => {
    const rules = zoneRules.zoneRules();
    const session = readOpenSession(database);
    const { paidOrders, sellingBlocked, mayGoSelling } = readPaidOrdersWithoutSale(
      { local: new SqliteLocalPaidOrders({ database }) },
      {
        openSale: session !== undefined && readOpenSale(database, session.id) !== undefined,
        discovery: paidOrderDiscovery(),
      },
    );
    return {
      sales_to_print: readSalesToPrintAtStartup({ sales: new SqliteStartupSales(database) }).map(
        ({ saleId, completedAt, total, standing }) => ({
          sale_id: saleId,
          completed_at: inArgentinaTime(completedAt, rules),
          total,
          standing,
        }),
      ),
      unknown_fiscal_documents: readUnknownFiscalDocuments({
        documents: new SqliteCompletedSaleFiscalDocuments(database),
      }).map(({ id, saleId, completedAt, total }) => ({
        id,
        sale_id: saleId,
        completed_at: inArgentinaTime(completedAt, rules),
        total,
      })),
      pending_payments: readPendingMercadoPagoPayments({
        payments: new SqliteMercadoPagoPayments(database),
      }).map(({ paymentId, saleId, method, amount, occurredAt }) => ({
        payment_id: paymentId,
        sale_id: saleId,
        method,
        amount,
        occurred_at: inArgentinaTime(occurredAt, rules),
      })),
      paid_orders_without_sale: paidOrders.map(
        ({ paymentTransactionId, saleId, method, amount, createdAt, rebuiltSaleId }) => ({
          payment_transaction_id: paymentTransactionId,
          sale_id: saleId,
          method,
          amount,
          created_at: inArgentinaTime(createdAt, rules),
          rebuilt_sale_id: rebuiltSaleId ?? null,
        }),
      ),
      paid_order_discovery: paidOrderDiscovery(),
      selling_blocked: sellingBlocked,
      may_go_selling: mayGoSelling,
    };
  });
  return guarded.kind === "performed" ? guarded.result : "not_permitted";
}
