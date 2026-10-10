export function completedSaleId(outcome: { kind: string }): string | undefined {
  if (outcome.kind === "already_paid" && "settlement" in outcome) {
    const settlement = outcome.settlement;
    return typeof settlement === "object" && settlement !== null && "kind" in settlement
      ? completedSaleId(settlement as { kind: string })
      : undefined;
  }
  return outcome.kind === "completed" && "sale_id" in outcome && typeof outcome.sale_id === "string"
    ? outcome.sale_id
    : undefined;
}
