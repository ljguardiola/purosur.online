import type { FoundProduct } from "@purosur/contracts";

export type ProductToAdd = Omit<FoundProduct, "matches">;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function productToAddFrom(value: unknown): ProductToAdd | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const { product_id, name, sale_unit, unit_price } = value;
  if (
    typeof product_id !== "string" ||
    typeof name !== "string" ||
    (sale_unit !== "UNIT" && sale_unit !== "KG") ||
    (unit_price !== null && typeof unit_price !== "number")
  ) {
    return undefined;
  }
  return { product_id, name, sale_unit, unit_price };
}
