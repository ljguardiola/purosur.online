import type { OpenSale } from "@purosur/contracts";

export function changedLineId(before: OpenSale | null, after: OpenSale): string | undefined {
  const quantityBefore = new Map(before?.lines.map((line) => [line.id, line.quantity]));
  return after.lines.find((line) => quantityBefore.get(line.id) !== line.quantity)?.id;
}
