import type { OfflineSeriesDocumentType } from "../../fiscal/index.js";
import type { SyncedFact } from "../../sync/index.js";
import type { ContingencyBackupOperation } from "./contingency-backup-ticket.js";

type RelevantFactKind = "sale_completed" | "offline_fiscal_document_issued";

export type RescuedTicketFact =
  | { kind: "sale_completed"; sale: { total: number } }
  | {
      kind: "offline_fiscal_document_issued";
      document: { pointOfSale: number; documentType: OfflineSeriesDocumentType; number: number };
    }
  | { kind: Exclude<SyncedFact["kind"], RelevantFactKind> };

export interface RescuedTicketVoucher {
  pointOfSale: number;
  documentType: OfflineSeriesDocumentType;
  number: number;
}

export interface RescuedTicketSummary {
  operation: ContingencyBackupOperation | null;
  occurredAt: string | null;
  vouchers: RescuedTicketVoucher[];
  saleTotal: number | null;
}

const OPERATION_OF_FACT: Partial<Record<RescuedTicketFact["kind"], ContingencyBackupOperation>> = {
  sale_completed: "sale",
  sale_cancelled: "paid_sale_cancellation",
  sale_voided: "sale_void",
  cash_movement_recorded: "cash_movement",
  cash_session_opened: "cash_session_opening",
  cash_session_closed: "cash_session_closing",
  opening_count_recorded: "initial_count",
  opening_count_withdrawn: "initial_count",
  clock_corrected: "clock_correction",
  reprint_recorded: "reprint",
};

export function rescuedTicketSummary(
  events: readonly { occurred_at: string }[],
  facts: readonly RescuedTicketFact[],
): RescuedTicketSummary {
  const operation =
    facts.map((fact) => OPERATION_OF_FACT[fact.kind]).find((found) => found !== undefined) ?? null;
  const occurredAt =
    events
      .map((event) => event.occurred_at)
      .sort((first, second) => Date.parse(first) - Date.parse(second))[0] ?? null;
  const vouchers: RescuedTicketVoucher[] = [];
  let saleTotal: number | null = null;
  for (const fact of facts) {
    if (fact.kind === "offline_fiscal_document_issued") {
      const { pointOfSale, documentType, number } = fact.document;
      vouchers.push({ pointOfSale, documentType, number });
    } else if (fact.kind === "sale_completed" && saleTotal === null) {
      saleTotal = fact.sale.total;
    }
  }
  return { operation, occurredAt, vouchers, saleTotal };
}
