import type { PricesPastReviewDeadlineReportBody } from "@purosur/contracts";

export const REASON_TEXT: Record<
  PricesPastReviewDeadlineReportBody["prices"][number]["reason"],
  string
> = {
  overdue: "Plazo vencido",
  postponed: "Postergado en una compra",
  never_reviewed: "Nunca revisado",
};
