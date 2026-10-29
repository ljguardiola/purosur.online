import type { BrandSummary, ProductSummary } from "@purosur/contracts";
import { formatProductDescription } from "@purosur/ui/formatters";

export function productDescription(
  product: Pick<ProductSummary, "name" | "brandId" | "netContent">,
  brands: readonly Pick<BrandSummary, "id" | "name">[],
): string {
  return formatProductDescription({
    name: product.name,
    brandName: brands.find((brand) => brand.id === product.brandId)?.name ?? null,
    netContent: product.netContent,
  });
}
