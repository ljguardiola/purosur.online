import type { SaleUnit } from "@purosur/domain";
import { formatNumber, parseWeightQuantity } from "@purosur/ui";
import { parseStockQuantity, quantityMessage } from "../platform/stock-quantity";

export type SupplierItemQuantityUnit = "KG" | "G";

export interface SupplierItemQuantityInput {
  quantity: string;
  saleUnit: SaleUnit;
  quantityUnit: SupplierItemQuantityUnit;
}

const THOUSANDTHS_PER_KILO = 1_000;

export const SUPPLIER_ITEM_QUANTITY_UNIT_OPTIONS = [
  { value: "KG", label: "kg" },
  { value: "G", label: "g" },
] as const;

export function supplierItemQuantityOf({
  quantity,
  saleUnit,
  quantityUnit,
}: SupplierItemQuantityInput): number {
  const thousandths =
    saleUnit === "KG"
      ? parseWeightQuantity(quantity, quantityUnit)
      : parseStockQuantity(quantity, "UNIT");
  return thousandths ?? Number.NaN;
}

export function supplierItemQuantityInputOf(
  thousandths: number,
  saleUnit: SaleUnit,
): Pick<SupplierItemQuantityInput, "quantity" | "quantityUnit"> {
  if (saleUnit === "UNIT") {
    return {
      quantity: formatNumber(thousandths / THOUSANDTHS_PER_KILO, { maximumFractionDigits: 0 }),
      quantityUnit: "KG",
    };
  }
  return thousandths < THOUSANDTHS_PER_KILO
    ? { quantity: formatNumber(thousandths), quantityUnit: "G" }
    : {
        quantity: formatNumber(thousandths / THOUSANDTHS_PER_KILO, { maximumFractionDigits: 3 }),
        quantityUnit: "KG",
      };
}

export function supplierItemQuantityFieldKind(
  saleUnit: SaleUnit,
  quantityUnit: SupplierItemQuantityUnit,
) {
  if (saleUnit === "UNIT") {
    return { kind: "plain-text" as const, suffix: "u" };
  }
  return quantityUnit === "G"
    ? { kind: "plain-text" as const, suffix: "g", inputMode: "numeric" as const }
    : { kind: "plain-text" as const, suffix: "kg", inputMode: "decimal" as const };
}

export function supplierItemQuantityMessage({
  quantity,
  saleUnit,
  quantityUnit,
}: SupplierItemQuantityInput): string {
  if (quantity.trim() === "") {
    return "Ingresá la cantidad que trae el ítem.";
  }
  return saleUnit === "KG" && quantityUnit === "G"
    ? "Escribí los gramos como un número entero, por ejemplo 500."
    : quantityMessage(saleUnit);
}
