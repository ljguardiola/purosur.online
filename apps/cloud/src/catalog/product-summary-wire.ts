import type { ListedProduct, ProductSummary } from "@purosur/contracts";
import { ean13Modules, productLabelCode } from "@purosur/domain";
import type { CatalogProduct } from "@purosur/domain/catalog/use-cases";

export function toProductSummary(product: CatalogProduct): ProductSummary {
  const labelCode = productLabelCode(product);
  return {
    ...product,
    labelCode,
    labelModules: labelCode === null ? null : ean13Modules(labelCode),
  };
}

export function toListedProduct(
  product: CatalogProduct,
  currentUnitPrices: ReadonlyMap<string, number>,
): ListedProduct {
  return {
    ...toProductSummary(product),
    currentUnitPrice: currentUnitPrices.get(product.id) ?? null,
  };
}
