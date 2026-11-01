import type { SaleUnit } from "@purosur/domain";
import { TextField } from "@purosur/ui";
import { quantityFieldKind } from "../platform/stock-quantity";

type PackageCountInputsProps = {
  saleUnit: SaleUnit;
  packages: string;
  quantityPerPackage: string;
  onPackagesChange: (packages: string) => void;
  onQuantityPerPackageChange: (quantityPerPackage: string) => void;
};

export function PackageCountInputs({
  saleUnit,
  packages,
  quantityPerPackage,
  onPackagesChange,
  onQuantityPerPackageChange,
}: PackageCountInputsProps) {
  return (
    <div className="flex items-start gap-4">
      <div className="min-w-0 flex-1">
        <TextField
          kind="plain-text"
          label="Cantidad de paquetes"
          value={packages}
          onChange={onPackagesChange}
          required
        />
      </div>
      <div className="min-w-0 flex-1">
        <TextField
          {...quantityFieldKind(saleUnit)}
          label="Cantidad por paquete"
          value={quantityPerPackage}
          onChange={onQuantityPerPackageChange}
          required
        />
      </div>
    </div>
  );
}
