export type InvariantBreak =
  | "approved_payments_below_total"
  | "refunds_do_not_match_payments"
  | "stock_movements_do_not_match_lines";

export interface EventInvariantBreaks {
  eventId: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  breaks: InvariantBreak[];
}
