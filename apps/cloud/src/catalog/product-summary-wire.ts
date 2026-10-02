import type { ProductSummary } from "@purosur/contracts";
import { productLabelCode } from "@purosur/domain";
import type { CatalogProduct } from "@purosur/domain/catalog/use-cases";

export function toProductSummary(product: CatalogProduct): ProductSummary {
  return { ...product, labelCode: productLabelCode(product) };
}
