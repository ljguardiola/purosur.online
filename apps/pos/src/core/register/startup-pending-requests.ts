import type { StartupPending } from "@purosur/contracts";
import { readUnknownFiscalDocuments } from "@purosur/domain/fiscal/use-cases";
import { readPendingMercadoPagoPayments } from "@purosur/domain/payments/use-cases";
import { readSalesToPrintAtStartup } from "@purosur/domain/sales/use-cases";
import { SqliteCompletedSaleFiscalDocuments } from "../fiscal/sqlite-completed-sale-fiscal-documents";
import { SqliteMercadoPagoPayments } from "../payments/sqlite-mercado-pago-payments";
import type { LocalDatabase } from "../platform/local-database";
import { SqliteStartupSales } from "../sales/sqlite-startup-sales";
import type { ActionGate } from "../sessions/action-gate";

export type StartupPendingAnswer = StartupPending | "not_permitted";

export async function startupPendingFor({
  database,
  gate,
}: {
  database: LocalDatabase;
  gate: ActionGate;
}): Promise<StartupPendingAnswer> {
  const guarded = await gate.run({ kind: "sell" }, async () => ({
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
  }));
  return guarded.kind === "performed" ? guarded.result : "not_permitted";
}
