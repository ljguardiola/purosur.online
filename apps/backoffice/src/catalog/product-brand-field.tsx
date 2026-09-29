import type { BrandSummary } from "@purosur/contracts";
import { type Option, type Options, sortedItems, textOrder } from "@purosur/ui";
import { NO_BRAND } from "./product-form";

const NO_BRAND_OPTION: Option<string> = { value: NO_BRAND, label: "Sin marca" };
const INACTIVE_BRAND_HELP = "Marca dada de baja. No se ofrece para productos nuevos.";

const brandNameOrder = textOrder((brand: BrandSummary) => brand.name);

export function brandOptions(
  brands: BrandSummary[],
  keptBrandId: string | null,
): Options<Option<string>> {
  const offered = brands.filter((brand) => brand.active || brand.id === keptBrandId);
  return [
    NO_BRAND_OPTION,
    ...sortedItems(offered, { order: brandNameOrder, direction: "ascending" }).map((brand) => ({
      value: brand.id,
      label: brand.name,
    })),
  ];
}

export function brandFieldHelp(
  brands: BrandSummary[],
  brandId: string,
): { description: string } | Record<string, never> {
  const chosen = brands.find((brand) => brand.id === brandId);
  return chosen && !chosen.active ? { description: INACTIVE_BRAND_HELP } : {};
}

export function withCreatedBrand(
  brands: BrandSummary[],
  created: BrandSummary | null,
): BrandSummary[] {
  return created && !brands.some((brand) => brand.id === created.id)
    ? [...brands, created]
    : brands;
}
