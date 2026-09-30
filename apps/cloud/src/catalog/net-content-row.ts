import type { NetContentUnit } from "@purosur/domain";
import type { CatalogNetContent } from "@purosur/domain/catalog/use-cases";

export function netContentRow(row: {
  netContentQuantity: number | null;
  netContentUnit: string | null;
}): CatalogNetContent | null {
  if (row.netContentQuantity === null || row.netContentUnit === null) {
    return null;
  }
  return { quantity: row.netContentQuantity, unit: row.netContentUnit as NetContentUnit };
}
