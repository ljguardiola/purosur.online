import type { PurchaseLineQuantityCorrectionBody, PurchaseSummary } from "@purosur/contracts";
import type { SaleUnit } from "@purosur/domain";
import { formatNumber } from "@purosur/ui";
import {
  formatStockQuantityInput,
  parseStockQuantity,
  quantityMessage,
} from "../platform/stock-quantity";
import { packageCountOf } from "./package-count-form";

type QuantityLine = Pick<PurchaseSummary["lines"][number], "packages" | "quantity" | "product">;

type QuantityShape = { packages: number | null; product: { saleUnit: SaleUnit } };

export type PurchaseLineQuantityValues = { amount: string };

export const EMPTY_PURCHASE_LINE_QUANTITY: PurchaseLineQuantityValues = { amount: "" };

export function purchaseLineQuantityValuesOf(line: QuantityLine): PurchaseLineQuantityValues {
  return {
    amount:
      line.packages === null
        ? formatStockQuantityInput(line.quantity, line.product.saleUnit)
        : formatNumber(line.packages),
  };
}

export function purchaseLineQuantityRequestFrom(
  { amount }: PurchaseLineQuantityValues,
  line: QuantityShape,
): PurchaseLineQuantityCorrectionBody {
  return line.packages === null
    ? {
        loadedBy: "quantity",
        quantity: parseStockQuantity(amount, line.product.saleUnit) ?? Number.NaN,
      }
    : { loadedBy: "packages", packages: packageCountOf(amount) };
}

export function purchaseLineQuantityLabel(line: Pick<QuantityLine, "packages">): string {
  return line.packages === null ? "Cantidad" : "Cantidad de paquetes";
}

export const PURCHASE_LINE_QUANTITY_FIELDS = {
  loadedBy: "amount",
  packages: "amount",
  quantity: "amount",
} as const;

function packagesMessage({ amount }: PurchaseLineQuantityValues): string {
  const packages = packageCountOf(amount);
  if (Number.isNaN(packages)) {
    return "Ingresá cuántos paquetes recibiste, en un número entero.";
  }
  return packages < 1
    ? "Ingresá cuántos paquetes recibiste, en un número entero mayor a cero."
    : "Ingresá menos paquetes; son más de los que se pueden registrar.";
}

export function purchaseLineQuantityMessages(line: QuantityShape): {
  amount: (values: PurchaseLineQuantityValues) => string;
} {
  const saleUnitMessage = quantityMessage(line.product.saleUnit);
  return { amount: line.packages === null ? () => saleUnitMessage : packagesMessage };
}
