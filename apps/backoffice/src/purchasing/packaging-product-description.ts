import type { PackagingSummary } from "@purosur/contracts";
import { formatProductDescription } from "@purosur/ui/formatters";

export function packagingProductDescription({
  productName,
  brandName,
  netContent,
}: Pick<PackagingSummary, "productName" | "brandName" | "netContent">): string {
  return formatProductDescription({ name: productName, brandName, netContent });
}
