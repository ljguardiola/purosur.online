import type { SaleHistoryDetailOutcome, SalesHistoryOutcome } from "@purosur/contracts";

type SaleHistoryDetail = Extract<SaleHistoryDetailOutcome, { kind: "found" }>["detail"];

import { registerOperationAccess, type SaleComprobante } from "@purosur/domain";
import {
  readSaleHistoryDetail,
  readSalesHistory,
  type SaleVoidability,
} from "@purosur/domain/sales/use-cases";
import { toWireCreditNote } from "../fiscal/wire-credit-note";
import { inArgentinaTime } from "../platform/argentina-time";
import type { LocalDatabase } from "../platform/local-database";
import type { ActionGate } from "../sessions/action-gate";
import { SqliteSignInStore } from "../sessions/sqlite-sign-in-store";
import { SqliteReceiptLedger } from "./sqlite-receipt-ledger";
import { SqliteRegisterSalesHistory } from "./sqlite-register-sales-history";

export interface SalesHistoryRequestDeps {
  database: LocalDatabase;
  gate: ActionGate;
  now: () => Date;
}

export interface SalesHistoryRequest {
  session: "open" | "all";
  state: "all" | "completed" | "in_progress" | "deferred" | "voided";
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

function toWireVoidability(voidability: SaleVoidability): SaleHistoryDetail["voidability"] {
  return voidability.kind === "voidable"
    ? {
        kind: "voidable",
        refunds: voidability.refunds.map(({ sentByCloud, ...refund }) => ({
          ...refund,
          sent_by_cloud: sentByCloud,
        })),
        credit_note_corrects:
          voidability.creditNoteCorrects === null
            ? null
            : {
                point_of_sale: voidability.creditNoteCorrects.pointOfSale,
                number: voidability.creditNoteCorrects.number,
              },
      }
    : voidability;
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
      occurred_at: inArgentinaTime(row.occurredAt),
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
  { database, gate, now }: SalesHistoryRequestDeps,
  saleId: string,
): Promise<SaleHistoryDetailOutcome> {
  const guarded = await gate.run({ kind: "view_sales_history" }, async ({ signedInUserId }) => ({
    outcome: readSaleHistoryDetail(
      {
        history: new SqliteRegisterSalesHistory(database),
        ledger: new SqliteReceiptLedger(database),
        clock: { now },
      },
      { saleId },
    ),
    voidNeedsAuthorization:
      registerOperationAccess(
        { kind: "void_sale" },
        {
          id: signedInUserId,
          access: new SqliteSignInStore(database).activePerson(signedInUserId)?.access,
        },
      ).kind === "needs_authorization",
  }));
  if (guarded.kind !== "performed") {
    return guarded;
  }
  const { outcome, voidNeedsAuthorization } = guarded.result;
  if (outcome.kind === "not_found") {
    return outcome;
  }
  const { detail } = outcome;
  return {
    kind: "found",
    detail: {
      sale_id: detail.saleId,
      occurred_at: inArgentinaTime(detail.occurredAt),
      total: detail.total,
      comprobante: toWireComprobante(detail.comprobante),
      operation_number: detail.operationNumber,
      served_by_first_name: detail.servedByFirstName,
      line_count: detail.lineCount,
      payments: detail.payments,
      state: detail.standing,
      voidability: toWireVoidability(detail.voidability),
      void_authorization_required: voidNeedsAuthorization,
      credit_note: toWireCreditNote(detail.creditNote),
      reprint: detail.reprint,
      next_copy:
        detail.nextCopy.kind === "original"
          ? detail.nextCopy
          : { kind: "duplicate", order_number: detail.nextCopy.orderNumber },
    },
  };
}
