import type { SaleUnit } from "../../catalog/index.js";
import { compareCodeUnits } from "../../shared/index.js";
import type {
  ReturnDisposition,
  ReturnReason,
  ReturnResolution,
  TicketSource,
} from "./return-reasons.js";

export interface ReturnRecordLine {
  saleLineId: string;
  productName: string;
  saleUnit: SaleUnit;
  quantity: number;
  reason: ReturnReason;
  disposition: ReturnDisposition;
  resolution: ReturnResolution;
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

interface ReturnsTotals {
  returns: number;
  refunded: number;
}

export interface ReturnsGroup {
  rows: ReturnRow[];
  totals: ReturnsTotals;
}

function newestFirst(a: ReturnRow, b: ReturnRow): number {
  return (
    b.occurredAt.getTime() - a.occurredAt.getTime() || compareCodeUnits(a.returnId, b.returnId)
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

interface ReportPerson {
  id: string;
  name: string | null;
}

export interface VoidedSaleRecord {
  sale: ReturnRecord["sale"];
  voidedAt: Date;
  register: { id: string; name: string };
  cashier: ReportPerson | null;
  authorizer: ReportPerson | null;
  total: number;
}

export interface VoidsGroup {
  rows: VoidedSaleRecord[];
  totals: { voids: number; voided: number };
}

export interface ReturnsReportTotals {
  voids: number;
  voided: number;
  returns: number;
  refunded: number;
  refundedLines: number;
  exchangedLines: number;
  typedReturns: number;
}

export interface CashierReturnsAndVoids extends ReturnsReportTotals {
  cashier: ReportPerson | null;
}

export interface AuthorizerReturnsAndVoids extends ReturnsReportTotals {
  authorizer: ReportPerson | null;
}

export function voidedSalesGroup(records: readonly VoidedSaleRecord[]): VoidsGroup {
  const rows = [...records].sort(
    (a, b) => b.voidedAt.getTime() - a.voidedAt.getTime() || compareCodeUnits(a.sale.id, b.sale.id),
  );
  return {
    rows,
    totals: { voids: rows.length, voided: rows.reduce((sum, row) => sum + row.total, 0) },
  };
}

export function returnsReportTotals(
  returns: readonly ReturnRecord[],
  voids: readonly VoidedSaleRecord[],
): ReturnsReportTotals {
  const lines = returns.flatMap((record) => record.lines);
  return {
    voids: voids.length,
    voided: voids.reduce((sum, record) => sum + record.total, 0),
    returns: returns.length,
    refunded: lines.reduce((sum, line) => sum + line.refunded, 0),
    refundedLines: lines.filter((line) => line.resolution === "refund").length,
    exchangedLines: lines.filter((line) => line.resolution === "exchange").length,
    typedReturns: returns.filter((record) => record.ticketSource === "TYPED").length,
  };
}

function personOrder(a: ReportPerson | null, b: ReportPerson | null): number {
  if (a === null || b === null) {
    return Number(a === null) - Number(b === null);
  }
  if (a.name === null || b.name === null) {
    return Number(a.name === null) - Number(b.name === null) || compareCodeUnits(a.id, b.id);
  }
  return compareCodeUnits(a.name, b.name) || compareCodeUnits(a.id, b.id);
}

function summarizedBy(
  returns: readonly ReturnRecord[],
  voids: readonly VoidedSaleRecord[],
  returnPerson: (record: ReturnRecord) => ReportPerson | null,
  voidPerson: (record: VoidedSaleRecord) => ReportPerson | null,
): { person: ReportPerson | null; totals: ReturnsReportTotals }[] {
  const people = new Map<string | null, ReportPerson | null>();
  const note = (person: ReportPerson | null) => {
    people.set(person === null ? null : person.id, person);
  };
  for (const record of returns) note(returnPerson(record));
  for (const record of voids) note(voidPerson(record));
  const idOf = (person: ReportPerson | null) => (person === null ? null : person.id);
  return [...people.values()]
    .map((person) => ({
      person,
      totals: returnsReportTotals(
        returns.filter((record) => idOf(returnPerson(record)) === idOf(person)),
        voids.filter((record) => idOf(voidPerson(record)) === idOf(person)),
      ),
    }))
    .sort((a, b) => personOrder(a.person, b.person));
}

export function voidsAndReturnsByCashier(
  returns: readonly ReturnRecord[],
  voids: readonly VoidedSaleRecord[],
): CashierReturnsAndVoids[] {
  return summarizedBy(
    returns,
    voids,
    (record) => record.cashier,
    (record) => record.cashier,
  ).map(({ person, totals }) => ({ cashier: person, ...totals }));
}

export function voidsAndReturnsByAuthorizer(
  returns: readonly ReturnRecord[],
  voids: readonly VoidedSaleRecord[],
): AuthorizerReturnsAndVoids[] {
  return summarizedBy(
    returns,
    voids,
    (record) => record.authorizer,
    (record) => record.authorizer,
  ).map(({ person, totals }) => ({ authorizer: person, ...totals }));
}
