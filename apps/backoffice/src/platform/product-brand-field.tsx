import type { BrandSummary } from "@purosur/contracts";
import { Button, type Option, type Options, sortedItems, textOrder } from "@purosur/ui";
import { Plus } from "lucide-react";
import { type ReactNode, useState } from "react";
import { useMarkCatalogStale, useRefreshCatalog } from "./catalog-queries";
import { NO_BRAND } from "./product-form";

const NO_BRAND_OPTION: Option<string> = { value: NO_BRAND, label: "Sin marca" };
const INACTIVE_BRAND_STATUS = "Inactiva";
const INACTIVE_BRAND_HELP = "Marca dada de baja. No se ofrece para productos nuevos.";

const brandNameOrder = textOrder((brand: BrandSummary) => brand.name);

export function brandOptions(
  brands: BrandSummary[],
  keptBrandId: string | null,
): Options<Option<string>> {
  const offered = brands.filter((brand) => brand.active || brand.id === keptBrandId);
  return [
    NO_BRAND_OPTION,
    ...sortedItems(offered, { order: brandNameOrder, direction: "ascending" }).map((brand) =>
      brand.active
        ? { value: brand.id, label: brand.name }
        : { value: brand.id, label: brand.name, status: INACTIVE_BRAND_STATUS },
    ),
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

type StackedBrandCreation = {
  open: boolean;
  created: BrandSummary | null;
  start: () => void;
  reset: () => void;
  close: () => void;
  select: (brand: BrandSummary) => void;
  finish: () => void;
};

// The brand modal opens over the product form, which stays mounted with everything typed in it.
// Reading the catalog again while that form is open could fail and close it, so the brand it
// creates is kept here and the catalog is only read again once the form closes.
export function useStackedBrandCreation(
  chooseBrand: (brandId: string) => void,
): StackedBrandCreation {
  const markCatalogStale = useMarkCatalogStale();
  const refreshCatalog = useRefreshCatalog();
  const [open, setOpen] = useState(false);
  const [created, setCreated] = useState<BrandSummary | null>(null);
  return {
    open,
    created,
    start: () => setOpen(true),
    reset: () => {
      setOpen(false);
      setCreated(null);
    },
    close: () => setOpen(false),
    select: (brand) => {
      setCreated(brand);
      chooseBrand(brand.id);
      setOpen(false);
      void markCatalogStale();
    },
    finish: () => {
      if (created) {
        void refreshCatalog();
      }
    },
  };
}

export function BrandFieldWithCreation({
  select,
  onCreateBrand,
  disabled,
}: {
  select: ReactNode;
  onCreateBrand: () => void;
  disabled: boolean;
}) {
  return (
    <div className="flex flex-col items-start gap-2">
      <div className="w-full">{select}</div>
      <Button variant="secondary" icon={<Plus />} disabled={disabled} onPress={onCreateBrand}>
        Nueva marca
      </Button>
    </div>
  );
}
