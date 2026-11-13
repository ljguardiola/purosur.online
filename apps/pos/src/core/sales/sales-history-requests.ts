import type { SaleHistoryDetailOutcome, SalesHistoryOutcome } from "@purosur/contracts";

type SaleHistoryDetail = Extract<SaleHistoryDetailOutcome, { kind: "found" }>["detail"];

import {
  registerOperationAccess,
  type SaleComprobante,
  type ZoneRulesSource,
} from "@purosur/domain";
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
import { toWireCopy } from "./wire-receipt-copy";

export interface SalesHistoryRequestDeps {
  database: LocalDatabase;
  gate: ActionGate;
  zoneRules: ZoneRulesSource;
}

export interface SalesHistoryRequest {
  session: "open" | "all";
  page: number;
  document: { pointOfSale: number | null; number: number } | null;
}

export function toWireComprobante(comprobante: SaleComprobante) {
  return comprobante.kind === "fiscal"
    ? {
        kind: comprobante.kind,
        document_type: comprobante.documentType,
        authorization: comprobante.authorization,
        point_of_sale: comprobante.pointOfSale,
        number: comprobante.number,
      }
    : comprobante;
}

function toWireVoidability(voidability: SaleVoidability): SaleHistoryDetail["voidability"] {
  return voidability.kind === "voidable"
    ? {
        kind: "voidable",
        refunds: voidability.refunds.map(({ cardType, ...refund }) => ({
          ...refund,
          card_type: cardType,
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
  { database, gate, zoneRules }: SalesHistoryRequestDeps,
  { session, page, document }: SalesHistoryRequest,
): Promise<SalesHistoryOutcome> {
  const guarded = await gate.run({ kind: "view_sales_history" }, async () =>
    readSalesHistory(
      { history: new SqliteRegisterSalesHistory(database) },
      {
        session,
        page,
        ...(document === null ? {} : { document }),
      },
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
      occurred_at: inArgentinaTime(row.occurredAt, zoneRules.zoneRules()),
      comprobante: toWireComprobante(row.comprobante),
      payment_methods: row.paymentMethods,
      total: row.total,
      state: row.standing,
    })),
    total,
    page_size: pageSize,
  };
}

export async function saleHistoryDetailFor(
  { database, gate, zoneRules }: SalesHistoryRequestDeps,
  saleId: string,
): Promise<SaleHistoryDetailOutcome> {
  const guarded = await gate.run({ kind: "view_sales_history" }, async ({ signedInUserId }) => {
    const person = {
      id: signedInUserId,
      access: new SqliteSignInStore(database).activePerson(signedInUserId)?.access,
    };
    return {
      outcome: readSaleHistoryDetail(
        {
          history: new SqliteRegisterSalesHistory(database),
          ledger: new SqliteReceiptLedger(database),
        },
        { saleId },
      ),
      voidNeedsAuthorization:
        registerOperationAccess({ kind: "void_sale" }, person).kind === "needs_authorization",
      reprintNeedsAuthorization:
        registerOperationAccess({ kind: "reprint_receipt" }, person).kind === "needs_authorization",
    };
  });
  if (guarded.kind !== "performed") {
    return guarded;
  }
  const { outcome, voidNeedsAuthorization, reprintNeedsAuthorization } = guarded.result;
  if (outcome.kind === "not_found") {
    return outcome;
  }
  const { detail } = outcome;
  return {
    kind: "found",
    detail: {
      sale_id: detail.saleId,
      occurred_at: inArgentinaTime(detail.occurredAt, zoneRules.zoneRules()),
      total: detail.total,
      comprobante: toWireComprobante(detail.comprobante),
      operation_number: detail.operationNumber,
      served_by_first_name: detail.servedByFirstName,
      lines: detail.lines.map(({ productName, saleUnit, quantity, lineTotal }) => ({
        product_name: productName,
        sale_unit: saleUnit,
        quantity,
        line_total: lineTotal,
      })),
      cash_rounding: detail.cashRounding,
      payments: detail.payments.map(({ cardType, ...payment }) => ({
        ...payment,
        card_type: cardType,
      })),
      state: detail.standing,
      voidability: toWireVoidability(detail.voidability),
      void_authorization_required: voidNeedsAuthorization,
      reprint_authorization_required: reprintNeedsAuthorization,
      credit_notes: detail.creditNotes.map((creditNote) => ({
        credit_note_id: creditNote.creditNoteId,
        origin: creditNote.origin,
        standing: toWireCreditNote(creditNote.standing),
        next_copy: creditNote.nextCopy === null ? null : toWireCopy(creditNote.nextCopy),
      })),
      reprint: detail.reprint,
      next_copy: toWireCopy(detail.nextCopy),
      deferred_invoice_next_copy:
        detail.deferredInvoiceNextCopy === null ? null : toWireCopy(detail.deferredInvoiceNextCopy),
      short_code: detail.shortCode,
    },
  };
}
