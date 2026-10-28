import { roundHalfUp } from "../../shared/index.js";
import type { IssuedDocumentKind, IssuedDocumentState } from "./issued-fiscal-document.js";

export const COUNTED_AS_ISSUED_STATE: IssuedDocumentState = "authorized";

export const ISSUED_AUTHORIZATION_KINDS = ["cae", "caea"] as const;
type IssuedAuthorizationKind = (typeof ISSUED_AUTHORIZATION_KINDS)[number];

const TENTHS_OF_A_PERCENT = 1_000n;

export interface IssuedDocumentGroup {
  kind: IssuedDocumentKind;
  voucherType: number;
  pointOfSale: number;
  authorizationKind: IssuedAuthorizationKind;
  count: number;
  amount: number;
}

export type IssuedDocumentsReportRow = IssuedDocumentGroup;

interface CountAndAmount {
  count: number;
  amount: number;
}

export interface IssuedDocumentsReportTotals {
  receipts: CountAndAmount;
  creditNotes: CountAndAmount;
  amount: number;
  contingency: { count: number; shareTenthsOfPercent: number | null };
}

export interface IssuedDocumentsReport {
  rows: IssuedDocumentsReportRow[];
  totals: IssuedDocumentsReportTotals;
}

function byVoucherPointOfSaleAndAuthorization(
  a: IssuedDocumentsReportRow,
  b: IssuedDocumentsReportRow,
): number {
  return (
    a.voucherType - b.voucherType ||
    a.pointOfSale - b.pointOfSale ||
    ISSUED_AUTHORIZATION_KINDS.indexOf(a.authorizationKind) -
      ISSUED_AUTHORIZATION_KINDS.indexOf(b.authorizationKind)
  );
}

function totalOf(rows: readonly IssuedDocumentsReportRow[]): CountAndAmount {
  return {
    count: rows.reduce((sum, row) => sum + row.count, 0),
    amount: rows.reduce((sum, row) => sum + row.amount, 0),
  };
}

function contingencyOf(rows: readonly IssuedDocumentsReportRow[]) {
  const count = totalOf(rows.filter((row) => row.authorizationKind === "caea")).count;
  const issued = totalOf(rows).count;
  return {
    count,
    shareTenthsOfPercent:
      issued === 0
        ? null
        : roundHalfUp({
            numerator: BigInt(count) * TENTHS_OF_A_PERCENT,
            denominator: BigInt(issued),
          }),
  };
}

export function issuedFiscalDocumentsReport(
  groups: readonly IssuedDocumentGroup[],
): IssuedDocumentsReport {
  const rows = groups
    .map((group) => ({
      ...group,
      amount: group.kind === "credit_note" ? -group.amount : group.amount,
    }))
    .sort(byVoucherPointOfSaleAndAuthorization);
  const receipts = totalOf(rows.filter((row) => row.kind === "receipt"));
  const creditNotes = totalOf(rows.filter((row) => row.kind === "credit_note"));
  return {
    rows,
    totals: {
      receipts,
      creditNotes,
      amount: receipts.amount + creditNotes.amount,
      contingency: contingencyOf(rows),
    },
  };
}
