import type { ReturnsReportBody } from "@purosur/contracts";
import { UNIDENTIFIED } from "./returns-text";

type Person = { id: string; name: string | null };

export type PersonSummaryRow = ReturnsReportBody["totals"] & { id: string; label: string };

const NO_AUTHORIZER = "Sin autorización";
const NO_PERSON_ID = "none";

function summaryRow(person: Person, figures: ReturnsReportBody["totals"]): PersonSummaryRow {
  return { ...figures, id: person.id, label: person.name ?? UNIDENTIFIED };
}

export function cashierSummaryRows(body: ReturnsReportBody): PersonSummaryRow[] {
  return body.by_cashier.map(({ cashier, ...figures }) => summaryRow(cashier, figures));
}

export function authorizerSummaryRows(body: ReturnsReportBody): PersonSummaryRow[] {
  return body.by_authorizer.map(({ authorizer, ...figures }) =>
    authorizer === null
      ? { ...figures, id: NO_PERSON_ID, label: NO_AUTHORIZER }
      : summaryRow(authorizer, figures),
  );
}
