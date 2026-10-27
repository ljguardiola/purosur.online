import type { SaleUnit } from "../../catalog/index.js";
import { compareSpanishText } from "../../shared/index.js";
import type { ReturnDisposition, ReturnReason, TicketSource } from "./return-reasons.js";

export interface ReturnRecordLine {
  saleLineId: string;
  productName: string;
  saleUnit: SaleUnit;
  quantity: number;
  reason: ReturnReason;
  disposition: ReturnDisposition;
  refunded: number;
}

export interface ReturnRecord {
  returnId: string;
  occurredAt: Date;
  ticketSource: TicketSource;
  register: { id: string; name: string };
  sale: {
    id: string;
    operationNumber: number | null;
    invoice: { pointOfSale: number; number: number } | null;
  };
  cashier: { id: string; name: string | null };
  authorizer: { id: string; name: string | null } | null;
  lines: ReturnRecordLine[];
}

export interface ReturnRow extends ReturnRecord {
  refunded: number;
}

export interface ReturnsTotals {
  returns: number;
  refunded: number;
}

export interface ReturnsGroup {
  rows: ReturnRow[];
  totals: ReturnsTotals;
}

function newestFirst(a: ReturnRow, b: ReturnRow): number {
  return (
    b.occurredAt.getTime() - a.occurredAt.getTime() || compareSpanishText(a.returnId, b.returnId)
  );
}

export function returnRows(records: readonly ReturnRecord[]): ReturnRow[] {
  return records
    .map((record) => ({
      ...record,
      refunded: record.lines.reduce((sum, line) => sum + line.refunded, 0),
    }))
    .sort(newestFirst);
}

function groupOf(rows: ReturnRow[]): ReturnsGroup {
  return {
    rows,
    totals: {
      returns: rows.length,
      refunded: rows.reduce((sum, row) => sum + row.refunded, 0),
    },
  };
}

export function returnsReportGroups(records: readonly ReturnRecord[]): {
  typed: ReturnsGroup;
  scanned: ReturnsGroup;
} {
  const rows = returnRows(records);
  return {
    typed: groupOf(rows.filter((row) => row.ticketSource === "TYPED")),
    scanned: groupOf(rows.filter((row) => row.ticketSource === "QR")),
  };
}
