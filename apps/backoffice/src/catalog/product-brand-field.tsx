import type { BrandSummary } from "@purosur/contracts";
import { Button, type Option, type Options, Select, sortedItems, textOrder } from "@purosur/ui";
import { Plus } from "lucide-react";
import { useFieldContext } from "../platform/cloud-form-context";
import { fieldErrorMessage } from "../platform/cloud-form-fields";
import { NO_BRAND } from "./product-form";

const NO_BRAND_OPTION: Option<string> = { value: NO_BRAND, label: "Sin marca" };
const INACTIVE_BRAND_HELP = "Marca dada de baja. No se ofrece para productos nuevos.";

const brandNameOrder = textOrder((brand: BrandSummary) => brand.name);

// A deactivated brand is only offered to the product that already carries it.
function brandOptions(brands: BrandSummary[], keptBrandId: string | null): Options<Option<string>> {
  const offered = brands.filter((brand) => brand.active || brand.id === keptBrandId);
  return [
    NO_BRAND_OPTION,
    ...sortedItems(offered, { order: brandNameOrder, direction: "ascending" }).map((brand) => ({
      value: brand.id,
      label: brand.name,
    })),
  ];
}

export function withCreatedBrand(
  brands: BrandSummary[],
  created: BrandSummary | null,
): BrandSummary[] {
  return created && !brands.some((brand) => brand.id === created.id)
    ? [...brands, created]
    : brands;
}

type ProductBrandFieldProps = {
  brands: BrandSummary[];
  keptBrandId: string | null;
  onCreateBrand: () => void;
  disabled?: boolean;
};

export function ProductBrandField({
  brands,
  keptBrandId,
  onCreateBrand,
  disabled = false,
}: ProductBrandFieldProps) {
  const field = useFieldContext<string>();
  const chosen = brands.find((brand) => brand.id === field.state.value);
  return (
    <div className="flex flex-col items-start gap-2">
      <div className="w-full">
        <Select
          label="Marca"
          options={brandOptions(brands, keptBrandId)}
          value={field.state.value}
          onChange={field.handleChange}
          errorMessage={fieldErrorMessage(field.state.meta.errors)}
          {...(chosen && !chosen.active ? { description: INACTIVE_BRAND_HELP } : {})}
        />
      </div>
      <Button variant="secondary" icon={<Plus />} disabled={disabled} onPress={onCreateBrand}>
        Nueva marca
      </Button>
    </div>
  );
}
