export function completedSaleId(outcome: { kind: string }): string | undefined {
  return outcome.kind === "completed" && "sale_id" in outcome && typeof outcome.sale_id === "string"
    ? outcome.sale_id
    : undefined;
}
