import type { StockProduct } from "@purosur/contracts";
import type { SaleUnit } from "@purosur/domain";
import { sortedItems, textOrder } from "@purosur/ui";

const productNameOrder = textOrder((product: StockProduct) => product.name);

type ProductOption = { value: string; label: string };

export function productOptions(
  products: readonly StockProduct[],
): [ProductOption, ...ProductOption[]] | undefined {
  const [first, ...rest] = sortedItems(products, {
    order: productNameOrder,
    direction: "ascending",
  }).map((product) => ({ value: product.id, label: product.name }));
  return first && [first, ...rest];
}

export function quantityFieldKind(saleUnit: SaleUnit) {
  return { kind: "plain-text" as const, suffix: saleUnit === "KG" ? "kg" : "u" };
}

export function quantityMessage(saleUnit: SaleUnit): string {
  return saleUnit === "KG"
    ? "Escribí los kilos con coma para los decimales, hasta 3, por ejemplo 12,150."
    : "Escribí una cantidad entera de unidades, por ejemplo 16.";
}
