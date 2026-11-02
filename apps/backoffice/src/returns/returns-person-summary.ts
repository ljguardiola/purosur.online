import type { ReturnsReportBody } from "@purosur/contracts";
import { NO_CASHIER, UNIDENTIFIED } from "./returns-text";

type Person = { id: string; name: string | null } | null;

export type PersonSummaryRow = ReturnsReportBody["totals"] & { id: string; label: string };

const NO_AUTHORIZER = "Sin autorización";
const NO_PERSON_ID = "none";

function summaryRow(
  person: Person,
  figures: ReturnsReportBody["totals"],
  missingLabel: string,
): PersonSummaryRow {
  return {
    ...figures,
    id: person?.id ?? NO_PERSON_ID,
    label: person === null ? missingLabel : (person.name ?? UNIDENTIFIED),
  };
}

export function cashierSummaryRows(body: ReturnsReportBody): PersonSummaryRow[] {
  return body.by_cashier.map(({ cashier, ...figures }) => summaryRow(cashier, figures, NO_CASHIER));
}

export function authorizerSummaryRows(body: ReturnsReportBody): PersonSummaryRow[] {
  return body.by_authorizer.map(({ authorizer, ...figures }) =>
    summaryRow(authorizer, figures, NO_AUTHORIZER),
  );
}
