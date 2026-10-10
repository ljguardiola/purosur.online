export function completedSaleId(outcome: { kind: string }): string | undefined {
  return saleIdOf(outcome);
}

function saleIdOf(outcome: object): string | undefined {
  if (!("kind" in outcome)) {
    return undefined;
  }
  if (
    outcome.kind === "already_paid" &&
    "settlement" in outcome &&
    typeof outcome.settlement === "object" &&
    outcome.settlement !== null
  ) {
    return saleIdOf(outcome.settlement);
  }
  return outcome.kind === "completed" && "sale_id" in outcome && typeof outcome.sale_id === "string"
    ? outcome.sale_id
    : undefined;
}
